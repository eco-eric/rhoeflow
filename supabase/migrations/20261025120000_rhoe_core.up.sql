-- RhoeFlow core tables (WO-03 C1; ADR-028, ADR-013 data half, SEC-001, DAT-004, REV-001, REV-002).
--
-- Everything lives in schema `rhoe` so nothing can collide with WorkEdge in a shared Supabase
-- project and so `drop schema rhoe cascade` (the down script) touches nothing of WorkEdge's.
-- After applying: Dashboard -> Settings -> API -> "Exposed schemas": add `rhoe`.
--
-- There is NO table for a job, customer, property, photo file or user. Rows carry WorkEdge ids.
-- Row-level security filters every table on `workedge_team_id` = the team in the session JWT.

create schema if not exists rhoe;
grant usage on schema rhoe to authenticated;
-- No grants to anon: every read and write needs a signed-in session.

-- ---------------------------------------------------------------------------------------------
-- Identity: the one place that says where the team id comes from. A1 (R02) confirms the claim
-- path once WorkEdge publishes signing keys; until then this reads
-- app_metadata.workedge_team_id, falling back to a top-level workedge_team_id claim.
-- ---------------------------------------------------------------------------------------------
create or replace function rhoe.current_team_id() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'workedge_team_id',
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'workedge_team_id'
  );
$$;

create or replace function rhoe.current_user_id() returns text
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
$$;

-- ---------------------------------------------------------------------------------------------
-- assessments: the unit RhoeFlow owns. One open assessment per WorkEdge project.
-- ---------------------------------------------------------------------------------------------
create table rhoe.assessments (
  assessment_id         uuid primary key,
  workedge_team_id      text not null,
  workedge_project_id   text not null,
  workedge_property_id  text not null,
  workedge_customer_id  text,
  status                text not null check (status in ('open', 'closed')),
  revision              integer not null default 0 check (revision >= 0),
  draft                 jsonb,
  draft_version         integer not null default 1 check (draft_version >= 1),
  template_id           text,
  template_version      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            text
);
create unique index assessments_one_open_per_project on rhoe.assessments (workedge_project_id) where status = 'open';
create index assessments_team_idx on rhoe.assessments (workedge_team_id);
create index assessments_template_idx on rhoe.assessments (workedge_team_id, template_id);

-- revision grows by at most one per statement and never shrinks; the team anchor never changes.
create or replace function rhoe.assessments_guard() returns trigger
language plpgsql
as $$
begin
  if new.workedge_team_id <> old.workedge_team_id or new.assessment_id <> old.assessment_id then
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
create trigger assessments_guard before update on rhoe.assessments for each row execute function rhoe.assessments_guard();

