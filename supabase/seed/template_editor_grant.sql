-- First template editor (WO-03 C7). Run once in the SQL editor (it runs as the owner role, so
-- row-level security does not apply). Replace both placeholders; the user id is the `sub`
-- claim of the owner's WorkEdge session, the team id the one A1 confirms.
insert into rhoe.template_editors (workedge_team_id, workedge_user_id, granted_by)
values ('<WORKEDGE_TEAM_ID>', '<OWNER_WORKEDGE_USER_ID>', 'seed: supabase/seed/template_editor_grant.sql')
on conflict do nothing;
