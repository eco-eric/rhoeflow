-- First account and its first admin (ADR-039). Run once in the Supabase SQL editor, after every
-- migration, and after creating the admin's login under Authentication -> Users -> Add user
-- (tick "Auto Confirm User").
--
-- Fill in the two values on the marked lines, then run the whole file. It refuses if the login
-- does not exist or already belongs to an account with that name.
do $$
declare
  v_account_name text := 'Truficient';                    -- <- the company name
  v_admin_email  text := lower('you@example.com');        -- <- the admin's login email
  v_user   uuid;
  v_account text;
begin
  select id into v_user from auth.users where lower(email) = v_admin_email;
  if v_user is null then
    raise exception 'no login with email % yet: add it under Authentication -> Users first', v_admin_email;
  end if;
  if exists (
    select 1 from rhoe.accounts a join rhoe.account_members m on m.account_id = a.account_id
    where m.user_id = v_user and a.name = v_account_name
  ) then
    raise exception '% already belongs to an account named %', v_admin_email, v_account_name;
  end if;

  insert into rhoe.accounts (name, created_by) values (v_account_name, v_user) returning account_id into v_account;
  insert into rhoe.account_members (account_id, user_id, role, added_by) values (v_account, v_user, 'admin', v_user);
  insert into rhoe.profiles (user_id, current_account_id) values (v_user, v_account)
    on conflict (user_id) do update set current_account_id = excluded.current_account_id;

  raise notice 'Account "%" created (id %), with % as its admin.', v_account_name, v_account, v_admin_email;
end;
$$;
