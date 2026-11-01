-- Accounts, members, invites and profiles (ADR-039; SEC-001). Paste into the SQL editor after
-- every migration. One rolled-back transaction; a clean run prints "accounts: all checks passed".
begin;

-- People: a = admin of acct-a, m = member of acct-a, o = login with no account,
-- i = invited with a confirmed email, u = invited but email not confirmed, b = admin of acct-b.
insert into auth.users (id, email, email_confirmed_at) values
  ('a1000000-0000-4000-8000-000000000001', 'acc-a@example.invalid', now()),
  ('a1000000-0000-4000-8000-000000000002', 'acc-m@example.invalid', now()),
  ('a1000000-0000-4000-8000-000000000003', 'acc-o@example.invalid', now()),
  ('a1000000-0000-4000-8000-000000000004', 'acc-i@example.invalid', now()),
  ('a1000000-0000-4000-8000-000000000005', 'acc-u@example.invalid', null),
  ('a1000000-0000-4000-8000-000000000006', 'acc-b@example.invalid', now());
insert into rhoe.accounts (account_id, name) values ('acct-a', 'Accounts test A'), ('acct-b', 'Accounts test B');
insert into rhoe.account_members (account_id, user_id, role) values
  ('acct-a', 'a1000000-0000-4000-8000-000000000001', 'admin'),
  ('acct-a', 'a1000000-0000-4000-8000-000000000002', 'member'),
  ('acct-b', 'a1000000-0000-4000-8000-000000000006', 'admin');
insert into rhoe.assessments (assessment_id, account_id, workedge_project_id, workedge_property_id, status)
values ('a1000000-0000-4000-8000-0000000000aa', 'acct-a', 'we-acc-project', 'we-acc-property', 'open');

create function pg_temp.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- o: a login with no account sees nothing and is nobody's member.
select pg_temp.act_as('a1000000-0000-4000-8000-000000000003');
do $$
declare n integer;
begin
  assert rhoe.current_account_id() is null, 'FAIL: o has a current account';
  select count(*) into n from rhoe.whoami(); assert n = 0, 'FAIL: whoami returned a row for o';
  select count(*) into n from rhoe.assessments; assert n = 0, 'FAIL: o sees assessments';
  select count(*) into n from rhoe.accounts; assert n = 0, 'FAIL: o sees accounts';
  select count(*) into n from rhoe.account_member_list(); assert n = 0, 'FAIL: o sees members';
  assert rhoe.accept_my_invites() = 0, 'FAIL: o accepted an invite it never had';
end $$;

-- m: a plain member uses the account but cannot manage it.
select pg_temp.act_as('a1000000-0000-4000-8000-000000000002');
do $$
declare n integer;
begin
  assert rhoe.current_account_id() = 'acct-a', 'FAIL: m is not in acct-a';
  assert (select role from rhoe.whoami()) = 'member', 'FAIL: m is not a member';
  select count(*) into n from rhoe.assessments; assert n = 1, 'FAIL: m cannot see its account''s assessment';
  select count(*) into n from rhoe.account_member_list(); assert n = 2, format('FAIL: m sees %s members, expected 2', n);
  update rhoe.accounts set name = 'renamed by m' where account_id = 'acct-a';
  get diagnostics n = row_count; assert n = 0, 'FAIL: member renamed the account';
  update rhoe.account_members set role = 'admin' where user_id = 'a1000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count; assert n = 0, 'FAIL: member promoted itself';
  delete from rhoe.account_members where user_id = 'a1000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count; assert n = 0, 'FAIL: member removed the admin';
  select count(*) into n from rhoe.account_invites; assert n = 0, 'FAIL: member sees invites';
  begin
    insert into rhoe.account_invites (account_id, email, role, invited_by)
    values ('acct-a', 'x@example.invalid', 'admin', 'a1000000-0000-4000-8000-000000000002');
    raise exception 'FAIL: member created an invite';
  exception when insufficient_privilege then null; end;
  begin
    insert into rhoe.account_members (account_id, user_id, role) values ('acct-a', 'a1000000-0000-4000-8000-000000000003', 'admin');
    raise exception 'FAIL: member added someone directly';
  exception when insufficient_privilege then null; end;
  begin
    insert into rhoe.workedge_connections (account_id, credential_kind, ciphertext, iv, key_version, key_hint)
    values ('acct-a', 'api_key', repeat('x', 32), repeat('y', 16), 1, 'abcd');
    raise exception 'FAIL: member connected WorkEdge';
  exception when insufficient_privilege then null; end;
  begin
    insert into rhoe.profiles (user_id, current_account_id) values ('a1000000-0000-4000-8000-000000000002', 'acct-b');
    raise exception 'FAIL: member pointed its profile at an account it is not in';
  exception when raise_exception then null; end;
end $$;

