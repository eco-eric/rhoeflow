-- Invariant tests for the rhoe schema (DAT-004, REV-001, REV-002, API-002). Runs as the SQL
-- editor's role (bypasses row-level security on purpose: these are the trigger and index rules,
-- not the account rules; see rls_cross_team.sql and accounts.sql for those). One rolled-back transaction; a clean
-- run prints "rhoe invariants: all checks passed".
begin;

insert into rhoe.accounts (account_id, name) values ('acct-a', 'Invariants A'), ('acct-b', 'Invariants B');

insert into rhoe.jobs (job_id, account_id, name, workedge_project_id, workedge_property_id) values
  ('a0b00000-0000-4000-8000-000000000001', 'acct-a', 'Linked job', 'we-project-1', 'we-property-1'),
  ('a0b00000-0000-4000-8000-000000000002', 'acct-a', 'Started in RhoeFlow', null, null);

insert into rhoe.assessments (assessment_id, account_id, job_id, workedge_project_id, workedge_property_id, status, revision)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'acct-a', 'a0b00000-0000-4000-8000-000000000001', 'we-project-1', 'we-property-1', 'open', 0);
-- ADR-040: a load calc with no WorkEdge job.
insert into rhoe.assessments (assessment_id, account_id, job_id, status, revision)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaac0', 'acct-a', 'a0b00000-0000-4000-8000-000000000002', 'open', 0);

do $$
begin
  -- one open assessment per job
  begin
    insert into rhoe.assessments (assessment_id, account_id, job_id, workedge_project_id, workedge_property_id, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', 'acct-a', 'a0b00000-0000-4000-8000-000000000001', 'we-project-1', 'we-property-9', 'open');
    raise exception 'FAIL: second open assessment for one job';
  exception when unique_violation then null; end;

  -- every assessment belongs to a job
  begin
    insert into rhoe.assessments (assessment_id, account_id, status) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaac1', 'acct-a', 'open');
    raise exception 'FAIL: assessment without a job';
  exception when not_null_violation then null;
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- one RhoeFlow job per WorkEdge job in an account
  begin
    insert into rhoe.jobs (job_id, account_id, name, workedge_project_id) values ('a0b00000-0000-4000-8000-000000000003', 'acct-a', 'Twin', 'we-project-1');
    raise exception 'FAIL: two jobs linked to one WorkEdge job';
  exception when unique_violation then null; end;

  -- a linked job is never re-pointed
  begin
    update rhoe.jobs set workedge_project_id = 'we-project-2' where job_id = 'a0b00000-0000-4000-8000-000000000001';
    raise exception 'FAIL: job re-pointed at another WorkEdge job';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;

  -- an assessment never moves to another job
  begin
    update rhoe.assessments set job_id = 'a0b00000-0000-4000-8000-000000000002' where assessment_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'FAIL: assessment moved to another job';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;

  -- revision grows by exactly one
  begin
    update rhoe.assessments set revision = 2 where assessment_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'FAIL: revision jumped from 0 to 2';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;

  -- an assessment is never re-pointed
  begin
    update rhoe.assessments set workedge_project_id = 'we-project-2' where assessment_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'FAIL: assessment re-pointed at another project';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
end;
$$;

-- ADR-040: linking a RhoeFlow job to WorkEdge later is allowed once, on the job and its assessment.
update rhoe.jobs set workedge_project_id = 'we-project-5', workedge_property_id = 'we-property-5' where job_id = 'a0b00000-0000-4000-8000-000000000002';
update rhoe.assessments set workedge_project_id = 'we-project-5', workedge_property_id = 'we-property-5' where assessment_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaac0';

-- ADR-042: archive and search. search_text is generated from the name, customer and address.
update rhoe.jobs set customer_name = 'Pat Rivera', address_line1 = '1412 Elm St', city = 'Dallas', state = 'TX', postal_code = '75201'
where job_id = 'a0b00000-0000-4000-8000-000000000002';
update rhoe.jobs set archived_at = now(), archived_by = 'user-a' where job_id = 'a0b00000-0000-4000-8000-000000000002';

do $$
declare
  t text;
begin
  select search_text into t from rhoe.jobs where job_id = 'a0b00000-0000-4000-8000-000000000002';
  if t not like '%pat rivera%' or t not like '%1412 elm st%' or t not like '%dallas%' or t not like '%75201%' then
    raise exception 'FAIL: search_text is %', t;
  end if;
  if (select count(*) from rhoe.jobs where account_id = 'acct-a' and archived_at is null) <> 1 then
    raise exception 'FAIL: archived job still counted as active';
  end if;
  -- archived_by needs archived_at
  begin
    update rhoe.jobs set archived_at = null where job_id = 'a0b00000-0000-4000-8000-000000000002';
    raise exception 'FAIL: archived_by kept without archived_at';
  exception when check_violation then null; end;
  -- search_text is never written by hand
  begin
    update rhoe.jobs set search_text = 'x' where job_id = 'a0b00000-0000-4000-8000-000000000002';
    raise exception 'FAIL: search_text written';
  exception when generated_always then null; end;
end;
$$;
update rhoe.jobs set archived_at = null, archived_by = null where job_id = 'a0b00000-0000-4000-8000-000000000002';

update rhoe.assessments set revision = 1 where assessment_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
insert into rhoe.assessment_revisions (assessment_id, account_id, revision, snapshot, content_hash)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'acct-a', 1, '{"revision":1}'::jsonb, 'sha256:' || repeat('0', 64));

