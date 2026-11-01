-- LOCAL TESTING ONLY. Never run this in a Supabase project: Supabase already has all of it.
-- Stands in for what plain PostgreSQL lacks so the migrations and tests run on a scratch cluster:
-- the anon/authenticated roles, auth.users, and the storage tables and helper the storage
-- migration uses.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               varchar(255),
  email_confirmed_at  timestamptz,
  created_at          timestamptz not null default now()
);
grant usage on schema auth to authenticated, anon;

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean default false);
create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]; $$;
grant usage on schema storage to authenticated;
grant select, insert on storage.objects to authenticated;
