-- Let a member who is not an admin edit templates (WO-03 C7, owner decision 5; ADR-039). Account
-- admins can already edit templates and need no row here. Run in the SQL editor; replace the email.
insert into rhoe.template_editors (account_id, user_id, granted_by)
select m.account_id, m.user_id::text, 'seed: supabase/seed/template_editor_grant.sql'
from rhoe.account_members m
join auth.users u on u.id = m.user_id
where lower(u.email) = lower('member@example.com')   -- <- the member's login email
on conflict do nothing;
