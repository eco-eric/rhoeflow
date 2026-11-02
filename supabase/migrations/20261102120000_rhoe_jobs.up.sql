-- RhoeFlow's own jobs (ADR-040, owner 2026-11-02). A load calc starts inside RhoeFlow from a
-- customer name and address; a WorkEdge link on the job is optional and, once made, never changes.
-- Every assessment belongs to one job, and there is one open assessment per job.
-- Amends 20261025120000_rhoe_core: assessments.workedge_project_id / workedge_property_id become
-- optional and follow the job's link.

create table rhoe.jobs (
  job_id                uuid primary key,
  account_id            text not null references rhoe.accounts (account_id),
  name                  text not null check (length(btrim(name)) between 1 and 200),
  customer_name         text check (customer_name is null or length(customer_name) <= 200),
  address_line1         text check (address_line1 is null or length(address_line1) <= 200),
  address_line2         text check (address_line2 is null or length(address_line2) <= 200),
  city                  text check (city is null or length(city) <= 100),
  state                 text check (state is null or length(state) <= 50),
  postal_code           text check (postal_code is null or length(postal_code) <= 20),
  workedge_project_id   text,
  workedge_property_id  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            text,
  check (workedge_property_id is null or workedge_project_id is not null)
);
create index jobs_account_idx on rhoe.jobs (account_id, created_at desc);
-- One RhoeFlow job per WorkEdge job within an account.
create unique index jobs_one_per_workedge_project on rhoe.jobs (account_id, workedge_project_id) where workedge_project_id is not null;

-- The account never changes; a WorkEdge link may be made once (null to a value) and never re-pointed.
create or replace function rhoe.jobs_guard() returns trigger
language plpgsql
as $$
begin
  if new.account_id <> old.account_id or new.job_id <> old.job_id then
    raise exception 'job identity is immutable';
  end if;
  if old.workedge_project_id is not null and new.workedge_project_id is distinct from old.workedge_project_id then
    raise exception 'a job linked to a WorkEdge job cannot be re-pointed (ADR-040)';
  end if;
  if old.workedge_property_id is not null and new.workedge_property_id is distinct from old.workedge_property_id then
    raise exception 'a job linked to a WorkEdge property cannot be re-pointed (ADR-040)';
  end if;
  return new;
end;
$$;
create trigger jobs_guard before update on rhoe.jobs for each row execute function rhoe.jobs_guard();

alter table rhoe.jobs enable row level security;
alter table rhoe.jobs force row level security;
create policy jobs_select on rhoe.jobs for select to authenticated using (account_id = rhoe.current_account_id());
create policy jobs_insert on rhoe.jobs for insert to authenticated with check (account_id = rhoe.current_account_id());
create policy jobs_update on rhoe.jobs for update to authenticated using (account_id = rhoe.current_account_id()) with check (account_id = rhoe.current_account_id());
grant select, insert, update on rhoe.jobs to authenticated;
-- No delete policy, like every other table.

-- ---------------------------------------------------------------------------------------------
-- assessments: belong to a job; the WorkEdge ids are optional and follow the job's link.
-- ---------------------------------------------------------------------------------------------
alter table rhoe.assessments add column job_id uuid references rhoe.jobs (job_id);

-- Existing assessments (made before ADR-040) each get a job linked to their WorkEdge project.
insert into rhoe.jobs (job_id, account_id, name, workedge_project_id, workedge_property_id, created_at, updated_at, created_by)
select gen_random_uuid(), a.account_id, 'WorkEdge job ' || a.workedge_project_id, a.workedge_project_id, min(a.workedge_property_id), min(a.created_at), min(a.created_at), min(a.created_by)
from rhoe.assessments a
group by a.account_id, a.workedge_project_id;
update rhoe.assessments a set job_id = j.job_id
from rhoe.jobs j
where j.account_id = a.account_id and j.workedge_project_id = a.workedge_project_id;

alter table rhoe.assessments alter column job_id set not null;
alter table rhoe.assessments alter column workedge_project_id drop not null;
alter table rhoe.assessments alter column workedge_property_id drop not null;
alter table rhoe.assessments add constraint assessments_property_needs_project check (workedge_property_id is null or workedge_project_id is not null);

-- An assessment must belong to a job of its own account. The foreign key alone would let a wrong
-- account in, because key checks ignore row-level security; this runs as the caller, so another
-- account's job is invisible here and refused.
create or replace function rhoe.assessment_job_matches() returns trigger
language plpgsql
as $$
declare
  job_account text;
begin
  select account_id into job_account from rhoe.jobs where job_id = new.job_id;
  if job_account is null or job_account <> new.account_id then
    raise exception 'assessment account % does not match job % account', new.account_id, new.job_id;
  end if;
  return new;
end;
$$;
create trigger assessments_job_account before insert on rhoe.assessments for each row execute function rhoe.assessment_job_matches();

drop index if exists rhoe.assessments_one_open_per_project;
create unique index assessments_one_open_per_job on rhoe.assessments (job_id) where status = 'open';
create index assessments_job_idx on rhoe.assessments (account_id, job_id);

-- An assessment's job never changes; its WorkEdge ids may be filled once (when the job is linked)
-- and never re-pointed.
create or replace function rhoe.assessments_guard() returns trigger
language plpgsql
as $$
begin
  if new.account_id <> old.account_id or new.assessment_id <> old.assessment_id or new.job_id <> old.job_id then
    raise exception 'assessment identity is immutable';
  end if;
  if (old.workedge_project_id is not null and new.workedge_project_id is distinct from old.workedge_project_id)
     or (old.workedge_property_id is not null and new.workedge_property_id is distinct from old.workedge_property_id) then
    raise exception 'an assessment cannot be re-pointed at another WorkEdge job (ADR-028, ADR-040)';
  end if;
  if new.revision < old.revision or new.revision > old.revision + 1 then
    raise exception 'revision must stay or grow by one (was %, got %)', old.revision, new.revision;
  end if;
  if new.draft_version < old.draft_version then
    raise exception 'draft_version never decreases';
  end if;
  return new;
end;
$$;
