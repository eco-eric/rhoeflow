-- Invariant tests for the rhoe schema (DAT-004, REV-001, REV-002, API-002). Runs as the SQL
-- editor's role (bypasses row-level security on purpose: these are the trigger and index rules,
-- not the team rules; see rls_cross_team.sql for those). One rolled-back transaction; a clean
-- run prints "rhoe invariants: all checks passed".
begin;

insert into rhoe.assessments (assessment_id, workedge_team_id, workedge_project_id, workedge_property_id, status, revision)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'team-a', 'we-project-1', 'we-property-1', 'open', 0);

do $$
begin
  -- one open assessment per project
  begin
    insert into rhoe.assessments (assessment_id, workedge_team_id, workedge_project_id, workedge_property_id, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', 'team-a', 'we-project-1', 'we-property-9', 'open');
    raise exception 'FAIL: second open assessment for one project';
  exception when unique_violation then null; end;

  -- revision grows by exactly one
  begin
    update rhoe.assessments set revision = 2 where assessment_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'FAIL: revision jumped from 0 to 2';
  exception when raise_exception then null; end;

  -- an assessment is never re-pointed
  begin
    update rhoe.assessments set workedge_project_id = 'we-project-2' where assessment_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'FAIL: assessment re-pointed at another project';
  exception when raise_exception then null; end;
end;
$$;

update rhoe.assessments set revision = 1 where assessment_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
insert into rhoe.assessment_revisions (assessment_id, workedge_team_id, revision, snapshot, content_hash)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'team-a', 1, '{"revision":1}'::jsonb, 'sha256:' || repeat('0', 64));

do $$
begin
  begin
    update rhoe.assessment_revisions set snapshot = '{}'::jsonb where revision = 1;
    raise exception 'FAIL: accepted revision was edited';
  exception when raise_exception then null; end;
  begin
    insert into rhoe.assessment_revisions (assessment_id, workedge_team_id, revision, snapshot, content_hash)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'team-b', 2, '{}'::jsonb, 'sha256:' || repeat('1', 64));
    raise exception 'FAIL: revision inserted under another team';
  exception when raise_exception then null; end;
end;
$$;

-- a frozen ok run
insert into rhoe.calc_runs (run_id, assessment_id, workedge_team_id, revision, idempotency_key, status, engine_name, engine_version, weather, input_hash, totals, finished_at)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'team-a', 1, 'tap-1', 'ok', '@rhoeflow/calc', '0.2.0', '{}'::jsonb, 'sha256:' || repeat('a', 64), '{"heating_sensible":1}'::jsonb, now());

do $$
begin
  -- same key twice
  begin
    insert into rhoe.calc_runs (run_id, assessment_id, workedge_team_id, revision, idempotency_key, status, engine_name, engine_version, weather)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'team-a', 1, 'tap-1', 'running', '@rhoeflow/calc', '0.2.0', '{}'::jsonb);
    raise exception 'FAIL: duplicate idempotency key accepted';
  exception when unique_violation then null; end;

  -- a second ok run of the same frozen input and engine
  begin
    insert into rhoe.calc_runs (run_id, assessment_id, workedge_team_id, revision, idempotency_key, status, engine_name, engine_version, weather, input_hash)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'team-a', 1, 'tap-2', 'ok', '@rhoeflow/calc', '0.2.0', '{}'::jsonb, 'sha256:' || repeat('a', 64));
    raise exception 'FAIL: two accepted runs of one input';
  exception when unique_violation then null; end;

  -- a finished run's numbers never change; its status never changes
  begin
    update rhoe.calc_runs set totals = '{"heating_sensible":2}'::jsonb where run_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    raise exception 'FAIL: frozen totals edited';
  exception when raise_exception then null; end;
  begin
    update rhoe.calc_runs set status = 'cancelled' where run_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    raise exception 'FAIL: ok run cancelled';
  exception when raise_exception then null; end;
  begin
    delete from rhoe.calc_runs where run_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    raise exception 'FAIL: run deleted';
  exception when raise_exception then null; end;
end;
$$;

-- a report from the fresh ok run
insert into rhoe.reports (report_id, assessment_id, workedge_team_id, run_id, report_revision, report_type)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'team-a', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1, 'customer_summary');

-- only the stale flags may change on a frozen run
update rhoe.calc_runs set stale = true, stale_reason = 'inputs changed: revision 2 accepted', stale_at = now() where run_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

do $$
begin
  begin
    insert into rhoe.reports (report_id, assessment_id, workedge_team_id, run_id, report_revision, report_type)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'team-a', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2, 'engineering');
    raise exception 'FAIL: report issued from a stale run';
  exception when raise_exception then null; end;
  begin
    update rhoe.calc_runs set stale = false where run_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    raise exception 'FAIL: stale run made fresh again';
  exception when raise_exception then null; end;
  begin
    update rhoe.reports set report_type = 'engineering' where report_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'FAIL: issued report edited';
  exception when raise_exception then null; end;
  -- write-back bookkeeping may change
  update rhoe.reports set write_back_status = 'done', workedge_report_id = 'we-report-1' where report_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  begin
    delete from rhoe.reports where report_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'FAIL: report deleted';
  exception when raise_exception then null; end;
end;
$$;

-- templates: versions grow by one and are immutable
insert into rhoe.templates (template_id, workedge_team_id, name) values ('dfw-test', 'team-a', 'T');
insert into rhoe.template_versions (template_id, workedge_team_id, version, payload, content_hash, source, change_note)
values ('dfw-test', 'team-a', 1, '{}'::jsonb, 'sha256:' || repeat('b', 64), 'repo', 'seed');
do $$
begin
  begin
    update rhoe.templates set current_version = 3 where template_id = 'dfw-test';
    raise exception 'FAIL: template version jumped';
  exception when raise_exception then null; end;
  begin
    update rhoe.template_versions set payload = '{"x":1}'::jsonb where template_id = 'dfw-test';
    raise exception 'FAIL: template version edited';
  exception when raise_exception then null; end;
end;
$$;

do $$ begin raise notice 'rhoe invariants: all checks passed'; end; $$;
rollback;
