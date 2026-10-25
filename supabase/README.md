# RhoeFlow's own Supabase objects

RhoeFlow stores only its own data here (ADR-028, ADR-013 data half): assessments, accepted
revisions, scenarios, frozen runs, artifact file lists, report revisions and templates, all in
schema `rhoe`. There is no table for a job, customer, property, photo file or user; WorkEdge is
read through `JobStore` only (ADR-031).

## Applying migrations (owner decision WO-03 §3 item 4)

No Supabase CLI. Paste each `*.up.sql` into the Dashboard SQL editor in file-name order:

1. `20261025120000_rhoe_core.up.sql`
2. `20261025120100_rhoe_templates.up.sql`
3. `20261025120200_rhoe_storage.up.sql`

Then, once: Dashboard → Settings → API → **Exposed schemas**: add `rhoe` (PostgREST will not
serve the schema otherwise). Each `*.down.sql` reverses its `up`; run downs in reverse order.

## Identity

`rhoe.current_team_id()` is the single place that reads the team from the session JWT
(`app_metadata.workedge_team_id`, falling back to a top-level `workedge_team_id` claim). WO-03 A1
confirms the claim path once WorkEdge publishes signing keys; if it differs, change that one
function. Every policy and the storage prefix rule go through it. `anon` has no grants.

## Checks the owner runs

- `tests/rls_cross_team.sql`: cross-team negative tests inside a rolled-back transaction
  (SEC-001). Expected output: `RLS cross-team: all checks passed`.
- `tests/invariants.sql`: the trigger and index rules below, inside a rolled-back transaction.
  Expected output: `rhoe invariants: all checks passed`.
- `seed/template_editor_grant.sql`: the first template editor (C7). Fill in both ids.

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
| Template edits need a grant | `rhoe.is_template_editor()` in the template policies |

`packages/store/src/memory-db.ts` mirrors every one of these so the services are tested without a
database; the comments there name the index or trigger each rule corresponds to.

## Verification status (WO-03 Track C build session, 2026-10-25)

The three ups, `tests/rls_cross_team.sql` and `tests/invariants.sql` were executed in order on a
scratch PostgreSQL 16.15 cluster with a small shim standing in for Supabase's `anon` and
`authenticated` roles and its `storage.buckets` / `storage.objects` / `storage.foldername()`;
both tests printed their pass notice. They have **not** been run against the real Supabase
project: the build session had no credentials. The owner's SQL-editor run of the three ups and
both tests is the verification the definition of done asks for.
