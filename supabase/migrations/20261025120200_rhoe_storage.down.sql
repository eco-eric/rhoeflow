-- Down for 20261025120200_rhoe_storage. Policies only; the buckets and their objects are kept
-- (frozen bundles and un-migrated media are not deleted by a rollback).
drop policy if exists rhoe_runs_select on storage.objects;
drop policy if exists rhoe_runs_insert on storage.objects;
drop policy if exists rhoe_media_select on storage.objects;
drop policy if exists rhoe_media_insert on storage.objects;
