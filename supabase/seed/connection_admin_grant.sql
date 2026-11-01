-- First admin who may connect an account's WorkEdge (ADR-038). Run once per account in the
-- Dashboard SQL editor after 20261101120000_rhoe_workedge_connections.up.sql. Both ids come from
-- the WorkEdge sign-in: the team is app_metadata.workedge_team_id, the user is the session's sub.
insert into rhoe.connection_admins (workedge_team_id, workedge_user_id, granted_by)
values ('<workedge team id>', '<workedge user id>', 'owner-seed')
on conflict do nothing;
