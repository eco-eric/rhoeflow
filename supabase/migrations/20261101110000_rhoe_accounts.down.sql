-- Down for 20261101110000_rhoe_accounts. Run the workedge_connections down first if applied.
-- Removes accounts, members, profiles and invites. Every policy then refuses everything again,
-- because rhoe.current_account_id() goes back to returning null.
do $$
declare
  t text;
begin
  foreach t in array array['assessments', 'assessment_revisions', 'scenarios', 'calc_runs', 'run_artifacts', 'reports', 'templates', 'template_versions', 'template_editors'] loop
    execute format('alter table rhoe.%I drop constraint if exists %I', t, t || '_account_fk');
  end loop;
end;
$$;

create or replace function rhoe.current_account_id() returns text
language sql stable security invoker set search_path = ''
as $$
  select null::text;
$$;

create or replace function rhoe.is_template_editor() returns boolean
language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from rhoe.template_editors e
    where e.account_id = rhoe.current_account_id() and e.user_id = rhoe.current_user_id()
  );
$$;

drop table if exists rhoe.account_invites;
drop table if exists rhoe.profiles;
drop table if exists rhoe.accounts cascade;  -- with its policies, which read account_members
drop table if exists rhoe.account_members;
drop function if exists rhoe.accept_my_invites();
drop function if exists rhoe.account_member_list();
drop function if exists rhoe.whoami();
drop function if exists rhoe.is_account_admin();
drop function if exists rhoe.current_account_role();
drop function if exists rhoe.account_members_keep_admin();
drop function if exists rhoe.account_members_guard();
drop function if exists rhoe.account_invites_guard();
drop function if exists rhoe.profiles_guard();