-- ---------------------------------------------------------------------------------------------
-- assessment_revisions: accepted, validated snapshots. Immutable.
-- ---------------------------------------------------------------------------------------------
create table rhoe.assessment_revisions (
  assessment_id     uuid not null references rhoe.assessments (assessment_id),
  workedge_team_id  text not null,
  revision          integer not null check (revision >= 1),
  snapshot          jsonb not null,
  content_hash      text not null check (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  accepted_at       timestamptz not null default now(),
  accepted_by       text,
  primary key (assessment_id, revision)
);
create index assessment_revisions_team_idx on rhoe.assessment_revisions (workedge_team_id);

create or replace function rhoe.immutable_row() returns trigger
language plpgsql
as $$
begin
  raise exception '% rows are immutable (DAT-004, REV-001)', tg_table_name;
end;
$$;
create trigger assessment_revisions_immutable before update or delete on rhoe.assessment_revisions for each row execute function rhoe.immutable_row();

-- A revision must belong to its assessment's team (the FK alone would let a wrong team id in).
create or replace function rhoe.child_team_matches() returns trigger
language plpgsql
as $$
declare
  parent_team text;
begin
  select workedge_team_id into parent_team from rhoe.assessments where assessment_id = new.assessment_id;
  if parent_team is null or parent_team <> new.workedge_team_id then
    raise exception 'row team % does not match assessment % team', new.workedge_team_id, new.assessment_id;
  end if;
  return new;
end;
$$;
create trigger assessment_revisions_team before insert on rhoe.assessment_revisions for each row execute function rhoe.child_team_matches();

-- ---------------------------------------------------------------------------------------------
-- scenarios: frozen baseline + explicit overrides (SCN-001). Edits bump scenario_version.
-- ---------------------------------------------------------------------------------------------
create table rhoe.scenarios (
  scenario_id       uuid primary key,
  assessment_id     uuid not null references rhoe.assessments (assessment_id),
  workedge_team_id  text not null,
  name              text not null check (length(name) between 1 and 120),
  overrides         jsonb not null default '[]'::jsonb,
  scenario_version  integer not null default 1 check (scenario_version >= 1),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        text
);
create index scenarios_assessment_idx on rhoe.scenarios (workedge_team_id, assessment_id);
create trigger scenarios_team before insert on rhoe.scenarios for each row execute function rhoe.child_team_matches();

-- ---------------------------------------------------------------------------------------------
-- calc_runs: frozen runs (DAT-004, ENG-008, API-002). A terminal row changes only its stale flags.
-- ---------------------------------------------------------------------------------------------
create table rhoe.calc_runs (
  run_id            uuid primary key,
  assessment_id     uuid not null references rhoe.assessments (assessment_id),
  workedge_team_id  text not null,
  revision          integer not null check (revision >= 1),
  scenario_id       uuid references rhoe.scenarios (scenario_id),
  scenario_version  integer,
  idempotency_key   text not null check (length(idempotency_key) between 1 and 128),
  status            text not null check (status in ('queued', 'running', 'ok', 'error', 'cancelled', 'timed_out')),
  requested_at      timestamptz not null default now(),
  started_at        timestamptz,
  finished_at       timestamptz,
  engine_name       text not null,
  engine_version    text not null,
  weather           jsonb not null,
  template_id       text,
  template_version  text,
  input_hash        text check (input_hash is null or input_hash ~ '^sha256:[0-9a-f]{64}$'),
  method_ids        jsonb not null default '[]'::jsonb,
  fingerprint       jsonb,
  stale             boolean not null default false,
  stale_reason      text,
  stale_at          timestamptz,
  totals            jsonb,
  warnings          jsonb not null default '[]'::jsonb,
  errors            jsonb not null default '[]'::jsonb,
  bundle_prefix     text,
  requested_by      text,
  unique (assessment_id, idempotency_key)
);
-- Retry, cancel and timeout cannot produce two accepted runs of one frozen input (API-002).
create unique index calc_runs_one_accepted on rhoe.calc_runs (assessment_id, input_hash, engine_version) where status = 'ok';
create index calc_runs_assessment_idx on rhoe.calc_runs (workedge_team_id, assessment_id);
create index calc_runs_fresh_idx on rhoe.calc_runs (workedge_team_id) where stale = false;
create trigger calc_runs_team before insert on rhoe.calc_runs for each row execute function rhoe.child_team_matches();

create or replace function rhoe.calc_runs_guard() returns trigger
language plpgsql
as $$
declare
  terminal constant text[] := array['ok', 'error', 'cancelled', 'timed_out'];
  frozen_old jsonb;
  frozen_new jsonb;
begin
  if old.status = any (terminal) then
    if new.status <> old.status then
      raise exception 'run % is % and cannot become %', old.run_id, old.status, new.status;
    end if;
    frozen_old := to_jsonb(old) - 'stale' - 'stale_reason' - 'stale_at';
    frozen_new := to_jsonb(new) - 'stale' - 'stale_reason' - 'stale_at';
    if frozen_old <> frozen_new then
      raise exception 'run % is frozen; only its stale flags may change (DAT-004)', old.run_id;
    end if;
  end if;
  if old.stale and not new.stale then
    raise exception 'a stale run does not become fresh again; run again instead (REV-002)';
  end if;
  return new;
end;
$$;
create trigger calc_runs_guard before update on rhoe.calc_runs for each row execute function rhoe.calc_runs_guard();
create trigger calc_runs_no_delete before delete on rhoe.calc_runs for each row execute function rhoe.immutable_row();

-- ---------------------------------------------------------------------------------------------
-- run_artifacts: the bundle's file list with hashes (ENG-008). Immutable.
-- ---------------------------------------------------------------------------------------------
create table rhoe.run_artifacts (
  run_id            uuid not null references rhoe.calc_runs (run_id),
  workedge_team_id  text not null,
  path              text not null,
  sha256            text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes             bigint not null check (bytes >= 0),
  content_type      text not null,
  storage_bucket    text not null,
  storage_path      text not null,
  primary key (run_id, path)
);
create index run_artifacts_team_idx on rhoe.run_artifacts (workedge_team_id);
create trigger run_artifacts_immutable before update or delete on rhoe.run_artifacts for each row execute function rhoe.immutable_row();

create or replace function rhoe.run_child_team_matches() returns trigger
language plpgsql
as $$
declare
  parent_team text;
begin
  select workedge_team_id into parent_team from rhoe.calc_runs where run_id = new.run_id;
  if parent_team is null or parent_team <> new.workedge_team_id then
    raise exception 'row team % does not match run % team', new.workedge_team_id, new.run_id;
  end if;
  return new;
end;
$$;
create trigger run_artifacts_team before insert on rhoe.run_artifacts for each row execute function rhoe.run_child_team_matches();

-- ---------------------------------------------------------------------------------------------
-- reports: issued report revisions (REV-001). Only a fresh `ok` run can feed one (REV-002).
-- ---------------------------------------------------------------------------------------------
create table rhoe.reports (
  report_id           uuid primary key,
  assessment_id       uuid not null references rhoe.assessments (assessment_id),
  workedge_team_id    text not null,
  run_id              uuid not null references rhoe.calc_runs (run_id),
  report_revision     integer not null check (report_revision >= 1),
  report_type         text not null check (report_type in ('engineering', 'customer_summary')),
  issued_at           timestamptz not null default now(),
  issued_by           text,
  storage_path        text,
  content_hash        text check (content_hash is null or content_hash ~ '^sha256:[0-9a-f]{64}$'),
  write_back_status   text not null default 'queued' check (write_back_status in ('queued', 'done', 'failed')),
  workedge_report_id  text,
  unique (assessment_id, report_revision)
);
create index reports_team_idx on rhoe.reports (workedge_team_id, assessment_id);
create trigger reports_team before insert on rhoe.reports for each row execute function rhoe.run_child_team_matches();

create or replace function rhoe.reports_require_fresh_ok_run() returns trigger
language plpgsql
as $$
declare
  r record;
begin
  select status, stale, assessment_id into r from rhoe.calc_runs where run_id = new.run_id;
  if r is null then
    raise exception 'run % not found', new.run_id;
  end if;
  if r.status <> 'ok' or r.stale then
    raise exception 'run % is % and cannot feed a report (REV-002)', new.run_id, case when r.stale then 'stale' else r.status end;
  end if;
  if r.assessment_id <> new.assessment_id then
    raise exception 'run % belongs to another assessment', new.run_id;
  end if;
  return new;
end;
$$;
create trigger reports_require_fresh_ok_run before insert on rhoe.reports for each row execute function rhoe.reports_require_fresh_ok_run();

-- Only the write-back bookkeeping may change after issue.
create or replace function rhoe.reports_guard() returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(old) - 'write_back_status' - 'workedge_report_id') <> (to_jsonb(new) - 'write_back_status' - 'workedge_report_id') then
    raise exception 'issued reports are immutable (REV-001)';
  end if;
  return new;
