# Work order 03 — phase 2, block-load app

**Status:** draft for owner review, 2026-10-25. **Not authorized.** No code is written under this
order until the owner answers §3 and authorizes it (GOV-003).

Drafted from the plan's phase 2 (`01-plan/research-and-plan.md` §Build plan, item 2), the items
WO-02 deferred (`wo-02-proposed-items.md` items 5, 9, 11, 12, 16), WO-02's carried item (template
sanity bands) and what WO-02 found the engine still refuses.

Owner: Eric Love. Product: RhoeFlow (ADR-033). Target: 6 to 8 weeks, an estimate (ADR-015). The
plan's estimate for phase 2 was 4 weeks; Track B below (engine coverage for real houses) is the
difference.

## 1. Goal

A TruFicient tech opens a WorkEdge project in RhoeFlow on a phone, answers the 12-question quick
pass with sourced defaults, attaches photo evidence to answers, runs a frozen block load, compares
a scenario against the baseline, and produces a customer summary PDF that lands on the WorkEdge
project. The app is used on ten real jobs and each result is reviewed. Gates G2 and G3 close,
together with the ADR-026 usability gate.

Register IDs this order closes or advances: ENG-007, ENG-008, DAT-003, DAT-004, DAT-005, GEO-002,
QST-001, QST-002, QST-003, PRV-001, PRV-002, PRV-003, LOD-002, LOD-004, SCN-001, SCN-002,
API-001, API-002, REV-001, REV-002, RPT-001, RPT-002, MOB-001, SEC-001, SEC-002, WTH-001, QA-003,
QA-004, QA-005, OPS-001. GEO-001 holds by construction (the quick pass has no display
coordinates). Closed by WO-01 and WO-02 and carried: ENG-001 to ENG-006, LOD-001, MTH-001 to
MTH-003, UNT-001, WTH-002, QA-001, QA-002, LIC-001, LIC-002.

## 2. Why the engine needs more coverage first

Engine 0.1.0 matches the oracle on the two reference houses, but it returns `unsupported` for
features most DFW houses have. A quick pass on a typical job would stop at the run step.

| Feature | Engine 0.1.0 | How common in DFW (builder estimate; decision 7 confirms) |
| --- | --- | --- |
| Wall, ceiling or floor next to an attached garage | refused: needs buffer-space temperatures | nearly every house built after 1970 |
| Room over a garage (bonus room) | refused, same reason | common on two-story houses |
| Pier-and-beam floor over a vented crawlspace | refused, same reason; the serializer also refuses the foundation type | the plan's default before 1960 |
| Ducts in a garage or crawlspace | refused, same reason | occasional |
| Radiant barrier | the schema has no grade field and the serializer refuses it | the plan says assume yes for 2010 and later |
| Two ducted systems, upstairs and downstairs | refused: one system must serve the whole house | common on two-story houses |

Track B adds these, each verified against the oracle the same way WO-02 verified the rest.

## 3. Owner decisions needed before authorization

1. **WorkEdge reads.** G2 needs real projects and properties, read through `JobStore` (ADR-031).
   Today every `jobstore-workedge` call is a stub with provisional routes. Needed from you: access
   to confirm WorkEdge's current routes and field names from its repo (item 12, DAT-005), and a
   team API key for a test team, set as an environment variable and never committed.
   *Recommendation:* do both at the start; a fixture `JobStore` stands in for tests either way.
2. **Sign-in.** ADR-031 (Decided) says one Supabase Auth tenant shared with WorkEdge, with
   `team_id` read from the session, while RhoeFlow's own data sits in RhoeFlow's Supabase project
   (`twelymqeeurtdzlxrjcb`). Track A1 confirms how RhoeFlow trusts WorkEdge's sessions without a
   shared service-role key. Needed from you: a test user on WorkEdge's auth and its public issuer
   details, no secrets. If A1 finds this cannot be done without breaking ADR-031, work stops and
   the question comes back to you; the ADR is not reopened inside this order.
3. **Deploy.** Real jobs on sales calls need a deployed app. *Recommendation:* authorize creating
   the Vercel project rooted at `apps/web` (item 16) once Track D has sign-in working, with
   preview deployments behind sign-in only and production promotion left to you. You set the
   environment variables in the Vercel dashboard.
