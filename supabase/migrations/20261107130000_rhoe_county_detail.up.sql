-- County appraisal records, more detail and a second way to match (ADR-048, owner 2026-11-07
-- "Start the county data"). The Dallas and Tarrant importers (tools/county-import) fill
-- rhoe.county_property from the appraisal districts' own downloads. This adds what those files
-- carry beyond the first columns (ZIP, heating and cooling wording, roof, exterior walls, garage)
-- and a street-only key, so a house still matches when the city a tech typed is the post office's
-- name and the county files it under the city it sits in ("Fort Worth" vs "Haltom City").
-- Still no owner names, values or taxes.

alter table rhoe.county_property
  add column situs_zip    text check (situs_zip is null or situs_zip ~ '^[0-9]{5}$'),
  add column heating_raw  text check (heating_raw is null or length(heating_raw) <= 120),
  add column cooling_raw  text check (cooling_raw is null or length(cooling_raw) <= 120),
  add column roof_raw     text check (roof_raw is null or length(roof_raw) <= 120),
  add column exterior_raw text check (exterior_raw is null or length(exterior_raw) <= 120),
  add column garage_raw   text check (garage_raw is null or length(garage_raw) <= 120),
  -- The street part of situs_key ("123 N MAIN ST"), for the street-and-ZIP match.
  add column situs_street text generated always as (split_part(situs_key, '|', 1)) stored;
create index county_property_street_idx on rhoe.county_property (situs_street);

-- One row per load: which file, its SHA-256, how many rows. The owner's record of where the county
-- data came from (PRV-001); the app doesn't read it.
create table rhoe.county_imports (
  import_id     bigint generated always as identity primary key,
  county        text not null check (county in ('dallas', 'tarrant', 'collin', 'denton')),
  roll_year     smallint not null check (roll_year between 1990 and 2100),
  source_url    text not null check (length(source_url) between 1 and 500),
  file_sha256   text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  rows_loaded   integer not null check (rows_loaded >= 0),
  rows_replaced integer not null check (rows_replaced >= 0),
  loaded_at     timestamptz not null default now()
);
alter table rhoe.county_imports enable row level security;
alter table rhoe.county_imports force row level security;
-- No policies and no grants: only the database owner (the import job) reads or writes it.
