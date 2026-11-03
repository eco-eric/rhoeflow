-- Archive and search for RhoeFlow's own jobs (ADR-042, owner 2026-11-03). An archived job leaves
-- the home list but is never deleted: it can be found under Archived, opened and brought back.
-- Search matches every word the tech types against the job name, customer and address.

alter table rhoe.jobs add column archived_at timestamptz;
alter table rhoe.jobs add column archived_by text;
alter table rhoe.jobs add constraint jobs_archived_by_needs_archived_at check (archived_by is null or archived_at is not null);

-- Lower-cased name, customer and address in one column, so a search is one case-insensitive
-- substring match per word. Generated, never written by the app; the app never selects it.
alter table rhoe.jobs add column search_text text generated always as (
  lower(
    coalesce(name, '') || ' ' || coalesce(customer_name, '') || ' ' || coalesce(address_line1, '') || ' ' ||
    coalesce(address_line2, '') || ' ' || coalesce(city, '') || ' ' || coalesce(state, '') || ' ' || coalesce(postal_code, '')
  )
) stored;

-- Home lists active (or archived) jobs newest first within an account.
create index jobs_account_archived_idx on rhoe.jobs (account_id, (archived_at is null), created_at desc);
