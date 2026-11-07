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

## Track D: conflicting values (D3), 2026-10-25

- **Kept, not overwritten.** A new answer from a different state or source moves the old one
  into `alternatives`. A re-entry from the same state and source is a typo fix and replaces it.
  The value in use is never also listed as an alternative.
- **A reason is required.** A conflict with a different value is an error until the tech gives
  one; a matching value from another source corroborates and needs none. The reason and every
  conflicting value go into the note on each field the question sets, so the frozen run and the
  report show them.
- **Verified.** Unit tests: blocked without a reason, the note text, corroboration, object
  answers. Chromium drive on fixture job 2:
  1. WorkEdge's documented 2,820 ft² against a tape-measured 2,790 kept both.
  2. Run was disabled with the conflict named.
  3. "Use this instead" swapped the values both ways.
  4. Once a reason was given, the run went through.
  5. The frozen field read 2,790, measured, with the note naming 2,820 and the reason, and the
     draft kept 2,820 as the alternative.
- **One drive quirk, not an app defect.** Under Playwright's mobile-emulation profile, one
  click after "Room over the garage: Yes" never passed Playwright's stability check. A DOM
  mutation count over 2 s showed no churn. The same drive at the same 390 px width without the
  emulation profile passes.

## Track E: sensitivity cases (E4), 2026-10-25

- **Seven fixtures.** One base and six one-input changes: glazing amount, ACH50, duct location,
  heating design temperature, cooling design temperature, and a rotated R01 ranch for
  orientation. Each case's expected direction and size, with the reason, is in
  `claude/06-architecture/sensitivity-cases.md`.
- **Every expectation checked twice.** `packages/calc/test/sensitivity.test.ts` checks it on the
  engine (exact ratios: windows ×1.467, infiltration ×1.5, conduction heating ×1.1133) and on the
  committed oracle runs in `claude/09-spikes/wo03-sensitivity/runs/`, to the oracle's 1 Btu/h
  rounding.
- **Two defects found and fixed.**
  1. A moved cooling design temperature changed the engine's outdoor moisture. The oracle keeps
     the station's own DB/MCWB pair. Fixed in `MJ8.design_conditions` 0.1.1.
  2. The quick pass gave ducts inside conditioned space the template's 20 % leakage to outside,
     which the oracle rejects. They now get 0 unless a duct-blaster number is given.
  No previously committed result changed.
- **Verified.** The local oracle check returned `ok` on all 18 fixtures. The test output is in
  the PR.

## Track E: report pages (E1), 2026-10-26

- **From the frozen run only.** `/r/<run id>` reads the run row and the run's `output.json`. It
  checks the file's SHA-256 against the run's artifact record before reading it, then builds
  the report with `packages/report`, a new pure TypeScript package with no DOM or Node
  dependencies.
  - The address line comes from WorkEdge through the JobStore at render time and is not stored.
  - A run that is not `ok`, or an output from another run, is refused.
  - A stale run renders under a banner saying to run the assessment again.
- **Engine 0.3.0.** Each component now carries the values its method used (net area or
  perimeter, U or F, HTM, azimuth, CFM, occupants, duct sides). The output carries the design
  conditions: station, temperatures used, HTD and CTD, grains, pressure. No load changed:
  - All 18 fixtures still match.
  - HTM × area reproduces every component load exactly.

  The version also covers E4's `MJ8.design_conditions` 0.1.1 fix. Runs made on 0.2.0 become
  stale, but they still render, labelled as not having the detail.
- **Rounding rules.** Rules are defined per kind of value (`packages/report/src/rounding.ts`).
  The report-model tests check every printed number on all 18 fixtures against its raw value
  and rule. The drive re-checked all 279 numbers on a rendered page and found 0 mismatches.