-- a: the admin renames, invites, changes roles; the last admin cannot leave or be demoted.
select pg_temp.act_as('a1000000-0000-4000-8000-000000000001');
do $$
declare n integer;
begin
  update rhoe.accounts set name = 'Accounts test A (renamed)' where account_id = 'acct-a';
  get diagnostics n = row_count; assert n = 1, 'FAIL: admin could not rename the account';
  insert into rhoe.account_invites (account_id, email, role, invited_by) values
    ('acct-a', 'acc-i@example.invalid', 'member', 'a1000000-0000-4000-8000-000000000001'),
    ('acct-a', 'acc-u@example.invalid', 'member', 'a1000000-0000-4000-8000-000000000001');
  begin
    insert into rhoe.account_invites (account_id, email, role, invited_by)
    values ('acct-a', 'acc-i@example.invalid', 'admin', 'a1000000-0000-4000-8000-000000000001');
    raise exception 'FAIL: two pending invites for one email';
  exception when unique_violation then null; end;
  begin
    insert into rhoe.account_invites (account_id, email, role, invited_by)
    values ('acct-b', 'z@example.invalid', 'member', 'a1000000-0000-4000-8000-000000000001');
    raise exception 'FAIL: admin of acct-a invited into acct-b';
  exception when insufficient_privilege then null; end;
  begin
    update rhoe.account_members set role = 'member' where user_id = 'a1000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: the last admin demoted itself';
  exception when raise_exception then null; end;
  begin
    delete from rhoe.account_members where user_id = 'a1000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: the last admin left';
  exception when raise_exception then null; end;
  insert into rhoe.workedge_connections (account_id, credential_kind, ciphertext, iv, key_version, key_hint)
  values ('acct-a', 'api_key', repeat('x', 32), repeat('y', 16), 1, 'abcd');
  -- with a second admin, the first may step down
  update rhoe.account_members set role = 'admin' where user_id = 'a1000000-0000-4000-8000-000000000002';
  update rhoe.account_members set role = 'member' where user_id = 'a1000000-0000-4000-8000-000000000001';
  assert (select role from rhoe.whoami()) = 'member', 'FAIL: a still admin after stepping down';
end $$;

-- m (now admin) withdraws u's invite; a withdrawn invite cannot come back.
select pg_temp.act_as('a1000000-0000-4000-8000-000000000002');
do $$
declare n integer;
begin
  update rhoe.account_invites set revoked_at = now() where email = 'acc-u@example.invalid';
  get diagnostics n = row_count; assert n = 1, 'FAIL: admin could not withdraw an invite';
  begin
    update rhoe.account_invites set revoked_at = null where email = 'acc-u@example.invalid';
    raise exception 'FAIL: withdrawn invite reopened';
  exception when raise_exception then null; end;
end $$;

-- i: accepting joins acct-a as a member and picks it as the current account.
select pg_temp.act_as('a1000000-0000-4000-8000-000000000004');
do $$
begin
  assert rhoe.accept_my_invites() = 1, 'FAIL: i did not accept exactly one invite';
  assert rhoe.accept_my_invites() = 0, 'FAIL: an invite was accepted twice';
  assert rhoe.current_account_id() = 'acct-a', 'FAIL: i is not in acct-a';
  assert (select role from rhoe.whoami()) = 'member', 'FAIL: i got the wrong role';
end $$;

-- u: an unconfirmed address takes nothing (and the invite was withdrawn anyway).
reset role;
insert into rhoe.account_invites (account_id, email, role) values ('acct-b', 'acc-u@example.invalid', 'member');
set local role authenticated;
select pg_temp.act_as('a1000000-0000-4000-8000-000000000005');
do $$
begin
  assert rhoe.accept_my_invites() = 0, 'FAIL: unconfirmed email accepted an invite';
  assert rhoe.current_account_id() is null, 'FAIL: unconfirmed email has an account';
end $$;

-- b: another account's admin sees and changes nothing in acct-a.
select pg_temp.act_as('a1000000-0000-4000-8000-000000000006');
do $$
declare n integer;
begin
  select count(*) into n from rhoe.account_member_list() where email like 'acc-%' and email <> 'acc-b@example.invalid';
  assert n = 0, 'FAIL: b sees acct-a members';
  update rhoe.account_members set role = 'member' where account_id = 'acct-a';
  get diagnostics n = row_count; assert n = 0, 'FAIL: b changed acct-a roles';
  select count(*) into n from rhoe.account_invites where account_id = 'acct-a'; assert n = 0, 'FAIL: b sees acct-a invites';
  select count(*) into n from rhoe.workedge_connections; assert n = 0, 'FAIL: b sees acct-a connection';
  select count(*) into n from rhoe.assessments; assert n = 0, 'FAIL: b sees acct-a assessments';
end $$;

-- Switching: a person in two accounts picks one on their profile; removal takes effect at once.
reset role;
insert into rhoe.account_members (account_id, user_id, role) values ('acct-b', 'a1000000-0000-4000-8000-000000000004', 'member');
set local role authenticated;
select pg_temp.act_as('a1000000-0000-4000-8000-000000000004');
update rhoe.profiles set current_account_id = 'acct-b' where user_id = 'a1000000-0000-4000-8000-000000000004';
do $$
declare n integer;
begin
  assert rhoe.current_account_id() = 'acct-b', 'FAIL: switching account did not take effect';
  select count(*) into n from rhoe.accounts; assert n = 2, format('FAIL: i should see its 2 accounts, saw %s', n);
end $$;
select pg_temp.act_as('a1000000-0000-4000-8000-000000000006');
delete from rhoe.account_members where account_id = 'acct-b' and user_id = 'a1000000-0000-4000-8000-000000000004';
select pg_temp.act_as('a1000000-0000-4000-8000-000000000004');
do $$
begin
  assert rhoe.current_account_id() = 'acct-a', 'FAIL: removed member still acts in acct-b';
end $$;

-- Deleting a whole account is not blocked by its last admin (owner clean-up in the SQL editor).
reset role;
delete from rhoe.workedge_connections where account_id = 'acct-a';
delete from rhoe.assessments where account_id = 'acct-a';
delete from rhoe.accounts where account_id = 'acct-b';

do $$ begin raise notice 'accounts: all checks passed'; end; $$;
rollback;