4. **Migrations.** Who applies SQL to the RhoeFlow Supabase project. *Recommendation:* migrations
   live as SQL files under `supabase/migrations/`, and you paste each one into the SQL editor.
   The alternative is a personal access token for the Supabase CLI, which would be a new dev
   dependency.
5. **Sanity bands** (carried from WO-02). A ft² per ton band for each of the seven templates. The
   plan has one: 350 to 450 for unimproved 1960s to 1980s homes. Until you supply the others, those
   templates show "no band on file" rather than a made-up range.
6. **Photos.** WorkEdge's upload endpoint is not on its roadmap yet (item 13, ADR-028).
   *Recommendation:* link existing WorkEdge photos when `listPhotos` is live, and store photos
   taken inside RhoeFlow through the `jobstore-local` fallback that ADR-031 allows, with `local:`
   ids migrated later (item 10 stays deferred). You open the upload ticket with WorkEdge.
7. **Which features the first ten jobs need.** Confirm the §2 list matches the houses you expect,
   or name others, such as a mini-split-only house or a vaulted ceiling.
8. **Spanish.** ADR-026 tests with a Spanish-speaking tech. Is a Spanish interface in this order,
   or is English with plain wording enough for now?
9. **G3 review.** Who reviews each of the ten results and against what. *Recommendation:* you
   review each one against a CoolCalc run or your current method (ADR-020); every disagreement over
   an agreed threshold gets a written like-for-like explanation (QA-003). This also settles the
   plan's open question about keeping a CoolCalc seat.
10. **New dependencies** (stop-and-ask rule). Named in the plan and needing no approval:
    `@supabase/supabase-js`, Puppeteer with `@sparticuz/chromium-min` (ADR-016). Not named, approval
    requested: `@supabase/ssr` for Next.js cookie sessions. Proposed instead of adding Playwright:
    reuse Puppeteer for the end-to-end smoke tests.

Recommended but not blocking: buy Manual J 8th edition before G3, so the reviews can check
against ACCA's worked examples.

## 4. What the coding session reads

| # | Document | Why |
| --- | --- | --- |
| 1 | `CLAUDE.md`, `claude/00-start-here.md` | Standing rules |
| 2 | `claude/03-decisions/decision-log.md` | ADR-003, 007, 013, 016, 017, 020, 024 to 031, 034 |
| 3 | `claude/06-architecture/workedge-integration-standard.md` | Entry points, ids, write-back tags |
| 4 | `claude/01-plan/research-and-plan.md` §The input experience, §Reports, §Domain model | Quick pass, report pages, frozen runs |
| 5 | `claude/08-build/work-order-02.md`, `claude/06-architecture/method-matrix.md` | Engine state and method ids |
| 6 | `packages/*`, `tools/hpxml-oracle/README.md` | Contracts to extend, the oracle check |
| 7 | `claude/02-perplexity-package/Truficient-Requirements-v3.csv` | Requirement IDs for commits |

## 5. Scope

Five tracks. A runs first. B and C can overlap; the field app (D) and the report (E) need both.

### Track A — decisions, spikes and maps (week 1)

| # | Item | Source |
| --- | --- | --- |
| A1 | **Identity spike** (R02): how a WorkEdge session signs a user into RhoeFlow, how `workedge_team_id` reaches RhoeFlow's row-level security, and a negative test that one team cannot read another's rows. Findings in `claude/09-spikes/r02-identity-findings.md`. | ADR-031, SEC-001 |
| A2 | **WorkEdge routes confirmed** from its repo; replace the provisional `WORKEDGE_CALLS`; implement `getProject`, `getProperty`, `listEquipment` and, if live, `listPhotos`. Tests with an injected fetch, then one read against a test project. | item 12; DAT-005, ADR-031 |
| A3 | **Quick-pass map** `claude/06-architecture/quick-pass-map.md`: each of the 12 questions, the template fields it sets, the method ids it feeds, the default's source, and what each "unknown" choice does (ADR-027 split). Includes wiring `MJ8.construction.assembly_r` so attic and wall answers in nominal R become assembly R. | QST-001, QST-002, ADR-024 |
| A4 | **Sanity bands** in the templates from your numbers, and the engine warning that WO-02 left unbuilt: outside the band is a warning, never an error. | WO-02 carried; LOD-004 |
| A5 | **Usability test plan** `claude/08-build/wo-03-usability-plan.md`: the ADR-026 tasks, the four participants, what is recorded, no invented success rates. | ADR-026 |

