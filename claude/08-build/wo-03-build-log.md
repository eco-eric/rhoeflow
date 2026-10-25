# WO-03 build log

Environment facts and in-scope decisions made while building, kept so the next session does not
rediscover them. Format follows `wo-01-build-log.md`.

## Track C (persistence), 2026-10-25, cloud session

### Environment

- **Node.** The cloud container shipped Node 22.22.0; the repo requires `>=24`. pnpm could not
  manage Node (`ERR_PNPM_CANNOT_MANAGE_NODE`: pnpm was not installed by the standalone script),
  so Node v24.22.1 was downloaded from nodejs.org, checked against `SHASUMS256.txt`, extracted to
  `/opt/node24` and put first on `PATH`. Everything below ran on it.
- **PostgreSQL 16.15 is installed in the container.** A scratch cluster (`initdb` as the
  `postgres` user, unix socket, port 5433) was used to execute the migrations and the SQL tests.
  A shim created the `anon` and `authenticated` roles, `storage.buckets`, `storage.objects` with
  RLS and `storage.foldername()`, which plain PostgreSQL lacks and Supabase provides.
- **No Supabase credentials** in the session (none are in the repo by design). Nothing was run
  against the real project; the routes in `apps/web/app/api` were typechecked and built with
  `next build`, not exercised. Live sign-in also waits on A1 (WorkEdge signing keys).

### Decisions inside WO-03 scope (no new ADRs)

- **Schema `rhoe`, not `public`.** The Auth tenant is shared with WorkEdge (standard §7), so the
  Supabase project may be shared too; a dedicated schema cannot collide with WorkEdge tables and
  `drop schema rhoe cascade` is the whole rollback (§8). PostgREST must expose `rhoe` once
  (README). The supabase-js adapter calls `.schema("rhoe")`.
- **One function decides the team.** `rhoe.current_team_id()` reads
  `app_metadata.workedge_team_id` (fallback: a top-level claim); every policy and the storage
  prefix rule go through it, and `apps/web/lib/context.ts` reads the same claim. A1 may change
  the claim path; those are the two places.
- **Services talk to a narrow `StoreDb` interface.** `MemoryStoreDb` mirrors every SQL
  constraint with a comment naming the index or trigger; the services are tested against it
  (48 tests) and the Supabase adapter is mechanical. Rows are zod-parsed on the way out of
  PostgREST so a column drift fails at the boundary.
- **Drafts are identity-checked, revisions fully validated.** A draft may be incomplete (C2) but
  must keep `assessment_id` and the WorkEdge ids of its row (ADR-028). Accepting runs
  `validateAssessment` (shape and invariants), stores the snapshot with its content hash, bumps
  `revision` by exactly one and re-syncs the draft to the accepted snapshot.
- **Runs are idempotent twice.** By the caller's `idempotency_key` (unique per assessment) and by
  content: an `ok` run with the same input hash and engine version is returned, not repeated;
  the partial unique index `calc_runs_one_accepted` makes two accepted runs of one frozen input
  impossible under retry, cancel or timeout (API-002). Status machine:
  `running -> ok | error | cancelled | timed_out`; terminal rows change only their stale flags.
- **No run row when the input cannot run.** If `prepareInput` refuses (proposed or unknown
  fields, unpinned station), the service returns the structured issues (ENG-007) and records
  nothing: a run that did not run is not a run. The client shows the issues as blocking (D5).
- **Overrides are applied by the store and checked by the engine.** `ScenarioOverride` replaces
  the whole provenance field at a path (value, unit, state, source) with a rationale and a
  label (`design` or `customer_preference`, QST-003). The store applies them to a copy of the
  accepted snapshot; `prepareInput` refuses a CalcInput whose assessment does not reflect its
  listed overrides, so a frozen input can never claim a scenario it did not run.
- **Comparisons read the frozen bundles**, not live rows: `frozen-input.json` and `output.json`
  of both runs. Changed fields come from walking both assessments; a change not explained by an
  override is labeled `revision_change` and `same_basis` says whether revision, weather, engine
  and methods agree. The notice says the comparison is design load only (SCN-002).
