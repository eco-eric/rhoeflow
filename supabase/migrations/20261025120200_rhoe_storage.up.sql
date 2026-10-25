-- Storage policies (WO-03 C1): the `rhoe-runs` bucket for artifact bundles and the `rhoe-media`
-- bucket jobstore-local uses in the interim (ADR-031). Both private; signed-in users only; a
-- team reads and writes under its own prefix (`<workedge_team_id>/...`); nothing is updated or
-- deleted through the API (frozen bundles; media migrates to WorkEdge by a later tool).

insert into storage.buckets (id, name, public)
values ('rhoe-runs', 'rhoe-runs', false), ('rhoe-media', 'rhoe-media', false)
on conflict (id) do update set public = false;

create policy rhoe_runs_select on storage.objects for select to authenticated
  using (bucket_id = 'rhoe-runs' and (storage.foldername(name))[1] = rhoe.current_team_id());
create policy rhoe_runs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'rhoe-runs' and (storage.foldername(name))[1] = rhoe.current_team_id());

create policy rhoe_media_select on storage.objects for select to authenticated
  using (bucket_id = 'rhoe-media' and (storage.foldername(name))[1] = rhoe.current_team_id());
create policy rhoe_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'rhoe-media' and (storage.foldername(name))[1] = rhoe.current_team_id());
