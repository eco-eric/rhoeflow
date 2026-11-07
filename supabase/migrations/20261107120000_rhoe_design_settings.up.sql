-- Design conditions per account (ADR-047, amends ADR-034; owner 2026-11-06). Each account may set
-- its own indoor heating and cooling set points and, per weather station, its own outdoor winter and
-- summer design temperatures. A missing value means "use the standard value" (Manual J 70 F / 75 F
-- and the station's ASHRAE 99 % / 1 % dry bulbs), so an account with no row computes as before.
-- The values live in one jsonb document validated by the app (AccountDesignDefaultsSchema):
--   { "heating_setpoint_f": 70, "cooling_setpoint_f": 75,
--     "stations": { "722590": { "heating_design_temp_f": 25.9, "cooling_design_temp_f": 101 } } }
-- Everyone in the account reads them; only the account's admins change them. A load calc copies
-- the values it used into its accepted revision, so changing a default never rewrites a frozen run.

create table rhoe.account_design_settings (
  account_id  text primary key references rhoe.accounts (account_id),
  defaults    jsonb not null default '{"stations": {}}'::jsonb
              check (jsonb_typeof(defaults) = 'object' and pg_column_size(defaults) <= 8192),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table rhoe.account_design_settings enable row level security;
alter table rhoe.account_design_settings force row level security;
create policy account_design_settings_select on rhoe.account_design_settings for select to authenticated
  using (account_id = rhoe.current_account_id());
create policy account_design_settings_insert on rhoe.account_design_settings for insert to authenticated
  with check (account_id = rhoe.current_account_id() and rhoe.is_account_admin());
create policy account_design_settings_update on rhoe.account_design_settings for update to authenticated
  using (account_id = rhoe.current_account_id() and rhoe.is_account_admin())
  with check (account_id = rhoe.current_account_id());
grant select, insert, update on rhoe.account_design_settings to authenticated;
-- No delete: clearing every value saves an empty document.
