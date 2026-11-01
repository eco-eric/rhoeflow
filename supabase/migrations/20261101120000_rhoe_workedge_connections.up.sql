-- Each account's own WorkEdge connection (ADR-038). One row per RhoeFlow account. The key
-- is stored only as AES-256-GCM ciphertext; the master key is the Worker secret
-- RHOE_CONNECTION_KEY and never reaches the database. Only the account's admins manage it (ADR-039).

-- Connecting WorkEdge is an account admin's right (ADR-039 replaces ADR-038's grant list).
create or replace function rhoe.is_connection_admin() returns boolean
language sql stable
as $$
  select rhoe.is_account_admin();
$$;

create table rhoe.workedge_connections (
  account_id        text primary key references rhoe.accounts (account_id) on delete cascade,
  credential_kind   text not null check (credential_kind in ('api_key', 'oauth')),
  ciphertext        text not null check (length(ciphertext) between 16 and 8192),
  iv                text not null check (length(iv) = 16),
  key_version       integer not null check (key_version >= 1),
  key_hint          text not null check (length(key_hint) between 1 and 8),
  connected_by      text,
  connected_at      timestamptz not null default now(),
  last_checked_at   timestamptz not null default now()
);

alter table rhoe.workedge_connections enable row level security;
alter table rhoe.workedge_connections force row level security;

-- Members see whether their account is connected (the row holds only ciphertext and a 4-character
-- hint); only admins write it. Nobody sees another account's row.
create policy workedge_connections_select on rhoe.workedge_connections for select to authenticated using (account_id = rhoe.current_account_id());
create policy workedge_connections_insert on rhoe.workedge_connections for insert to authenticated with check (account_id = rhoe.current_account_id() and rhoe.is_connection_admin());
create policy workedge_connections_update on rhoe.workedge_connections for update to authenticated using (account_id = rhoe.current_account_id() and rhoe.is_connection_admin()) with check (account_id = rhoe.current_account_id());
create policy workedge_connections_delete on rhoe.workedge_connections for delete to authenticated using (account_id = rhoe.current_account_id() and rhoe.is_connection_admin());


grant select, insert, update, delete on rhoe.workedge_connections to authenticated;

-- The first admin of an account comes from supabase/seed/first_account.sql (ADR-039).