do $$
begin
  begin
    update rhoe.assessment_revisions set snapshot = '{}'::jsonb where revision = 1;
    raise exception 'FAIL: accepted revision was edited';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    insert into rhoe.assessment_revisions (assessment_id, account_id, revision, snapshot, content_hash)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'acct-b', 2, '{}'::jsonb, 'sha256:' || repeat('1', 64));
    raise exception 'FAIL: revision inserted under another team';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
end;
$$;

-- a frozen ok run
insert into rhoe.calc_runs (run_id, assessment_id, account_id, revision, idempotency_key, status, engine_name, engine_version, weather, input_hash, totals, finished_at)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'acct-a', 1, 'tap-1', 'ok', '@rhoeflow/calc', '0.2.0', '{}'::jsonb, 'sha256:' || repeat('a', 64), '{"heating_sensible":1}'::jsonb, now());

do $$
begin
  -- same key twice
  begin
    insert into rhoe.calc_runs (run_id, assessment_id, account_id, revision, idempotency_key, status, engine_name, engine_version, weather)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'acct-a', 1, 'tap-1', 'running', '@rhoeflow/calc', '0.2.0', '{}'::jsonb);
    raise exception 'FAIL: duplicate idempotency key accepted';
  exception when unique_violation then null; end;

  -- a second ok run of the same frozen input and engine
  begin
    insert into rhoe.calc_runs (run_id, assessment_id, account_id, revision, idempotency_key, status, engine_name, engine_version, weather, input_hash)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'acct-a', 1, 'tap-2', 'ok', '@rhoeflow/calc', '0.2.0', '{}'::jsonb, 'sha256:' || repeat('a', 64));
    raise exception 'FAIL: two accepted runs of one input';
  exception when unique_violation then null; end;

  -- a finished run's numbers never change; its status never changes
  begin
    update rhoe.calc_runs set totals = '{"heating_sensible":2}'::jsonb where run_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    raise exception 'FAIL: frozen totals edited';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    update rhoe.calc_runs set status = 'cancelled' where run_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    raise exception 'FAIL: ok run cancelled';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    delete from rhoe.calc_runs where run_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    raise exception 'FAIL: run deleted';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
end;
$$;

-- a report from the fresh ok run
insert into rhoe.reports (report_id, assessment_id, account_id, run_id, report_revision, report_type)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'acct-a', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1, 'customer_summary');

-- only the stale flags may change on a frozen run
update rhoe.calc_runs set stale = true, stale_reason = 'inputs changed: revision 2 accepted', stale_at = now() where run_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

do $$
begin
  begin
    insert into rhoe.reports (report_id, assessment_id, account_id, run_id, report_revision, report_type)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'acct-a', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2, 'engineering');
    raise exception 'FAIL: report issued from a stale run';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    update rhoe.calc_runs set stale = false where run_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    raise exception 'FAIL: stale run made fresh again';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    update rhoe.reports set report_type = 'engineering' where report_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'FAIL: issued report edited';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  -- write-back bookkeeping may change
  update rhoe.reports set write_back_status = 'done', workedge_report_id = 'we-report-1' where report_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  begin
    delete from rhoe.reports where report_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'FAIL: report deleted';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
end;
$$;

-- templates: versions grow by one and are immutable
insert into rhoe.templates (template_id, account_id, name) values ('dfw-test', 'acct-a', 'T');
insert into rhoe.template_versions (template_id, account_id, version, payload, content_hash, source, change_note)
values ('dfw-test', 'acct-a', 1, '{}'::jsonb, 'sha256:' || repeat('b', 64), 'repo', 'seed');
do $$
begin
  begin
    update rhoe.templates set current_version = 3 where template_id = 'dfw-test';
    raise exception 'FAIL: template version jumped';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    update rhoe.template_versions set payload = '{"x":1}'::jsonb where template_id = 'dfw-test';
    raise exception 'FAIL: template version edited';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
end;
$$;

do $$ begin raise notice 'rhoe invariants: all checks passed'; end; $$;
rollback;
