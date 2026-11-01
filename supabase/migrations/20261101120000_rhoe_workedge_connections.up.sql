-- Each account's own WorkEdge connection (ADR-038). One row per account (WorkEdge team). The key
-- is stored only as AES-256-GCM ciphertext; the master key is the Worker secret
-- RHOE_CONNECTION_KEY and never reaches the database. Manage rights come from a grant list of
-- WorkEdge user ids, like rhoe.template_editors (no user table, ADR-028).

create table rhoe.connection_admins (
  workedge_team_id  text not null,
  workedge_user_id  text not null,
  granted_by        text,
  granted_at        timestamptz not null default now(),
  primary key (workedge_team_id, workedge_user_id)
);

create or replace function rhoe.is_connection_admin() returns boolean
language sql stable
as $$
  select exists (
    select 1 from rhoe.connection_admins a
    where a.workedge_team_id = rhoe.current_team_id() and a.workedge_user_id = rhoe.current_user_id()
  );
$$;

create table rhoe.workedge_connections (
  workedge_team_id  text primary key,
  credential_kind   text not null check (credential_kind in ('api_key', 'oauth')),
  ciphertext        text not null check (length(ciphertext) between 16 and 8192),
  iv                text not null check (length(iv) = 16),
  key_version       integer not null check (key_version >= 1),
  key_hint          text not null check (length(key_hint) between 1 and 8),
  connected_by      text,
  connected_at      timestamptz not null default now(),
  last_checked_at   timestamptz not null default now()
);

alter table rhoe.connection_admins enable row level security;
alter table rhoe.connection_admins force row level security;
alter table rhoe.workedge_connections enable row level security;
alter table rhoe.workedge_connections force row level security;

-- Members see whether their account is connected (the row holds only ciphertext and a 4-character
-- hint); only admins write it. Nobody sees another account's row.
create policy workedge_connections_select on rhoe.workedge_connections for select to authenticated using (workedge_team_id = rhoe.current_team_id());
create policy workedge_connections_insert on rhoe.workedge_connections for insert to authenticated with check (workedge_team_id = rhoe.current_team_id() and rhoe.is_connection_admin());
create policy workedge_connections_update on rhoe.workedge_connections for update to authenticated using (workedge_team_id = rhoe.current_team_id() and rhoe.is_connection_admin()) with check (workedge_team_id = rhoe.current_team_id());
create policy workedge_connections_delete on rhoe.workedge_connections for delete to authenticated using (workedge_team_id = rhoe.current_team_id() and rhoe.is_connection_admin());

create policy connection_admins_select on rhoe.connection_admins for select to authenticated using (workedge_team_id = rhoe.current_team_id());
create policy connection_admins_insert on rhoe.connection_admins for insert to authenticated with check (workedge_team_id = rhoe.current_team_id() and rhoe.is_connection_admin());
create policy connection_admins_delete on rhoe.connection_admins for delete to authenticated using (workedge_team_id = rhoe.current_team_id() and rhoe.is_connection_admin() and workedge_user_id <> rhoe.current_user_id());

grant select, insert, update, delete on rhoe.workedge_connections to authenticated;
grant select, insert, delete on rhoe.connection_admins to authenticated;

-- The first admin of an account is added by the owner in the SQL editor (see supabase/README.md):
--   insert into rhoe.connection_admins (workedge_team_id, workedge_user_id, granted_by)
--   values ('<team id>', '<user id>', 'owner-seed');
