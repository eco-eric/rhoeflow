-- Down for 20261103120000_rhoe_jobs_archive. Archived jobs come back as ordinary jobs.
drop index if exists rhoe.jobs_account_archived_idx;
alter table rhoe.jobs drop column if exists search_text;
alter table rhoe.jobs drop constraint if exists jobs_archived_by_needs_archived_at;
alter table rhoe.jobs drop column if exists archived_by;
alter table rhoe.jobs drop column if exists archived_at;