- **Pages.**
  - Summary: home, loads, sanity figures with the template band, design conditions, and what
    was measured versus assumed.
  - "Not part of this report": Manual S, room-by-room loads, Manual D.
  - Technical pages: design conditions with any overrides of the station's values,
    construction components, the load worksheet, the run record, and all inputs with their
    sources.
  - Notices: independent software, not an approval, OpenStudio-HPXML. The wording is a draft
    for the owner.
- **Verified.**
  - `pnpm verify`.
  - Report tests (26) and output-detail tests (23).
  - A Chromium drive from quick pass to run to report:
    1. The report's totals equal the results screen: 69,284 / 49,346 / 5,151 Btu/h, 4.54 tons.
    2. The worksheet has 15 rows, and its total row is the run's.
    3. Every section, excluded page and notice is present.
    4. A malformed id and an unknown run show errors.
    5. There were no page errors.


## Track E: PDF (E2), 2026-11-01

- **Renderer.** Cloudflare Browser Run's `pdf` Quick Action through the Worker's `BROWSER`
  binding (ADR-037, approved by the owner 2026-11-01). `GET /r/<run id>/pdf` loads the run as the
  page does, refuses a stale run, prints, and returns the file with its SHA-256. Nothing is
  stored yet; storing an issued PDF and write-back are E3.
- **One markup.** The report view moved from a React component to `packages/report-html`, a
  string template with escaping, because `react-dom/server` throws inside a Next route handler.
  The page and the PDF share the markup and the stylesheet (moved out of `globals.css`). The PDF
  document embeds Geist and Geist Mono (OFL) and loads nothing from outside.
- **Printed equals run on the PDF.** CI installs Puppeteer's headless Chromium, prints every
  fixture's report with the same document and page setup, and reads the text back with pdf.js.
  The PDF's text must equal the page's text (whitespace, bullets and footers aside) and contain
  every number in order as printed; the markup check ties each number to its raw value and rule
  and covers every number in the model. The PDFs are kept as the `report-pdfs` CI artifact.
- **Verified here.** Typecheck, 492 unit tests, round-trip, provenance lint, `next build`, the
  OpenNext Worker build, and a `wrangler deploy --dry-run` that lists `env.BROWSER` as Browser Run.
  This environment has no Chromium, so the PDF check (18 cases) skipped here and runs in CI.
- **Not done.** Notice wording is unchanged (still the owner's draft). Nothing was deployed and
  no Cloudflare setting was changed; the binding takes effect on the next deploy.


## Track A: WorkEdge reads and per-account connections (A2), 2026-11-01

- **Decision first.** ADR-038 (draft, awaiting the owner): an account is a WorkEdge team; each
  account's admin pastes that team's WorkEdge key on Connect WorkEdge; the key is stored only as
  AES-256-GCM ciphertext bound to the account; one Worker secret, `RHOE_CONNECTION_KEY`, encrypts
  every account's key. It replaces WO-03 decision 1's single `WORKEDGE_API_KEY` secret, so Trade
  OS accounts and paying accounts later each bring their own connection.
- **Reads.** `packages/jobstore-workedge` now calls WorkEdge's MCP server (`get_project`,
  `list_photos`, `list_videos`, `list_equipment`, `list_projects`) with the account's key.
  WorkEdge has no `get_property` MCP tool, so the property comes from `get_project`, or else from
  WorkEdge's `api-properties` REST function with the same key; its address is one text field, so
  `Property.address` gained `text` and the parts are parsed when they can be.
  Photo categories, uploads and all writes stay `not_implemented` until KAN-125.
- **Connections.** New `packages/connections`: the key check (shows up to five job names the key
  sees, because WorkEdge does not yet say which team a key belongs to), save, disconnect, and the
  per-request JobStore. Migration `20261101120000_rhoe_workedge_connections` adds
  `rhoe.workedge_connections` and the `rhoe.connection_admins` grant list with row-level security.
  `apps/web` gains `/settings/workedge` and `/api/connections/workedge` (GET, PUT, DELETE, and
  POST `/check`); `WORKEDGE_MCP_URL` is a plain var in `wrangler.jsonc`.
