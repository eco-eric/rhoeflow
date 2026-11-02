-- Down for 20261102120000_rhoe_jobs. Puts back the WorkEdge-only shape: refuses if any assessment
-- has no WorkEdge job, because the old shape cannot hold it.
do $$
begin
  if exists (select 1 from rhoe.assessments where workedge_project_id is null or workedge_property_id is null) then
    raise exception 'assessments started in RhoeFlow have no WorkEdge job; the WorkEdge-only shape cannot hold them';
  end if;
end;
$$;

create or replace function rhoe.assessments_guard() returns trigger
language plpgsql
as $$
begin
  if new.account_id <> old.account_id or new.assessment_id <> old.assessment_id then
    raise exception 'assessment identity is immutable';
  end if;
  if new.workedge_project_id <> old.workedge_project_id or new.workedge_property_id <> old.workedge_property_id then
    raise exception 'an assessment cannot be re-pointed at another WorkEdge job (ADR-028)';
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

drop trigger if exists assessments_job_account on rhoe.assessments;
drop function if exists rhoe.assessment_job_matches();
drop index if exists rhoe.assessments_job_idx;
drop index if exists rhoe.assessments_one_open_per_job;
create unique index assessments_one_open_per_project on rhoe.assessments (workedge_project_id) where status = 'open';
alter table rhoe.assessments drop constraint if exists assessments_property_needs_project;
alter table rhoe.assessments alter column workedge_project_id set not null;
alter table rhoe.assessments alter column workedge_property_id set not null;
alter table rhoe.assessments drop column if exists job_id;

drop table if exists rhoe.jobs;
drop function if exists rhoe.jobs_guard();