### Track B — engine coverage for real houses (`packages/calc`, `packages/hpxml`, weeks 1 to 4)

Engine version becomes `0.2.0`. Each method gets unit tests and a method-matrix row, and each
feature gets an oracle fixture that runs in the CI `oracle` job.

| # | Item | Oracle counterpart |
| --- | --- | --- |
| B1 | `MJ8.buffer_space` design temperatures for garage, vented crawlspace and unvented attic, used by walls, ceilings, floors and ducts that face them | buffer-space temperatures in `hvac_sizing.rb` |
| B2 | Radiant barrier: schema field for the grade, the serializer writes it, the ceiling and roof cooling terms use it; the 2010-and-later templates default it per the plan | radiant-barrier handling in `hvac_sizing.rb` |
| B3 | Two or more ducted systems, each with its share of the load and its own duct location and leakage; the building-total method is unchanged | per-system duct loads |
| B4 | Serializer: vented crawlspace foundations, garages as attached spaces, radiant barriers | — |
| B5 | Three new fixtures: a 1950s pier-and-beam ranch; a two-story with an attached garage, a bonus room over it and two systems; a 2010s house with a radiant barrier. Templates for any era they need. | `check-fixtures.mjs` |
| B6 | Retire the `--engine-version 0.0.1` contract-only path now that G1 is closed (WO-02 §8) | — |

### Track C — persistence, runs and scenarios (Supabase and `apps/web` server code, weeks 2 to 4)

| # | Item | Source |
| --- | --- | --- |
| C1 | **Migrations** (item 9): `assessments`, `assessment_revisions`, `scenarios`, `calc_runs`, `run_artifacts`, `reports`. Row-level security by `workedge_team_id`. No job, customer, property, photo-file or user table. `rhoe-media` bucket policies for signed-in users only. Cross-team negative tests. | ADR-028, SEC-001 |
| C2 | **Persistence API** (item 11): create or resume an assessment by `workedge_project_id` (standard §3 entry A), drafts may be incomplete, revision bump on accept, optimistic concurrency. Request and response contracts in zod. | API-001, QST-001, REV-001 |
| C3 | **Frozen runs on the server**: a run freezes the accepted snapshot, runs the engine, and writes the artifact bundle to Storage through a storage-backed version of `writeBundle`. Run rows keep the input hash, engine version, method ids and weather library version. Requests are idempotent; retry, cancel and timeout cannot create two accepted runs. The phone may run the engine for a live preview labeled "preview, not a run". | DAT-004, ENG-008, API-002 |
| C4 | **Stale results**: dependency fingerprints on inputs, weather, methods and templates. A change marks exactly the affected runs stale, visibly, and a stale run cannot feed a new report. | REV-002 |
| C5 | **Scenarios** (item 5): a scenario is the frozen baseline plus explicit overrides, each with a source. The comparison lists changed fields, sources and load changes, and labels non-reference inputs such as a customer's preferred setpoint. No conversion to energy bills. | SCN-001, SCN-002, QST-003 |
| C6 | **Upload limits and sandboxing**: size and type limits on photo uploads, path validation, no shell interpolation, no secrets in logs or client bundles. | SEC-002 |

### Track D — the field app (`apps/web`, weeks 3 to 6)

| # | Item | Source |
| --- | --- | --- |
| D1 | Sign-in; entry by deep link from a WorkEdge project; project and property shown in a persistent bar with "Wrong project?"; the job opens on a task overview, not a dashboard. | ADR-027, standard §3 |
| D2 | Quick pass per the A3 map: conditional questions, template picked from year built and stories, every default shows its source, reason and state, expert direct entry on every question, sections in any order. | QST-001, QST-002 |
| D3 | Provenance on every answer: state, source, rationale for overrides. Conflicts are kept, not overwritten, for example WorkEdge's floor area against a measured one. | PRV-001, PRV-002, PRV-003 |
| D4 | Photo evidence per answer, by WorkEdge media id or `local:` id per decision 6. Signed URLs are resolved at read time and never stored. | DAT-003, ADR-028 |
| D5 | Missing-input review: every proposed or unknown field that blocks a run, shown with the engine's structured error. An old result is never shown as current. | ENG-007 |
| D6 | Results: building heating, cooling sensible and latent, the component breakdown, ft² per ton and Btu/h per ft² against the template band, and the measured-versus-assumed list. | LOD-002, LOD-004 |
| D7 | Checks before a run is accepted: window area against wall area, impossible values, inconsistent areas. | GEO-002 |
| D8 | Phone-first layout that also works on a desktop. The open assessment is cached in IndexedDB so a dropped signal loses no answers. No AI anywhere in this order, so the manual path is the only path. | MOB-001, ADR-017, ADR-003 |

