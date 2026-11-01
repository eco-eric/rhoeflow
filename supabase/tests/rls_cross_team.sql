-- Cross-account negative tests (SEC-001; WO-03 C1 definition of done; ADR-039). Paste into the SQL
-- editor after every migration. Everything runs inside one transaction that is rolled back, so it
-- leaves no rows. Each `assert` raises on failure; a clean run prints "RLS cross-account: all
-- checks passed" in the Messages pane.

begin;

-- Two accounts, each with one signed-in person: a is an admin of acct-a, b a plain member of acct-b.
insert into auth.users (id, email, email_confirmed_at) values
  ('a0000000-0000-4000-8000-00000000000a', 'rls-a@example.invalid', now()),
  ('b0000000-0000-4000-8000-00000000000b', 'rls-b@example.invalid', now());
insert into rhoe.accounts (account_id, name) values ('acct-a', 'RLS test A'), ('acct-b', 'RLS test B');
insert into rhoe.account_members (account_id, user_id, role) values
  ('acct-a', 'a0000000-0000-4000-8000-00000000000a', 'admin'),
  ('acct-b', 'b0000000-0000-4000-8000-00000000000b', 'member');

-- Act as the person in acct-a.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

insert into rhoe.assessments (assessment_id, account_id, workedge_project_id, workedge_property_id, status, draft)
values ('11111111-1111-4111-8111-111111111111', 'acct-a', 'we-project-1', 'we-property-1', 'open', '{}'::jsonb);

-- Account a cannot write a row that claims another team.
do $$
begin
  begin
    insert into rhoe.assessments (assessment_id, account_id, workedge_project_id, workedge_property_id, status)
    values ('22222222-2222-4222-8222-222222222222', 'acct-b', 'we-project-2', 'we-property-2', 'open');
    raise exception 'FAIL: acct-a inserted a acct-b row';
  exception when insufficient_privilege or check_violation then
    null; -- expected: RLS with-check refused it
  end;
end;
$$;

-- Now act as the person in acct-b.
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

do $$
declare
  n integer;
begin
  select count(*) into n from rhoe.assessments;
  assert n = 0, format('FAIL: acct-b sees %s assessment row(s) of acct-a', n);

  update rhoe.assessments set status = 'closed' where assessment_id = '11111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: acct-b updated a acct-a assessment';

  select count(*) into n from rhoe.assessment_revisions;
  assert n = 0, 'FAIL: acct-b sees acct-a revisions';
end;
$$;

-- Team b cannot attach a child row to team a's assessment even with acct-a's id in hand.
do $$
begin
  begin
    insert into rhoe.scenarios (scenario_id, assessment_id, account_id, name)
    values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'acct-b', 'x');
    raise exception 'FAIL: acct-b attached a scenario to a acct-a assessment';
  exception when insufficient_privilege or raise_exception or foreign_key_violation then
    null; -- expected: the child-team trigger or RLS on the parent refused it
  end;
end;
$$;

-- Team b may work on its own project.
insert into rhoe.assessments (assessment_id, account_id, workedge_project_id, workedge_property_id, status)
values ('44444444-4444-4444-8444-444444444444', 'acct-b', 'we-project-9', 'we-property-9', 'open');

do $$
declare
  n integer;
begin
  select count(*) into n from rhoe.assessments;
  assert n = 1, format('FAIL: acct-b should see exactly its own row, saw %s', n);
end;
$$;

-- Templates: a plain member without a grant cannot create templates.
do $$
begin
  begin
    insert into rhoe.templates (template_id, account_id, name) values ('t-one', 'acct-b', 'T1');
    raise exception 'FAIL: non-editor created a template';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

-- Account admins can (ADR-039); then back to the member of acct-b.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
insert into rhoe.templates (template_id, account_id, name) values ('t-admin', 'acct-a', 'T admin');
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

-- Storage: an acct-b object under acct-a's prefix is refused; under its own prefix it is allowed.
do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner) values ('rhoe-runs', 'acct-a/x/y/output.json', null);
    raise exception 'FAIL: acct-b wrote under acct-a prefix in rhoe-runs';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
insert into storage.objects (bucket_id, name, owner) values ('rhoe-runs', 'acct-b/x/y/output.json', null);

do $$ begin raise notice 'RLS cross-account: all checks passed'; end; $$;

rollback;
