-- Down for 20261105120000_rhoe_house_facts. Drops the house lookups and the imported county records.
drop table if exists rhoe.county_property;
drop trigger if exists job_sites_job_account on rhoe.job_sites;
drop table if exists rhoe.job_sites;
drop function if exists rhoe.job_site_job_matches();
