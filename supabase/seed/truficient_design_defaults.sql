-- Truficient's design defaults (ADR-047, owner 2026-11-06: "change the default temp for DFW for the
-- summer as 101"). Run once in the Supabase SQL editor after 20261107120000_rhoe_design_settings.up.sql.
-- Sets the DFW station (722590) summer design temperature to 101 F for the account whose admin is
-- the email below; every other value stays standard. Admins can change it later under
-- Settings -> Design conditions. Running it again replaces only the DFW summer value.
do $$
declare
  v_admin_email text := lower('eric@truficient.com');   -- <- an admin of the account
  v_account text;
begin
  select m.account_id into v_account
  from rhoe.account_members m join auth.users u on u.id = m.user_id
  where lower(u.email) = v_admin_email and m.role = 'admin'
  order by m.account_id limit 1;
  if v_account is null then
    raise exception 'no account has % as an admin', v_admin_email;
  end if;

  insert into rhoe.account_design_settings (account_id, defaults, updated_at)
  values (v_account, '{"stations": {"722590": {"cooling_design_temp_f": 101}}}'::jsonb, now())
  on conflict (account_id) do update
    set defaults = jsonb_set(
          coalesce(rhoe.account_design_settings.defaults, '{}'::jsonb) || jsonb_build_object('stations', coalesce(rhoe.account_design_settings.defaults -> 'stations', '{}'::jsonb)),
          '{stations,722590}',
          coalesce(rhoe.account_design_settings.defaults #> '{stations,722590}', '{}'::jsonb) || '{"cooling_design_temp_f": 101}'::jsonb),
        updated_at = now();

  raise notice 'DFW summer design temperature set to 101 F for account %.', v_account;
end;
$$;