- **Verified here.** Typecheck, 521 unit tests (18 new for the WorkEdge reads against a stand-in
  MCP server, 17 for connections and encryption), round-trip, provenance lint, `next build`.
- **Not done.** No live call to WorkEdge (this environment cannot reach Supabase hosts). The
  migration was not run anywhere. No secret was set and nothing was deployed.

## RhoeFlow's own sign-in and accounts (ADR-039), 2026-11-01

- **Why.** The owner asked for RhoeFlow's own sign-in and for accounts "like a paid app", with
  profile and account settings, instead of waiting on WorkEdge's sign-in (A1). ADR-039 (draft PR,
  awaiting the owner) records the design and amends ADR-028, ADR-031, ADR-038, the integration
  standard §7 and WO-03 decision 2, A1, C7 and D1.
- **Database.** The live `Rhoe_Flow` project's `rhoe` schema was empty, so the existing
  migrations were edited in place: every tenant column is now `account_id` and every policy uses
  `rhoe.current_account_id()`. New migration `20261101110000_rhoe_accounts` adds accounts,
  members (admin or member, never fewer than one admin), invites by email, profiles, `whoami()`,
  `accept_my_invites()` and `account_member_list()`. `rhoe.connection_admins` is gone; account
  admins connect WorkEdge. `seed/first_account.sql` makes the first account and admin.
  `tests/accounts.sql` holds the negative tests; `tests/local/run.sh` runs ups, downs, ups and all
  three SQL tests on a scratch PostgreSQL 16.
- **Store.** `StoreContext` carries `account_id` and `role`. `packages/store/src/accounts.ts` has
  the account, member, invite and profile services, an in-memory mirror of the SQL rules, and a
  Supabase adapter. Admins may edit templates, matching `rhoe.is_template_editor()`.
