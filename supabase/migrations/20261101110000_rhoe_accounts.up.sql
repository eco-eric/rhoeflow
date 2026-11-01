-- RhoeFlow accounts, members, profiles and invites (ADR-039; SEC-001).
--
-- People sign in with this project's own Supabase Auth. An account is a company using RhoeFlow;
-- every RhoeFlow row carries its `account_id`. Which account a request acts for is looked up here
-- on every request (rhoe.current_account_id()), so removing someone or changing a role takes effect
-- at once; no Auth hook and no claim in the token.
--
-- No service-role key (ADR-031). The functions marked `security definer` run as the table owner so
-- they can read membership without recursing through row-level security; each one acts only for
-- the caller (auth uid from the request's JWT) and has a fixed, empty search path.
--
-- The account tables enable row-level security but do not FORCE it, so those owner-run functions
-- read them; every other table in `rhoe` keeps FORCE.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------
create table rhoe.accounts (
  account_id  text primary key default gen_random_uuid()::text,
  name        text not null check (length(btrim(name)) between 1 and 120),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null
);

create table rhoe.account_members (
  account_id  text not null references rhoe.accounts (account_id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('admin', 'member')),
  joined_at   timestamptz not null default now(),
  added_by    uuid,
  primary key (account_id, user_id)
);
create index account_members_user_idx on rhoe.account_members (user_id);

create table rhoe.profiles (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  full_name           text check (full_name is null or length(full_name) <= 120),
  phone               text check (phone is null or length(phone) <= 40),
  current_account_id  text references rhoe.accounts (account_id) on delete set null,
  updated_at          timestamptz not null default now()
);

create table rhoe.account_invites (
  invite_id    uuid primary key default gen_random_uuid(),
  account_id   text not null references rhoe.accounts (account_id) on delete cascade,
  email        text not null check (email = lower(btrim(email)) and length(email) between 3 and 254 and position('@' in email) > 1),
  role         text not null check (role in ('admin', 'member')),
  invited_by   uuid,
  invited_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  accepted_by  uuid,
  revoked_at   timestamptz,
  check (accepted_at is null or revoked_at is null)
);
create unique index account_invites_one_pending on rhoe.account_invites (account_id, email)
  where accepted_at is null and revoked_at is null;

-- Every tenant table belongs to an account.
do $$
declare
  t text;
begin
  foreach t in array array['assessments', 'assessment_revisions', 'scenarios', 'calc_runs', 'run_artifacts', 'reports', 'templates', 'template_versions', 'template_editors'] loop
    execute format('alter table rhoe.%I add constraint %I foreign key (account_id) references rhoe.accounts (account_id)', t, t || '_account_fk');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------------------------
-- The account the caller acts for: the one their profile picked if they are still a member,
-- otherwise their oldest membership, otherwise null (no access anywhere).
create or replace function rhoe.current_account_id() returns text
language sql stable security definer set search_path = ''
as $$
  select m.account_id
  from rhoe.account_members m
  left join rhoe.profiles p on p.user_id = m.user_id
  where m.user_id::text = rhoe.current_user_id()
  order by (m.account_id = p.current_account_id) desc nulls last, m.joined_at, m.account_id
  limit 1;
$$;

create or replace function rhoe.current_account_role() returns text
language sql stable security definer set search_path = ''
as $$
  select m.role from rhoe.account_members m
  where m.account_id = rhoe.current_account_id() and m.user_id::text = rhoe.current_user_id();
$$;

create or replace function rhoe.is_account_admin() returns boolean
language sql stable
as $$
  select coalesce(rhoe.current_account_role() = 'admin', false);
$$;

-- Template edits: account admins, plus members on the editor grant list (owner decision 5).
create or replace function rhoe.is_template_editor() returns boolean
language sql stable security definer set search_path = ''
as $$
  select rhoe.is_account_admin() or exists (
    select 1 from rhoe.template_editors e
    where e.account_id = rhoe.current_account_id() and e.user_id = rhoe.current_user_id()
  );
$$;

-- What the app shows in its header and uses for its own checks. One row or none.
create or replace function rhoe.whoami()
returns table (account_id text, account_name text, role text)
language sql stable security definer set search_path = ''
as $$
  select a.account_id, a.name, rhoe.current_account_role()
  from rhoe.accounts a
  where a.account_id = rhoe.current_account_id();
$$;

-- ---------------------------------------------------------------------------------------------
-- Rules the database keeps
-- ---------------------------------------------------------------------------------------------
-- An account keeps at least one admin. Deleting the account itself, or the login, cascades.
create or replace function rhoe.account_members_keep_admin() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role <> 'admin' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'admin' then
    return new;
  end if;
  if not exists (select 1 from rhoe.accounts a where a.account_id = old.account_id) then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  if not exists (
    select 1 from rhoe.account_members m
    where m.account_id = old.account_id and m.role = 'admin' and m.user_id <> old.user_id
  ) then
    raise exception 'an account must keep at least one admin' using errcode = 'P0001', hint = 'last_admin';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger account_members_keep_admin before update or delete on rhoe.account_members
  for each row execute function rhoe.account_members_keep_admin();

-- A membership never moves to another account or person; only its role changes.
create or replace function rhoe.account_members_guard() returns trigger
language plpgsql
as $$
begin
  if new.account_id <> old.account_id or new.user_id <> old.user_id or new.joined_at <> old.joined_at then
    raise exception 'only a member''s role can change';
  end if;
  return new;
end;
$$;
create trigger account_members_guard before update on rhoe.account_members
  for each row execute function rhoe.account_members_guard();

-- An invite only changes once: accepted (by the function below) or withdrawn.
create or replace function rhoe.account_invites_guard() returns trigger
language plpgsql
as $$
begin
  if old.accepted_at is not null or old.revoked_at is not null then
    raise exception 'this invite was already used or withdrawn';
  end if;
  if (to_jsonb(new) - 'accepted_at' - 'accepted_by' - 'revoked_at') <> (to_jsonb(old) - 'accepted_at' - 'accepted_by' - 'revoked_at') then
    raise exception 'only an invite''s acceptance or withdrawal can change';
  end if;
  return new;
end;
$$;
create trigger account_invites_guard before update on rhoe.account_invites
  for each row execute function rhoe.account_invites_guard();

-- A profile can only point at an account its owner belongs to.
create or replace function rhoe.profiles_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.current_account_id is not null and not exists (
    select 1 from rhoe.account_members m where m.account_id = new.current_account_id and m.user_id = new.user_id
  ) then
    raise exception 'you are not a member of that account';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger profiles_guard before insert or update on rhoe.profiles
  for each row execute function rhoe.profiles_guard();

-- ---------------------------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------------------------
-- Accept every pending invite for the caller's confirmed email. Called after each sign-in.
-- Returns how many were accepted. An unconfirmed address accepts nothing.
create or replace function rhoe.accept_my_invites() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := nullif(rhoe.current_user_id(), '')::uuid;
  v_email text;
  v_count integer := 0;
  v_first text;
  inv record;
begin
  if v_uid is null then
    return 0;
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;
  insert into rhoe.profiles (user_id) values (v_uid) on conflict (user_id) do nothing;
  for inv in
    select * from rhoe.account_invites i
    where i.email = v_email and i.accepted_at is null and i.revoked_at is null
    order by i.invited_at
    for update
  loop
    insert into rhoe.account_members (account_id, user_id, role, added_by)
    values (inv.account_id, v_uid, inv.role, inv.invited_by)
    on conflict (account_id, user_id) do nothing;
    update rhoe.account_invites set accepted_at = now(), accepted_by = v_uid where invite_id = inv.invite_id;
    v_count := v_count + 1;
    v_first := coalesce(v_first, inv.account_id);
  end loop;
  if v_first is not null then
    update rhoe.profiles set current_account_id = v_first where user_id = v_uid and current_account_id is null;
  end if;
  return v_count;
end;
$$;

-- The current account's members with their login email and name. Members only.
create or replace function rhoe.account_member_list()
returns table (user_id uuid, email text, full_name text, role text, joined_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.user_id, u.email::text, p.full_name, m.role, m.joined_at
  from rhoe.account_members m
  join auth.users u on u.id = m.user_id
  left join rhoe.profiles p on p.user_id = m.user_id
  where m.account_id = rhoe.current_account_id()
    and rhoe.current_account_role() is not null
  order by m.joined_at, u.email;
$$;

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------
alter table rhoe.accounts enable row level security;
alter table rhoe.account_members enable row level security;
alter table rhoe.profiles enable row level security;
alter table rhoe.account_invites enable row level security;

-- Accounts: see every account you belong to (for switching); admins rename the current one.
create policy accounts_select on rhoe.accounts for select to authenticated
  using (exists (select 1 from rhoe.account_members m where m.account_id = accounts.account_id and m.user_id::text = rhoe.current_user_id()));
create policy accounts_update on rhoe.accounts for update to authenticated
  using (account_id = rhoe.current_account_id() and rhoe.is_account_admin())
  with check (account_id = rhoe.current_account_id());
grant select on rhoe.accounts to authenticated;
grant update (name) on rhoe.accounts to authenticated;

-- Members: see your own memberships and the current account's members. Admins change roles and
-- remove people; anyone may leave (the last admin cannot, by trigger). Joining is only through
-- an invite (accept_my_invites) or the owner's seed.
create policy account_members_select on rhoe.account_members for select to authenticated
  using (user_id::text = rhoe.current_user_id() or account_id = rhoe.current_account_id());
create policy account_members_update on rhoe.account_members for update to authenticated
  using (account_id = rhoe.current_account_id() and rhoe.is_account_admin())
  with check (account_id = rhoe.current_account_id());
create policy account_members_delete on rhoe.account_members for delete to authenticated
  using (account_id = rhoe.current_account_id() and (rhoe.is_account_admin() or user_id::text = rhoe.current_user_id()));
grant select, delete on rhoe.account_members to authenticated;
grant update (role) on rhoe.account_members to authenticated;

-- Profiles: your own only.
create policy profiles_select on rhoe.profiles for select to authenticated using (user_id::text = rhoe.current_user_id());
create policy profiles_insert on rhoe.profiles for insert to authenticated with check (user_id::text = rhoe.current_user_id());
create policy profiles_update on rhoe.profiles for update to authenticated
  using (user_id::text = rhoe.current_user_id()) with check (user_id::text = rhoe.current_user_id());
grant select, insert on rhoe.profiles to authenticated;
grant update (full_name, phone, current_account_id) on rhoe.profiles to authenticated;

-- Invites: the current account's admins create, list and withdraw them.
create policy account_invites_select on rhoe.account_invites for select to authenticated
  using (account_id = rhoe.current_account_id() and rhoe.is_account_admin());
create policy account_invites_insert on rhoe.account_invites for insert to authenticated
  with check (account_id = rhoe.current_account_id() and rhoe.is_account_admin()
              and invited_by::text = rhoe.current_user_id() and accepted_at is null and revoked_at is null);
create policy account_invites_update on rhoe.account_invites for update to authenticated
  using (account_id = rhoe.current_account_id() and rhoe.is_account_admin())
  with check (account_id = rhoe.current_account_id());
grant select on rhoe.account_invites to authenticated;
grant insert (account_id, email, role, invited_by) on rhoe.account_invites to authenticated;
grant update (revoked_at) on rhoe.account_invites to authenticated;

-- Functions: signed-in callers only.
revoke execute on function rhoe.accept_my_invites() from public, anon;
revoke execute on function rhoe.account_member_list() from public, anon;
revoke execute on function rhoe.whoami() from public, anon;
grant execute on function rhoe.accept_my_invites() to authenticated;
grant execute on function rhoe.account_member_list() to authenticated;
grant execute on function rhoe.whoami() to authenticated;
