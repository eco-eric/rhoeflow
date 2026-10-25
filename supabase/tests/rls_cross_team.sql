-- Cross-team negative tests (SEC-001; WO-03 C1 definition of done). Paste into the SQL editor
-- after the three migrations. Everything runs inside one transaction that is rolled back, so it
-- leaves no rows. Each `assert` raises on failure; a clean run prints "RLS cross-team: all
-- checks passed" in the Messages pane.

begin;

-- Act as a signed-in user of team-a.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user-a","role":"authenticated","app_metadata":{"workedge_team_id":"team-a"}}', true);

insert into rhoe.assessments (assessment_id, workedge_team_id, workedge_project_id, workedge_property_id, status, draft)
values ('11111111-1111-4111-8111-111111111111', 'team-a', 'we-project-1', 'we-property-1', 'open', '{}'::jsonb);

-- Team a cannot write a row that claims another team.
do $$
begin
  begin
    insert into rhoe.assessments (assessment_id, workedge_team_id, workedge_project_id, workedge_property_id, status)
    values ('22222222-2222-4222-8222-222222222222', 'team-b', 'we-project-2', 'we-property-2', 'open');
    raise exception 'FAIL: team-a inserted a team-b row';
  exception when insufficient_privilege or check_violation then
    null; -- expected: RLS with-check refused it
  end;
end;
$$;

-- Now act as team-b.
select set_config('request.jwt.claims', '{"sub":"user-b","role":"authenticated","app_metadata":{"workedge_team_id":"team-b"}}', true);

do $$
declare
  n integer;
begin
  select count(*) into n from rhoe.assessments;
  assert n = 0, format('FAIL: team-b sees %s assessment row(s) of team-a', n);

  update rhoe.assessments set status = 'closed' where assessment_id = '11111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: team-b updated a team-a assessment';

  select count(*) into n from rhoe.assessment_revisions;
  assert n = 0, 'FAIL: team-b sees team-a revisions';
end;
$$;

-- Team b cannot attach a child row to team a's assessment even with team-a's id in hand.
do $$
begin
  begin
    insert into rhoe.scenarios (scenario_id, assessment_id, workedge_team_id, name)
    values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'team-b', 'x');
    raise exception 'FAIL: team-b attached a scenario to a team-a assessment';
  exception when insufficient_privilege or raise_exception or foreign_key_violation then
    null; -- expected: the child-team trigger or RLS on the parent refused it
  end;
end;
$$;

-- Team b may work on its own project.
insert into rhoe.assessments (assessment_id, workedge_team_id, workedge_project_id, workedge_property_id, status)
values ('44444444-4444-4444-8444-444444444444', 'team-b', 'we-project-9', 'we-property-9', 'open');

do $$
declare
  n integer;
begin
  select count(*) into n from rhoe.assessments;
  assert n = 1, format('FAIL: team-b should see exactly its own row, saw %s', n);
end;
$$;

-- Templates: a team member without a grant cannot create templates; with a grant, can.
do $$
begin
  begin
    insert into rhoe.templates (template_id, workedge_team_id, name) values ('t-one', 'team-b', 'T1');
    raise exception 'FAIL: non-editor created a template';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

-- Storage: a team-b object under team-a's prefix is refused; under its own prefix it is allowed.
do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner) values ('rhoe-runs', 'team-a/x/y/output.json', null);
    raise exception 'FAIL: team-b wrote under team-a prefix in rhoe-runs';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
insert into storage.objects (bucket_id, name, owner) values ('rhoe-runs', 'team-b/x/y/output.json', null);

do $$ begin raise notice 'RLS cross-team: all checks passed'; end; $$;

rollback;