- **Web.** `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/auth/callback`,
  `/auth/refresh`, `/auth/sign-out`, `/no-account`, `/settings/profile`, `/settings/account`, and
  `/api/me…` and `/api/account…` routes. Sign-in offers email and password or an emailed
  one-time code (owner's choice, 2026-11-01); the code email's link also works. The browser talks
  to Supabase Auth directly for passwords and codes. A thin account bar shows who is signed in and for which account. Pages read the
  session cookie without refreshing it and send an expired one through `/auth/refresh`, because
  Server Components cannot write cookies and OpenNext does not run Next 16's Node middleware.
  Connect WorkEdge now sits under Settings and needs an account admin. The report's run record
  shows the account on its own line.
- **Verified here.** Typecheck, 538 unit tests (9 new for accounts, 5 for the session cookie, 2
  for the sign-in code, 2 for admin template rights), round-trip, provenance lint, `next build`, the three SQL tests
  through up, down and up, and a development-store smoke test of the account and profile routes.
- **Not done.** No migration was run on the live project; no Supabase Auth setting, secret or
  deploy was changed. Invite emails from RhoeFlow and self-serve account creation are later work.

## A way in, and RhoeFlow's own jobs (ADR-040), 2026-11-02

- **Why.** The owner found no way to get to the load calcs: they opened only from a WorkEdge job's
  Assessment button, which WorkEdge doesn't have yet. He then asked why a load calc can't start in
  RhoeFlow and pull from WorkEdge when needed, and to call the settings tab Connectors so more
  connectors can follow. ADR-040 (Decided by the owner, 2026-11-02) records it and amends
  ADR-028, ADR-031, ADR-038 and the integration standard §3 B.
- **Database.** Migration `20261102120000_rhoe_jobs` adds `rhoe.jobs` (name, customer, address,
  optional WorkEdge project and property, linked once and never re-pointed) with RLS on the
  account, gives every assessment a `job_id` (one open assessment per job; the job must be the
  same account's, checked by a trigger that runs as the caller because foreign keys bypass RLS),
  and makes the assessment's WorkEdge ids optional, filled once when the job is linked. The SQL
  tests' exception handlers no longer swallow their own FAIL raises.
- **Store and schema.** `packages/store/src/jobs.ts`: create, list, get, edit, link once, and
  find-or-create for a WorkEdge job. Assessments start by `job_id`; the server sets the job and
  any WorkEdge ids at accept. The Assessment snapshot gains an optional `job_id` and its WorkEdge
  project and property are optional (schema 0.1.0 still reads every earlier snapshot).
- **Web.** Header links to Load calcs, Templates and Settings, and the RhoeFlow name goes home.
  Home has Start a load calc (customer and address), Your load calcs, and an optional Start from a
  WorkEdge job list with a paste-a-link box. `/j/<job id>` opens a job; `/p/<WorkEdge project id>`
  finds or makes its job and goes there; a job can be linked to WorkEdge later from its bar.
  `/api/jobs`, `/api/jobs/:id`, `/api/jobs/:id/workedge`. Settings, WorkEdge became Settings,
  Connectors (`/settings/workedge` redirects). The report's address comes from the RhoeFlow job,
  and its run record says "not linked" when there's no WorkEdge job.
- **Verified here.** Typecheck, 552 unit tests, provenance lint, `next build`, the three SQL tests
  through up, down and up, and a development-store smoke test: a job with no WorkEdge link was
  started, answered, accepted and run, its report printed the RhoeFlow address, a WorkEdge job
  opened into one RhoeFlow job twice, and a link was made once and refused a second time.
- **Not done.** The migration is not applied to the live project; that waits for the owner's OK
  to merge. The PDF route needs Cloudflare's browser binding, so it was not exercised locally.

## Design pass for phones (MOB-001), 2026-11-02

- **Why.** The owner asked for a design review and phone fixes before merging PR 13.
- **Changes.** Every text field now uses 16px text, so phones don't zoom in when one is tapped. Inputs and selects outside labelled fields get the dark style instead of the browser's white box. Fields in a row share the width and wrap instead of running off a narrow screen. Every link and button in the top bar, the settings tabs and the pagers is at least 44px tall. On a phone the top bar wraps, and the account name drops off it below 420px. The bar now lines up with the page under it. Home leads with a New load calc button when the account already has load calcs, and opens the form when it has none. The city, state and ZIP fields sit on one line and wrap on a phone. List rows show the job name, its address on a second line, and "Linked to WorkEdge". Each section of the field app ends with "Next: …" and "Back to the overview" buttons. The load-by-component table scrolls sideways instead of widening the page. The address in the job bar is cut off with an ellipsis. Keyboard focus is visible, and a disabled task row looks disabled.
- **Verified here.** Typecheck, 552 unit tests, provenance lint, `next build`, and every page answered 200 on the development store. No browser could be run in this environment, so nothing was looked at on a real screen.

## Field fixes (ADR-041), 2026-11-02

- **Why.** The owner tried the live app and asked for four fixes: search WorkEdge jobs instead of listing them, choose active or archived jobs, look up a new customer's address with OpenRouteService, and show progress through the questions.
- **Changes.** `JobStore.searchProjects` (fixture, WorkEdge, local refuses). The WorkEdge store reads `list_projects`' arguments from `tools/list`, cached ten minutes, and uses WorkEdge's search and archived arguments when offered; otherwise it reads up to 10 pages of 200 and matches names. Home has a WorkEdge search with Active, Archived and Both. `/api/address` and the street field's suggestion list (OpenRouteService, `ORS_API_KEY`). The field app's job bar shows questions left, the open section and a row of steps.
- **Verified here.** Typecheck, 563 unit tests (6 for the WorkEdge search, 4 for the address lookup, 1 for the fixture search), provenance lint, `next build`, and on the development store: an archived search found the archived fixture job, the address route returned fixture suggestions, and a new job's page answered 200.
- **Not done.** WorkEdge's `list_projects` was not called live from here, so whether it already takes a search or says which jobs are archived is unknown until it runs. No `ORS_API_KEY` is set, so the address lookup is off in production until one is added. No browser could run here, so the progress bar and suggestion list were not looked at on a screen.

## Colours, themes, archive and search (ADR-042), 2026-11-03

- **Why.** The owner found the app flat with two colours, liked the marketing site's colours, asked for dark, light and system themes, clearer separation on the home page, and a way to archive, search and reopen saved load calcs.
- **Changes.** `globals.css` is now tokens only, light and dark, from the marketing site's palette; the top bar shows the site's wordmark (the name hides on a phone so the links stay on one line). Settings, Profile has Appearance: System, Light, Dark, kept per device. Home: New load calc (gold), Your load calcs (sage) with a search box, Active / Archived / All and an Archive or Restore button on each row, and Start from a WorkEdge job (blue). An archived job's page says so and offers Restore. Migration `20261103120000_rhoe_jobs_archive` (archived_at, archived_by, generated search_text); `listJobs` takes `show` and `q`; `setJobArchived`; `POST /api/jobs/:id/archive`; `GET /api/jobs?show=&q=`.
- **Verified here.** Store tests for archive, restore, other accounts, search words and paging; web tests that both dark blocks match, both themes define every token and no raw colours are left; the three SQL tests through up, down and up with new archive, search and cross-account checks; typecheck, unit tests, provenance lint and `next build`. Screenshots from headless Chromium on the development store, phone (390px) and desktop (1280px), dark and light, System and pinned.
- **Not done.** The migration is not applied to the live project. Nothing was looked at on a real phone.

## House facts, satellite view and permit links (ADR-043), 2026-11-04

- **Why.** The owner asked for a satellite view and for what the property record says about the house, permits included, in the address lookup, then chose RentCast plus the county appraisal files and added `RENTCAST_API_KEY`.
- **Changes.** Migration `20261105120000_rhoe_house_facts` (`rhoe.job_sites`, `rhoe.county_property`). Store: `lookupHouse`, `getJobSite`, `mergeHouseFacts`, `citeSources`, `situsKey`, `mapFoundation`. Web: the RentCast and ORS geocode sources (`lib/house.ts`, key sent only as a header), `GET`/`POST /api/jobs/:id/house`, the House facts card with the USGS satellite view and the front-direction tap, the city permit link, and the quick-pass pre-fill as `documented` with sources.
- **Verified here.** Store tests for the merge rules, the lookup order, once-per-job, failures, several county matches, no address and other accounts; web tests for RentCast parsing, the key staying out of the address and out of every error, the ORS point, permit links, the card's rows and pre-fill answers, and the tile and bearing maths; the three SQL tests through up, down and up with new cross-account and invariant checks; typecheck, unit tests, provenance lint, `next build`; and on the development store a job's house lookup returned the fixture record and its page answered 200.
- **Not done.** RentCast was not called live (the build environment can't reach it), and whether `RENTCAST_API_KEY` is set as a secret on `rhoeflow-web` couldn't be read from here; the first lookup on the deployed app shows it. The county import scripts are not written. The migration is not applied to the live project. No browser could run here, so the card and the satellite view were not looked at on a screen.

## WorkEdge search missed new jobs (ADR-041 fix), 2026-11-06

- **Why.** The owner searched WorkEdge for a customer whose job was added that day and got two older jobs, not the new one.
- **Cause.** WorkEdge's `list_projects` (read from its source, `supabase/functions/mcp` on the `dev` branch of `eco-eric/field-doc-suite`) takes `search` (name, customer or address), `status` and `archived` (true or false). `status` is the job's stage: estimating, active, completed, on hold or cancelled. RhoeFlow took any `status` argument as the archived filter, so the default Active view sent `status: "active"` and hid every job in another stage, including a new job still being estimated.
- **Changes.** `listProjectsCaps` prefers `archived` (then `include_archived`) and uses `status` only when its own values include an archived one. Without an archived flag, a status counts as archived only when it says so. Search results carry the customer, address and archived flag WorkEdge sends, and each row shows customer, address and stage. When RhoeFlow scans pages itself it matches the customer and address too.
- **Verified here.** Typecheck, 600 unit tests (a regression test on WorkEdge's real `list_projects` schema: Active sends `archived: false` and returns the estimating job; Archived and Both), provenance lint, `next build`.
- **Not done.** WorkEdge was not called live from here, so whether the deployed WorkEdge server matches its `dev` branch is unconfirmed until the owner searches again.

## WorkEdge address moved to its new project, 2026-11-06

- **Why.** After the archived-flag fix the owner searched "ron" and still got only two older jobs; WorkEdge's own Jobs page shows a third, an estimating job created 2026-11-04.
- **Cause.** WorkEdge's web app was pointed at its new Supabase project `gzwmnuxjuvxcwbaykawi` on 2026-11-02 (field-doc-suite `dev`, `.env` and `supabase/config.toml`). RhoeFlow's `WORKEDGE_MCP_URL` still named the old project `vesncoasnajcdinipgkv`, which holds the jobs as they were before the move and gets nothing new. Jobs made since then were missing from every RhoeFlow search, whatever the filter.
- **Changes.** `WORKEDGE_MCP_URL` in `apps/web/wrangler.jsonc` and `.env.example` now names the new project's `mcp` function (deployed there, version 5). `api-properties` follows the same address.
- **Verified here.** The new project lists an active `mcp` edge function. Typecheck, unit tests and `next build`.
- **Not done.** The new project's data wasn't read from here. Jose said stored keys stay valid at the cutover (workedge-connections.md, decision 8), but that and whether old job ids carried over are unconfirmed until the owner searches. If the key was not carried over, the search reports that WorkEdge refused the key, and the owner makes a new key in WorkEdge and reconnects it in Connectors.

## Map with north on Q5, and the blank satellite view (ADR-044), 2026-11-06
- **Why.** The owner wants to confirm which way the front faces on the map, without leaving the app.
- **Found.** The House facts satellite view shipped in PR 16 was blank: the USGS "Imagery Only" tile cache stops at zoom 16 and the view asked for zoom 19.
- **Changes.** `lib/imagery.ts` asks the NAIP ImageServer for one north-up 640 px image, 60 m each side; compass helpers (snap, label, bearing, point toward, phone heading). New `satellite-map.tsx` (north arrow, N/E/S/W, front arrow, tap to set, move the house dot, phone compass) used by House facts and under Q5 ("Check on the map"). `QuestionCard` takes children. Q5 from the map is `documented`; from the phone compass `measured`.
- **Verified here.** Typecheck, 603 unit tests, provenance lint, `next build`. The NAIP image loads in a browser for a DFW point (screenshots in the project files, `rhoeflow/q5-map`). The phone compass needs a real phone; not tried here.
- **Esri (same day).** The owner saved `ARCGIS_API_KEY` on rhoeflow-web. The map now asks `/api/imagery/tile/{z}/{x}/{y}`; the Worker fetches the Esri World Imagery tile with the key in `X-Esri-Authorization` and Referer app.rhoeflow.pro. Any failed tile switches the map to NAIP. Tests cover tile placement against the NAIP square, the key staying out of the URL, Esri's JSON refusal sent as HTTP 200, and no key.
- **Not verified.** That Esri accepts the key: it can only be tried from the deployed app, which needs the merge. If it refuses, the map shows NAIP.

## Track E: PDF file name and satellite view, 2026-11-06

- **File name** (owner's request): downloads save as "Load Calculation Report - <customer> -
  <address>.pdf". Characters Windows, macOS, iOS and Android refuse are dropped; the header sends
  a UTF-8 name and a plain-ASCII copy. A missing part is left out; with neither, the short run id.
- **Satellite view** (owner's request): under the address in the Summary, on the page and in the
  PDF, the same picture as the job page's map (ADR-044): Esri World Imagery tiles fetched by the
  Worker with `ARCGIS_API_KEY` (`lib/imagery-server.ts`), or the north-up USDA NAIP image when
  there is no key or any Esri tile fails. The server embeds the images as data URLs at render
  time, so the printed document still loads nothing from outside. `@rhoeflow/report-html` takes
  the picture as images placed in a square and doesn't know the source. A first cut used the "USGS
  Imagery Only" tiles at zoom 19; that cache stops at zoom 16, so the picture would have been empty.
- **Checks.** File-name and satellite tests (embedding, refusing a non-image, a blank or an
  oversized image, placement under the address, self-contained document, a picture that isn't an
  embedded image is dropped; in the app, Esri tiles first, NAIP when Esri is off or a tile fails,
  nothing when both fail). In CI the PDF check also prints a report with a stand-in picture (text
  and every number still match, the picture is drawn) and a sample with real NAIP imagery of the
  Texas Capitol, kept in the `report-pdfs` artifact.

## Streets and zoom on the satellite map, and why Esri isn't showing (ADR-045), 2026-11-06
- **Why.** The owner tried the Q5 map on a phone: it works, but asked to see where the street is ("a blue dotted line or something like they do in Google Maps") and to zoom in and out. The line under the map said USGS, so Esri wasn't in use.
- **Found.** On the owner's test job the paved strip that looks like the street is the alley behind the house; the street (Middle Knoll Dr) runs under the trees on the other side, matching the address. Checked against the NAIP picture and Esri's public World Imagery tile for the same spot. OpenStreetMap's Overpass API refused (at capacity); TIGERweb answered with every street and name round the point.
- **Changes.** `lib/streets.ts` (TIGERweb query, parse, merge by name, label placement clear of the map's marks and the front arrow); `/api/streets`; `lib/imagery.ts` zoom steps, Esri zoom per view, map/ground conversions, scale bar; `satellite-map.tsx` draws the streets, zooms by + and - or pinch, keeps placed marks on the same ground, shows a scale bar and, when on NAIP, Esri's reason from `/api/imagery/status`. `fetchEsriTile` passes on Esri's reason and retries once with Esri's `token` parameter on a 499.
- **Verified here.** Typecheck, unit tests, provenance lint, `next build`. Mock-ups drawn from the real NAIP picture and TIGER streets for the test job (project files, `rhoeflow/q5-streets`). Pinch needs a real phone; not tried here.
- **Not verified.** Why Esri refuses the key: the server can't be asked from here. After the merge the line under the map gives Esri's reason.

## County appraisal records, Dallas and Tarrant (ADR-048), 2026-11-07
- **Why.** The owner picked "Start the county data": fill `rhoe.county_property` (empty since ADR-043) from DCAD and TAD so House facts has a second source beside RentCast.
- **Found.** The build container can't reach dallascad.org or tad.org; temporary GitHub Actions probes read the real files' layout (removed before the PR is ready). TAD's legacy pipe file no longer fills garage, bedrooms or heat, so the True Prodigy fixed-width export is read instead. Neither county gives a garage car count; TAD gives no bedroom or story count.
- **Changes.** `tools/county-import` (own CSV reader, DCAD and TAD readers, CLI, `load.sql`), `.github/workflows/county-import.yml`, migration `20261107130000_rhoe_county_detail` (ZIP, county wording, `situs_street`, `county_imports`), store: street-and-ZIP match, county wording into readings, Garage type fact, foundation wording for DCAD and TAD, county errors no longer stop a lookup.
- **Verified here.** Typecheck, unit tests (CSV quoting across chunk edges, both readers on made-up records in the real layouts, the street-and-ZIP match, a failing county read), the CLI on a small DCAD-layout zip, and `load.sql` plus the migration and its down migration on a local Postgres 16: load, reload, refusal of a short file and of another county's rows.
- **Not verified.** The full read of both real files and the first load: the read runs in the PR's `county-import` check; the load needs the owner's OK and the `SUPABASE_DB_URL` secret.

