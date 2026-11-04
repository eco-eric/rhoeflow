-- House facts for a job's address (ADR-043, owner 2026-11-04). When a job is opened, RhoeFlow looks
-- the house up once: RentCast's property record, then the county appraisal district's own record
-- where RhoeFlow has imported that county. Only facts that bear on a load calc are kept: no price,
-- value, tax, sale history or owner names.

-- ---------------------------------------------------------------------------------------------
-- job_sites: one row per job, the lookup's readings and the lot's location. Per account (RLS).
-- ---------------------------------------------------------------------------------------------
create table rhoe.job_sites (
  job_id           uuid primary key references rhoe.jobs (job_id),
  account_id       text not null references rhoe.accounts (account_id),
  lat              double precision check (lat is null or lat between -90 and 90),
  lon              double precision check (lon is null or lon between -180 and 180),
  location_source  text check (location_source is null or location_source in ('rentcast', 'ors')),
  -- Each source's reading (source, record id, date, kept fields only); merged when read.
  readings         jsonb not null default '[]'::jsonb check (jsonb_typeof(readings) = 'array' and jsonb_array_length(readings) <= 5),
  lookup_status    text not null check (lookup_status in ('found', 'not_found', 'error', 'off')),
  lookup_note      text check (lookup_note is null or length(lookup_note) <= 300),
  looked_up_at     timestamptz not null,
  updated_at       timestamptz not null default now(),
  check ((lat is null) = (lon is null))
);
create index job_sites_account_idx on rhoe.job_sites (account_id);

-- A site row belongs to a job of its own account. Runs as the caller, so another account's job is
-- invisible here and refused (the foreign key alone ignores row-level security).
create or replace function rhoe.job_site_job_matches() returns trigger
language plpgsql
as $$
declare
  job_account text;
begin
  select account_id into job_account from rhoe.jobs where job_id = new.job_id;
  if job_account is null or job_account <> new.account_id then
    raise exception 'job site account % does not match job % account', new.account_id, new.job_id;
  end if;
  if tg_op = 'UPDATE' and (new.account_id <> old.account_id or new.job_id <> old.job_id) then
    raise exception 'job site identity is immutable';
  end if;
  return new;
end;
$$;
create trigger job_sites_job_account before insert or update on rhoe.job_sites for each row execute function rhoe.job_site_job_matches();

alter table rhoe.job_sites enable row level security;
alter table rhoe.job_sites force row level security;
create policy job_sites_select on rhoe.job_sites for select to authenticated using (account_id = rhoe.current_account_id());
create policy job_sites_insert on rhoe.job_sites for insert to authenticated with check (account_id = rhoe.current_account_id());
create policy job_sites_update on rhoe.job_sites for update to authenticated using (account_id = rhoe.current_account_id()) with check (account_id = rhoe.current_account_id());
grant select, insert, update on rhoe.job_sites to authenticated;

-- ---------------------------------------------------------------------------------------------
-- county_property: appraisal district residential records. Public records, the same for every
-- account: signed-in people may read them; only the owner loads them (tools/county-import), as the
-- database owner in the SQL editor. No owner names, values or taxes are imported.
-- ---------------------------------------------------------------------------------------------
create table rhoe.county_property (
  county           text not null check (county in ('dallas', 'tarrant', 'collin', 'denton')),
  account_num      text not null check (length(account_num) between 1 and 40),
  roll_year        smallint not null check (roll_year between 1990 and 2100),
  situs_key        text not null check (length(situs_key) between 3 and 240),
  situs_address    text not null check (length(situs_address) between 1 and 200),
  city             text check (city is null or length(city) <= 100),
  year_built       smallint check (year_built is null or year_built between 1700 and 2100),
  living_area_ft2  integer check (living_area_ft2 is null or living_area_ft2 between 100 and 100000),
  stories          numeric(3, 1) check (stories is null or stories between 1 and 10),
  foundation_raw   text check (foundation_raw is null or length(foundation_raw) <= 120),
  garage_spaces    smallint check (garage_spaces is null or garage_spaces between 0 and 50),
  bedrooms         smallint check (bedrooms is null or bedrooms between 0 and 50),
  pool             boolean,
  central_heat     boolean,
  central_air      boolean,
  loaded_at        timestamptz not null default now(),
  primary key (county, account_num)
);
create index county_property_situs_idx on rhoe.county_property (situs_key);

alter table rhoe.county_property enable row level security;
alter table rhoe.county_property force row level security;
create policy county_property_select on rhoe.county_property for select to authenticated using (true);
grant select on rhoe.county_property to authenticated;
-- No insert, update or delete for authenticated: the app only reads county records.