- **Fingerprints** (`inputs`, `weather`, `methods`, `template`) are stored per run. Stale marking:
  new accepted revision (runs on earlier revisions of that assessment), scenario edit (runs that
  froze the earlier scenario version), template version (runs recording the superseded
  `id@v<n>`), weather re-pin and engine version (helpers, not yet called by anything). A stale
  run keeps its numbers and is refused by `issueReport` and by the `reports` trigger.
- **Template versions are `v<n>`** per team; the repo's seven templates seed as `v1`
  (`source: repo`). Until a team seeds its store, `resolveTemplate` falls back to the repo copy
  with `template_version: null`, recorded in the fingerprint as `id@repo`. The band check carries
  the stored version string. Edit rights: the `template_editors` grant list, or a
  `template_editor` flag the session layer may set if A1 finds a role; the first grant is an SQL
  seed the owner runs.
- **The pure bundle builder** (`packages/calc/src/bundle-core.ts`) is shared by the CLI (writes a
  directory) and the server (writes the `rhoe-runs` bucket under `<team>/<assessment>/<run>/`);
  both carry the same `manifest.json` with SHA-256 per file. `writeBundle` became async.

### Dependencies added

| Package | Version | Where | Approval |
| --- | --- | --- | --- |
| @supabase/ssr | 0.12.7 | apps/web | WO-03 owner decision 10 |
| @supabase/supabase-js | ^2.118.0 | packages/store, apps/web | already in the stack (ADR-013) |
| zod | ^4.6.7 | apps/web (direct) | already in the stack |

### Left for the owner or a later item

- Apply the three migrations, expose `rhoe`, run `supabase/tests/*.sql`, run
  `supabase/seed/template_editor_grant.sql`, then `POST /api/templates/seed` once signed in.
- `markStaleForWeatherPin` and `markStaleForEngineVersion` exist but nothing calls them yet: a
  re-pin or an engine bump is a deliberate step in a work order, which should call them.
- `reapTimedOutRuns` is a function, not a schedule; the run route could call it on entry, or a
  Cloudflare cron trigger could (decide with E5).
- The media route uses jobstore-local over the user's client; the `rhoe-media` prefix rule in
  the storage policy matches jobstore-local's `<team>/<project>/<assessment>/...` paths.

## Track D slice 1 (field app quick pass), 2026-10-25, cloud session

### Environment

- **The pinned oracle is installable in the cloud container.** The Ubuntu 24.04 OpenStudio
  3.11.0 package and the OpenStudio-HPXML v1.12.0 archive from `pin.json` downloaded, matched
  their pinned SHA-256 and installed (`/usr/local/bin/openstudio`, `/opt/openstudio-hpxml`).
  `check-fixtures.mjs` then reproduced CI locally. Set `OPENSTUDIO_EXE` and
  `OPENSTUDIO_HPXML_DIR` to use it.
- **`next dev` never worked before this slice.** Turbopack, the Next 16 default, cannot map
  the workspace packages' NodeNext `./x.js` imports to their `.ts` sources. `next build` was
  unaffected because it reads `dist/`. Dev now runs on webpack with `resolve.extensionAlias`
  (`pnpm --filter @rhoeflow/web dev`).
- **Separate route bundles in dev** each carry their own copy of the workspace packages, so
  `instanceof StoreError` fails across them. `isStoreError` and `isJobStoreError` check
  structurally; production (one Worker bundle) did not need it but is no worse for it.

### Decisions inside WO-03 scope (no new ADRs)