end;
$$;
create trigger reports_guard before update on rhoe.reports for each row execute function rhoe.reports_guard();
create trigger reports_no_delete before delete on rhoe.reports for each row execute function rhoe.immutable_row();

-- ---------------------------------------------------------------------------------------------
-- Row-level security (SEC-001): every table, forced, team = session claim. No delete policies.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['assessments', 'assessment_revisions', 'scenarios', 'calc_runs', 'run_artifacts', 'reports'] loop
    execute format('alter table rhoe.%I enable row level security', t);
    execute format('alter table rhoe.%I force row level security', t);
    execute format('create policy %I on rhoe.%I for select to authenticated using (workedge_team_id = rhoe.current_team_id())', t || '_select', t);
    execute format('create policy %I on rhoe.%I for insert to authenticated with check (workedge_team_id = rhoe.current_team_id())', t || '_insert', t);
    execute format('grant select, insert on rhoe.%I to authenticated', t);
  end loop;
  -- Updates only where the service needs them; the triggers above limit what can change.
  foreach t in array array['assessments', 'scenarios', 'calc_runs', 'reports'] loop
    execute format('create policy %I on rhoe.%I for update to authenticated using (workedge_team_id = rhoe.current_team_id()) with check (workedge_team_id = rhoe.current_team_id())', t || '_update', t);
    execute format('grant update on rhoe.%I to authenticated', t);
  end loop;
end;
$$;