### Track E — report, QA and gates (weeks 5 to 8)

| # | Item | Source |
| --- | --- | --- |
| E1 | **Customer summary and technical pages** rendered only from a frozen run: home, design conditions with station and dataset version, totals with the sensible and latent split, sanity figures, measured versus assumed, construction components and the load worksheet. Equipment, room-by-room and duct pages are left out and labeled as not part of this report. Carries the independent-software notice, the non-approval notice and the OpenStudio-HPXML notice. | RPT-001, RPT-002, WTH-001, LIC-002 |
| E2 | **PDF** via Puppeteer and `@sparticuz/chromium-min` on a Vercel Node function. Defined rounding rules, and a test that every printed number equals the run data under them. | ADR-016, RPT-001 |
| E3 | **Write-backs**: report PDF and a design-summary note with the run link saved to the WorkEdge project, each tagged `source: rhoeflow`, `assessment_id`, `run_id`. If WorkEdge's write calls are not live, the PDF stays with the run's artifacts and the write-back waits in a queue. Issued reports are immutable; a change needs a new run and a new report revision. | ADR-030, REV-001 |
| E4 | **Sensitivity cases**: orientation, glazing amount, leakage, duct location and design-temperature changes, each with its expected direction and size justified, and oracle-checked in CI. | QA-005, QA-004 |
| E5 | **Deployment doc** so a clean machine and a clean Vercel project reproduce the app and the reference cases. | OPS-001 |
| E6 | **G2 and G3**: ten real jobs run in the deployed app and reviewed per decision 9. The repo keeps only a log of assessment and run ids with the review outcome, never customer data, and no real house becomes a repo fixture. | G2, G3, QA-003 |
| E7 | **Usability gate** per the A5 plan; findings recorded as observed. | ADR-026 |

## 6. Definition of done

- Every Track B method exists with unit tests and a method-matrix row; all five fixtures pass the
  engine-versus-oracle check in CI within the committed tolerances.
- The migrations are applied, and cross-team negative tests pass against the real project.
- A tech can go from a WorkEdge deep link to a saved PDF on a phone with AI off.
- A frozen run cannot change after the fact; editing an input marks the run stale and forces a new
  run before a new report.
- Every number on the PDF traces to the run's artifact bundle under the stated rounding.
- `pnpm verify` and both CI jobs are green on main.
- Ten real jobs logged and reviewed; disagreements explained like for like.
- The usability gate is run with the four participants, and its findings are recorded.
- The report is in the WO-01 format: files, requirement IDs, commands, observed output and omissions.

## 7. Exclusions

No Manual S equipment selection (phase 3); the report names no equipment. No room-by-room loads,
blueprint intake or detail pass (phase 4). No duct design (phase 5). No AI or photo engine
(ADR-021, later phases). No Capacitor shell or RoomPlan (phase 3, ADR-032). No customer portal
(ADR-025, phase 4). No weather stations beyond DFW 722590, and no geocoding or map: a property
outside the library gets a structured refusal and the front orientation is a compass question. No
local-media migration tool (item 10). No linter, no Vitest 4. No heat-pump backup efficiency field
(phase 3). No energy-cost or comfort claims.

## 8. Rollback

Each track lands on its own branch and merges when its tests pass. Migrations are additive and
each has a down script; RhoeFlow's tables hold only RhoeFlow data, so dropping them touches nothing
in WorkEdge. Vercel stays on preview deployments until you promote one. Engine 0.2.0 keeps the
0.1.0 fixtures passing unchanged, so the engine half can be reverted on its own.
