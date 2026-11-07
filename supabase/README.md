# RhoeFlow's own Supabase objects

RhoeFlow stores only its own data here (ADR-028, ADR-013 data half): assessments, accepted
revisions, scenarios, frozen runs, artifact file lists, report revisions and templates, all in
schema `rhoe`, plus RhoeFlow's own accounts (ADR-039): accounts, their members and roles, invites
and each login's profile. People are RhoeFlow's own Supabase Auth logins. Each account also keeps
its own jobs (ADR-040): a name, customer name and address, with an optional link to a WorkEdge job.
There is no photo-file table; a linked WorkEdge job is read through `JobStore` only (ADR-031).

## Applying migrations (owner decision WO-03 §3 item 4)

No Supabase CLI. Paste each `*.up.sql` into the Dashboard SQL editor in file-name order:

1. `20261025120000_rhoe_core.up.sql`
2. `20261025120100_rhoe_templates.up.sql`
3. `20261025120200_rhoe_storage.up.sql`
4. `20261025140000_rhoe_quick_pass.up.sql` (WO-03 Track D: quick-pass answers on accepted revisions)
5. `20261101110000_rhoe_accounts.up.sql` (ADR-039: accounts, members and roles, invites,
   profiles, and `rhoe.current_account_id()`).
6. `20261101120000_rhoe_workedge_connections.up.sql` (ADR-038: each account's own WorkEdge
   connection, stored encrypted; account admins manage it).
7. `20261102120000_rhoe_jobs.up.sql` (ADR-040: RhoeFlow's own jobs; every assessment belongs to
   one job; the WorkEdge link is optional).
8. `20261103120000_rhoe_jobs_archive.up.sql` (ADR-042: archive a job and bring it back; a
   generated `search_text` column for searching saved load calcs). Apply it before the app
   version that reads `archived_at` goes live.
9. `20261105120000_rhoe_house_facts.up.sql` (ADR-043: `rhoe.job_sites`, each job's map point and
   house-fact readings with their sources; `rhoe.county_property`, the appraisal-district rows,
   readable by any signed-in user and written only by the yearly import). Apply it before the
   app version with the House facts card goes live. `county_property` stays empty until a county
   file is imported, and the lookup then uses RentCast alone.
10. `20261107120000_rhoe_design_settings.up.sql` (ADR-047: `rhoe.account_design_settings`, each
   account's set points and outdoor design temperatures; members read, admins write). The app works
   before it is applied (every value is standard). Then run `seed/truficient_design_defaults.sql`
   once to set Truficient's DFW summer design temperature to 101 °F.
11. `20261107130000_rhoe_county_detail.up.sql` (ADR-048: ZIP, heating, cooling, roof, exterior
   and garage wording on `county_property`, a street-only key for the street-and-ZIP match, and
   `rhoe.county_imports`, the log of each county load). Apply it before the app version that
   reads those columns goes live, and before the first county load (`tools/county-import`).

Then, once (after the first three): Dashboard → Settings → API → **Exposed schemas**: add `rhoe` (PostgREST will not
serve the schema otherwise). Each `*.down.sql` reverses its `up`; run downs in reverse order.

## Identity (ADR-039)

People sign in with RhoeFlow's own Supabase Auth, by email and password or an emailed one-time code. `rhoe.current_account_id()`
is the single place that decides which account a request acts for: the account on the caller's
profile if they are still a member there, otherwise their oldest membership, otherwise null (a
login with no account sees nothing). It is a database lookup, not a token claim, so removing
someone or changing their role takes effect on their next request and there is no Auth hook to
configure. Every policy and the storage prefix rule go through it. `anon` has no grants.

Roles are `admin` and `member` on `rhoe.account_members`. Admins rename the account, invite and
remove people, change roles, edit templates and connect WorkEdge; the database refuses removing or
demoting an account's last admin. Invites are rows keyed by email; `rhoe.accept_my_invites()`
accepts them for the caller's confirmed address on sign-in.

## Checks the owner runs

- `tests/rls_cross_team.sql`: cross-account negative tests inside a rolled-back transaction
  (SEC-001). Expected output: `RLS cross-account: all checks passed`.
- `tests/accounts.sql`: members acting as admins, another account's admin, the last admin,
  invites taken by an unconfirmed or different email, profiles. Expected output:
  `accounts: all checks passed`.
- `tests/invariants.sql`: the trigger and index rules below, inside a rolled-back transaction.
  Expected output: `rhoe invariants: all checks passed`.
- `seed/first_account.sql`: creates an account and makes an existing login its first admin. Fill
  in the account name and the login's email (create the login first under Authentication →
  Users, with auto confirm). There is no self-serve account creation yet.
- `seed/template_editor_grant.sql`: optional; lets a member who is not an admin edit templates
  (C7). Fill in the account id and the member's email.

`tests/local/run.sh` runs every up, every down, every up again and all three tests on a scratch
PostgreSQL 16 with `tests/local/supabase-shim.sql` standing in for Supabase's roles, `auth.users`
and storage.

## Invariants enforced in the database

| Rule | Where |
| --- | --- |
| One open assessment per WorkEdge project | `assessments_one_open_per_project` |
| Revision grows by one; an assessment is never re-pointed at another job | trigger `assessments_guard` |
| Accepted revisions, artifact rows and template versions never change | trigger `immutable_row` |
| A finished run changes only its stale flags; a stale run never becomes fresh | trigger `calc_runs_guard` |
| One accepted (`ok`) run per frozen input and engine version | `calc_runs_one_accepted` |
| One run per (assessment, idempotency key) | unique constraint on `calc_runs` |
| A report needs a fresh `ok` run of the same assessment; issued reports only change write-back bookkeeping | triggers `reports_require_fresh_ok_run`, `reports_guard` |
| Child rows carry their parent's team | triggers `child_team_matches`, `run_child_team_matches` |
| Template edits need an admin or a grant | `rhoe.is_template_editor()` in the template policies |
| Every tenant row belongs to a real account | `<table>_account_fk` foreign keys to `rhoe.accounts` |
| An account keeps at least one admin | trigger `account_members_keep_admin` |
| A membership changes only its role, and only an admin of that account changes it | trigger `account_members_guard`, policy `account_members_update` |
| One pending invite per account and email; accepted or withdrawn invites never reopen | `account_invites_one_pending`, trigger `account_invites_guard` |

`packages/store/src/memory-db.ts` mirrors every one of these so the services are tested without a
database; the comments there name the index or trigger each rule corresponds to.

## Verification status (WO-03 Track C build session, 2026-10-25)

The three ups, `tests/rls_cross_team.sql` and `tests/invariants.sql` were executed in order on a
scratch PostgreSQL 16.15 cluster with a small shim standing in for Supabase's `anon` and
`authenticated` roles and its `storage.buckets` / `storage.objects` / `storage.foldername()`;
both tests printed their pass notice. They have **not** been run against the real Supabase
project: the build session had no credentials. The owner's SQL-editor run of the three ups and
both tests is the verification the definition of done asks for.

## Verification status (ADR-039 accounts build, 2026-11-01)

All six ups, all six downs in reverse, all six ups again, then `tests/accounts.sql`,
`tests/invariants.sql` and `tests/rls_cross_team.sql` ran with `tests/local/run.sh` on PostgreSQL
16; all three printed their pass notice. Not run against the real Supabase project.
