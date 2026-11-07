-- Loads one county's rows (the CSV rhoe-county-import wrote) into rhoe.county_property, all or
-- nothing (ADR-048). Run as the database owner:
--
--   psql "$SUPABASE_DB_URL" -v county=dallas -v roll_year=2026 -v source_url=... -v sha256=... \
--     -f tools/county-import/load.sql < rows.csv
--
-- In one transaction: stage the rows, refuse a file with no rows, rows for another county, or
-- fewer than half the rows already loaded (a cut-off download; set -v allow_drop=yes to load it
-- anyway), then replace that county's rows and log the load in rhoe.county_imports.

\set ON_ERROR_STOP on
\if :{?allow_drop}
\else
  \set allow_drop no
\endif

begin;

select set_config('rhoe.import_allow_drop', :'allow_drop', true) \g /dev/null

create temp table county_stage (
  county          text,
  account_num     text,
  roll_year       smallint,
  situs_key       text,
  situs_address   text,
  city            text,
  situs_zip       text,
  year_built      smallint,
  living_area_ft2 integer,
  stories         numeric(3, 1),
  foundation_raw  text,
  garage_spaces   smallint,
  bedrooms        smallint,
  pool            boolean,
  central_heat    boolean,
  central_air     boolean,
  heating_raw     text,
  cooling_raw     text,
  roof_raw        text,
  exterior_raw    text,
  garage_raw      text
) on commit drop;

\copy county_stage from pstdin with (format csv, header true)

create temp table county_counts on commit drop as
select (select count(*) from rhoe.county_property where county = :'county') as old_n,
       (select count(*) from county_stage) as new_n,
       (select count(*) from county_stage where county is distinct from :'county') as other_n;

do $$
declare
  c record;
begin
  select * into c from county_counts;
  if c.new_n = 0 then
    raise exception 'county import: the file has no rows';
  end if;
  if c.other_n > 0 then
    raise exception 'county import: % rows are for another county', c.other_n;
  end if;
  if c.old_n > 0 and c.new_n * 2 < c.old_n and current_setting('rhoe.import_allow_drop') <> 'yes' then
    raise exception 'county import: % rows would replace %, fewer than half; check the download or set allow_drop=yes', c.new_n, c.old_n;
  end if;
end;
$$;

delete from rhoe.county_property where county = :'county';

insert into rhoe.county_property (
  county, account_num, roll_year, situs_key, situs_address, city, situs_zip, year_built,
  living_area_ft2, stories, foundation_raw, garage_spaces, bedrooms, pool, central_heat,
  central_air, heating_raw, cooling_raw, roof_raw, exterior_raw, garage_raw
)
select county, account_num, roll_year, situs_key, situs_address, city, situs_zip, year_built,
       living_area_ft2, stories, foundation_raw, garage_spaces, bedrooms, pool, central_heat,
       central_air, heating_raw, cooling_raw, roof_raw, exterior_raw, garage_raw
from county_stage;

insert into rhoe.county_imports (county, roll_year, source_url, file_sha256, rows_loaded, rows_replaced)
select :'county', :'roll_year'::smallint, :'source_url', :'sha256', new_n, old_n from county_counts;

select county, roll_year, rows_loaded, rows_replaced, loaded_at
from rhoe.county_imports order by import_id desc limit 1;

commit;
