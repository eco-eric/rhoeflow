-- Down for 20261107130000_rhoe_county_detail. Drops the import log and the added county columns.
drop table if exists rhoe.county_imports;
drop index if exists rhoe.county_property_street_idx;
alter table rhoe.county_property
  drop column if exists situs_street,
  drop column if exists garage_raw,
  drop column if exists exterior_raw,
  drop column if exists roof_raw,
  drop column if exists cooling_raw,
  drop column if exists heating_raw,
  drop column if exists situs_zip;