- **Development memory store.** `pnpm --filter @rhoeflow/web dev:fixtures` sets
  `RHOE_DEV_MEMORY_STORE=1`: an in-process `MemoryStoreDb`, a fixed development team and user,
  and the fixture JobStore (A2's stand-in) with two illustrative jobs. It is gated on
  `NODE_ENV !== "production"`, which `next build` inlines, so a deployed Worker cannot reach it.
  It exists so the field app can be built and usability-tested before WorkEdge sign-in (A1).
- **The server builds what is frozen.** The phone builds the Assessment for its preview, and the
  server builds it again on accept from the answers and the stored template version. A frozen
  snapshot never depends on client code.
- **Accept is idempotent on content.** An unchanged draft returns the latest revision
  (`unchanged: true`), so tapping Run twice never mints revisions or marks runs stale.
- **Saves are queued.** One draft save is in flight at a time, and Run cancels the pending
  auto-save and flushes before it accepts. A 412 therefore always means another device. This
  was found by the end-to-end drive, where an auto-save landing between save and accept gave a
  false "Changed elsewhere".
- **Template choice is the tech's** (ADR-003). The app suggests templates from year built and
  stories, and the tech picks one. The pick is saved with the draft (`template_id` on the save
  request).

### Verified

- Five quick-pass reference houses, built only from answers plus a template: engine against
  the oracle within tolerance on totals and every component, with no unverified load-affecting
  oracle default. The oracle runs are committed under `claude/09-spikes/wo03-quickpass/`.
- An end-to-end drive in Chromium at 390 x 844, fixture job 1:
  - The minimum answers give 69,284 / 49,346 / 5,151 Btu/h, which equals fixture
    `qp-ranch-1964-slab`.
  - Changing the attic to "modern" marks the run out of date, and the next run is revision 2.
  - A blower-door ACH50 shows as measured.
  - An answer changed offline survives a reload.
  - The drive script is not committed: WO-03 decision 10 names Puppeteer for committed
    end-to-end tests and it is not yet a dependency, so the drive used the container's
    Playwright from the scratchpad.

### Not in this slice

D3 conflict records (tape against plan), D4 photo evidence, D9 template editor, live sign-in
(A1) and live WorkEdge reads (A2).

## Track D: template editor (D9), 2026-10-25

### Decisions inside WO-03 scope (no new ADRs)

- **Jobs are pinned to a template version.** A pick records `template_version` (`v<n>`, or
  null for the repo copy). Accept and run resolve the pinned version
  (`resolvePinnedTemplate`); a fresh pick resolves the current one (`resolveTemplate`).
  - This fixed a latent bug from Track C: a null version used to resolve to the store's
    *current* version, so an edit would have changed open jobs silently.
  - Now a new version reaches a job only when the tech takes it. The field app shows "has a
    newer version" with a button (ADR-003; REV-002).
- **The field app builds from the team's templates.** It reads `GET /api/templates` (current
  stored versions, or the repo set until seeded) for suggestions and for the preview. An older
  pinned version is fetched from the template's history. The preview therefore uses the same
  payload the server freezes.
- **Seeding needs an editor**, the same rule as any template edit (`canEditTemplates`: the
  session's role flag or the grant list).
- **The editor refuses a value without a source in two places.** The template schema
  (`sources` min 1 on every slot and on the band) disables Save, and the server parses the
  payload again on save.
- **Before saving, the editor shows two lists.** One is `diffTemplates` against the current
  version, which keys sources by id so a reorder is not a change. The other is the open jobs
  that picked the template, with the version each is on.

### Verified

- Unit tests: pinning survives a seed and an edit (the same frozen input returns the same run);
  current templates and archived ones; the seed permission; the affected list and the detail
  view; the diff and suggestion helpers.
- Chromium drive, phone for the field app and 1280 px desktop for the editor:
  1. A job ran on the repo copy (band 350 to 450).
  2. The templates were loaded into the store.
  3. Removing a slot's only source disabled Save.
  4. The band was set to 400 to 500. The review showed 2 changes and 1 open job, and v2 was
     saved.
  5. The job was offered v2, took it and ran again. The result showed the 400 to 500 band and
     the warning "352 ft2 per ton ... outside the 400 to 500 band".
  6. A copy under a new id was created at v1.
