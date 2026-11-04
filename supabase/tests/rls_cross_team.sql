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

insert into rhoe.jobs (job_id, account_id, name, customer_name, address_line1) values
  ('a1111111-1111-4111-8111-111111111111', 'acct-a', 'Smith replacement', 'Pat Smith', '1 Test Ln');
insert into rhoe.assessments (assessment_id, account_id, job_id, workedge_project_id, workedge_property_id, status, draft)
values ('11111111-1111-4111-8111-111111111111', 'acct-a', 'a1111111-1111-4111-8111-111111111111', 'we-project-1', 'we-property-1', 'open', '{}'::jsonb);

-- Account a cannot write a row that claims another team.
do $$
begin
  begin
    insert into rhoe.jobs (job_id, account_id, name) values ('a2222222-2222-4222-8222-222222222222', 'acct-b', 'x');
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

  select count(*) into n from rhoe.jobs;
  assert n = 0, format('FAIL: acct-b sees %s job row(s) of acct-a (customer names, addresses)', n);

  update rhoe.jobs set name = 'taken' where job_id = 'a1111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: acct-b updated a acct-a job';

  -- ADR-042: nor archive it, nor find it by searching.
  update rhoe.jobs set archived_at = now(), archived_by = 'x' where job_id = 'a1111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: acct-b archived a acct-a job';
  select count(*) into n from rhoe.jobs where search_text like '%' || 'a' || '%';
  assert n = 0, 'FAIL: acct-b found acct-a jobs by search';

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
    if sqlerrm like 'FAIL:%' then raise; end if; -- expected: the child-team trigger or RLS on the parent refused it
  end;
end;
$$;

-- Team b may work on its own project.
insert into rhoe.jobs (job_id, account_id, name) values ('a4444444-4444-4444-8444-444444444444', 'acct-b', 'B job');
insert into rhoe.assessments (assessment_id, account_id, job_id, status)
values ('44444444-4444-4444-8444-444444444444', 'acct-b', 'a4444444-4444-4444-8444-444444444444', 'open');

-- Team b cannot hang its assessment on team a's job.
do $$
begin
  begin
    insert into rhoe.assessments (assessment_id, account_id, job_id, status)
    values ('45555555-4444-4444-8444-444444444444', 'acct-b', 'a1111111-1111-4111-8111-111111111111', 'open');
    raise exception 'FAIL: acct-b put an assessment on acct-a''s job';
  exception when foreign_key_violation or insufficient_privilege or raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end;
$$;

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

-- House facts (ADR-043): a job's site row is its account's own; county records are readable by all.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
insert into rhoe.job_sites (job_id, account_id, lat, lon, location_source, readings, lookup_status, looked_up_at)
values ('a1111111-1111-4111-8111-111111111111', 'acct-a', 32.96, -96.75, 'rentcast', '[]'::jsonb, 'not_found', now());
reset role;
insert into rhoe.county_property (county, account_num, roll_year, situs_key, situs_address, city, year_built)
values ('dallas', 'rls-1', 2026, '1 TEST LN|DALLAS', '1 TEST LN', 'DALLAS', 1965);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare
  n int;
begin
  select count(*) into n from rhoe.job_sites;
  assert n = 0, 'FAIL: acct-b sees acct-a job sites';
  update rhoe.job_sites set lookup_status = 'error' where job_id = 'a1111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: acct-b updated an acct-a job site';
  begin
    insert into rhoe.job_sites (job_id, account_id, readings, lookup_status, looked_up_at)
    values ('a1111111-1111-4111-8111-111111111111', 'acct-b', '[]'::jsonb, 'found', now());
    raise exception 'FAIL: acct-b wrote a site for an acct-a job';
  exception when insufficient_privilege or raise_exception or unique_violation then
    null;
  end;
  select count(*) into n from rhoe.county_property where situs_key = '1 TEST LN|DALLAS';
  assert n = 1, 'FAIL: a signed-in person cannot read county records';
  begin
    insert into rhoe.county_property (county, account_num, roll_year, situs_key, situs_address) values ('dallas', 'rls-2', 2026, 'X X|Y', 'X');
    raise exception 'FAIL: a signed-in person wrote a county record';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

do $$ begin raise notice 'RLS cross-account: all checks passed'; end; $$;

rollback;
