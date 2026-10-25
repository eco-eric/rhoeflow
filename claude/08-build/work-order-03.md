# Work order 03 — phase 2, block-load app

**Status:** authorized by the owner on 2026-10-25 (GOV-003), after answering the §3 decisions the
same day. Work begins with Tracks A and B; A1, A2 and E6 wait on the WorkEdge ticket (§3a).

## Progress (updated 2026-10-25)

| Track | State |
| --- | --- |
| A, decisions and maps | A3 quick-pass map and A5 usability plan written; A4 lands with engine 0.2.0; A1 and A2 wait on WorkEdge |
| B, engine coverage | Not started |
| C, persistence | Not started |
| D, field app | Not started |
| E, report and gates | Not started |
| WorkEdge ticket | Drafted (`wo-03-workedge-ticket.md`); not yet filed in Jira |

Drafted from the plan's phase 2 (`01-plan/research-and-plan.md` §Build plan, item 2), the items
WO-02 deferred (`wo-02-proposed-items.md` items 5, 9, 11, 12, 16), WO-02's carried item (template
sanity bands) and what WO-02 found the engine still refuses.

Owner: Eric Love. Product: RhoeFlow (ADR-033). Target: 7 to 9 weeks, an estimate (ADR-015). The
plan's estimate for phase 2 was 4 weeks; Track B (engine coverage for real houses) and the
template editor the owner asked for are the difference. Real-job use (E6) also waits on the
WorkEdge work in §3a.

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

| Feature | Engine 0.1.0 | How common in DFW (builder estimate) |
| --- | --- | --- |
| Wall, ceiling or floor next to an attached garage | refused: needs buffer-space temperatures | nearly every house built after 1970 |
| Room over a garage (bonus room) | refused, same reason | common on two-story houses |
| Pier-and-beam floor over a vented crawlspace | refused, same reason; the serializer also refuses the foundation type | the plan's default before 1960 |
| Ducts in a garage or crawlspace | refused, same reason | occasional |
| Radiant barrier | the schema has no grade field and the serializer refuses it | the plan says assume yes for 2010 and later |
| Two ducted systems, upstairs and downstairs | refused: one system must serve the whole house | common on two-story houses |

Track B adds these, each verified against the oracle the same way WO-02 verified the rest.

## 3. Owner decisions (answered 2026-10-25)

1. **WorkEdge reads: confirm the real routes at the start, and use a test-team API key.** A
   fixture `JobStore` stands in for tests either way. The WorkEdge repo (`eco-eric/field-doc-suite`)
   is readable with the owner's GitHub login, so no extra access is needed; the API key comes from
   Jose through the ticket in §3a and goes into an untracked `.env.local`, never into the repo.
2. **Sign-in: the owner is the test user.** The owner signs in directly during the A1 spike;
   RhoeFlow never handles the owner's password. A1 needs the WorkEdge change in §3a item 6 first.
3. **Deploy: Cloudflare Workers (ADR-036, owner, 2026-10-25).** The owner moved hosting from
   Vercel to Cloudflare Workers through OpenNext; Workers Builds deploys `apps/web` (worker
   `rhoeflow-web`, rhoeflow.pro). Item 16 (Vercel project) is dropped. The rest of the approved
   recommendation stands: real-job use waits for sign-in to work, previews stay behind sign-in,
   and the owner sets secrets in the Cloudflare dashboard. PDF rendering is re-decided in E2.
4. **Migrations: approved as recommended.** SQL files under `supabase/migrations/`; the owner
   pastes each into the Supabase SQL editor. No Supabase CLI.
5. **Sanity bands and templates: the owner supplies the bands once the app is built, and needs to
   create and edit templates.** This adds a template store and editor (C7, D9). Until a
   band is entered, a template shows "no band on file". The plan's 350 to 450 ft² per ton band
   seeds the pre-1980 template with the plan as its source.
6. **Photos: a Jira ticket for Jose** (`wo-03-workedge-ticket.md`, under WorkEdge epic KAN-124).
   Until WorkEdge can accept uploads, photos taken in RhoeFlow go through the `jobstore-local`
   fallback that ADR-031 allows, with `local:` ids migrated later (item 10 stays deferred).
7. **Features of the first ten jobs: not known yet.** Track B builds every §2 feature, plus a
   ductless-only check (B7). A real job that still hits an unsupported feature gets a clear message
   naming the feature, never a silent fallback, and is logged so the next order can add it.
8. **Spanish: test with Carlos.** Carlos is the Spanish-speaking participant in the usability
   gate. The interface stays English with plain wording in this order; whether Carlos needs a
   Spanish interface is a usability finding that feeds the next order.
9. **G3 review: no paid external tools** (ADR-035). The owner reviews each of the ten results.
   The reference for each one is an OpenStudio-HPXML run of the same job, which is open source
   (BSD) and already pinned, compared like for like (QA-003). CoolCalc is dropped.
10. **Dependencies: approved as recommended.** `@supabase/ssr` for Next.js sessions is approved.
    Puppeteer covers the end-to-end smoke tests, so Playwright is not added.

Manual J 8th edition: no purchase is planned, and this order does not depend on it.

## 3a. What WorkEdge has today (read from `field-doc-suite`, 2026-10-25)

| Need | WorkEdge today | Where it goes |
| --- | --- | --- |
| Read one project | `api-projects` lists every project for the team (fields: name, client name, address text, status, photo count); no single-project read; `x-api-key` header; 100 requests an hour | KAN-124 Phase 1 `get_project` |
| Read the property | no `api-properties` function; `projects.property_id` is optional; properties have name, address, client name and description only, no year built or floor area | KAN-124 Phase 1, plus the ticket's asks |
| List photos, equipment | not in the API yet | KAN-124 Phase 1 |
| Upload a photo or video | not planned anywhere | ticket item 1 (blocking for capture) |
| Save a PDF report, add a note | planned in KAN-124 Phase 2; `save_report` takes Markdown | ticket items 2 and 3 |
| Equipment create or update | not planned | ticket item 4 |
| Verify a WorkEdge sign-in without a secret | not possible: the auth server publishes no public signing keys (its JWKS endpoint is empty), so tokens use the legacy shared secret | ticket item 6 |

Consequences for this order. Year built, floor area and stories are quick-pass answers held in the
Assessment; when WorkEdge adds them, RhoeFlow cites them as documented. Track A starts against the
fixture `JobStore`. A1 and A2 finish when WorkEdge's sign-in keys and Phase 1 reads exist, and E6
(ten real jobs) cannot start before then.

## 4. What the coding session reads

| # | Document | Why |
| --- | --- | --- |
| 1 | `CLAUDE.md`, `claude/00-start-here.md` | Standing rules |
| 2 | `claude/03-decisions/decision-log.md` | ADR-003, 007, 013, 016, 017, 020, 024 to 031, 034, 035, 036 |
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
| A1 | **Identity spike** (R02): once WorkEdge publishes public signing keys (ticket item 6), verify a WorkEdge session with them, carry `workedge_team_id` into RhoeFlow's row-level security, and prove with a negative test that one team cannot read another's rows. No shared secret or service-role key at any step. Findings in `claude/09-spikes/r02-identity-findings.md`. | ADR-031, SEC-001 |
| A2 | **WorkEdge calls**: replace the provisional `WORKEDGE_CALLS` with what §3a found, and implement `getProject`, `getProperty`, `listPhotos` and `listEquipment` against KAN-124's tools as they land. A fixture `JobStore` serves tests and development until then; one live read against a TruFicient project closes the item. | item 12; DAT-005, ADR-031 |
| A3 | **Quick-pass map** `claude/06-architecture/quick-pass-map.md`: each of the 12 questions, the template fields it sets, the method ids it feeds, the default's source, and what each "unknown" choice does (ADR-027 split). Includes wiring `MJ8.construction.assembly_r` so attic and wall answers in nominal R become assembly R. | QST-001, QST-002, ADR-024 |
| A4 | **Sanity-band warning** that WO-02 left unbuilt: a template may carry a ft² per ton band; outside it is a warning, never an error; no band shows "no band on file". The owner enters the bands in the template editor (D9). | WO-02 carried; LOD-004 |
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
| B7 | Ductless-only house (mini-split heads, no ducts): confirm the engine and serializer handle it, add a fixture variant, and fix what they refuse | `check-fixtures.mjs` |
| B8 | `RHOE.infiltration.resdb_ach50`: the quick pass's leaky / average / tight answer becomes ACH50 through the LBNL ResDB regression and leakiness multiplier, so it can be checked against the oracle's `LeakinessDescription` path (added from the A3 map) | `get_infiltration_ach50` in `defaults.rb` |

### Track C — persistence, runs and scenarios (Supabase and `apps/web` server code, weeks 2 to 4)

| # | Item | Source |
| --- | --- | --- |
| C1 | **Migrations** (item 9): `assessments`, `assessment_revisions`, `scenarios`, `calc_runs`, `run_artifacts`, `reports`. Row-level security by `workedge_team_id`. No job, customer, property, photo-file or user table. `rhoe-media` bucket policies for signed-in users only. Cross-team negative tests. | ADR-028, SEC-001 |
| C2 | **Persistence API** (item 11): create or resume an assessment by `workedge_project_id` (standard §3 entry A), drafts may be incomplete, revision bump on accept, optimistic concurrency. Request and response contracts in zod. | API-001, QST-001, REV-001 |
| C3 | **Frozen runs on the server**: a run freezes the accepted snapshot, runs the engine, and writes the artifact bundle to Storage through a storage-backed version of `writeBundle`. Run rows keep the input hash, engine version, method ids and weather library version. Requests are idempotent; retry, cancel and timeout cannot create two accepted runs. The phone may run the engine for a live preview labeled "preview, not a run". | DAT-004, ENG-008, API-002 |
| C4 | **Stale results**: dependency fingerprints on inputs, weather, methods and templates. A change marks exactly the affected runs stale, visibly, and a stale run cannot feed a new report. | REV-002 |
| C5 | **Scenarios** (item 5): a scenario is the frozen baseline plus explicit overrides, each with a source. The comparison lists changed fields, sources and load changes, and labels non-reference inputs such as a customer's preferred setpoint. No conversion to energy bills. | SCN-001, SCN-002, QST-003 |
| C6 | **Upload limits and sandboxing**: size and type limits on photo uploads, path validation, no shell interpolation, no secrets in logs or client bundles. | SEC-002 |
| C7 | **Template store**: `templates` and `template_versions` tables, seeded from the seven repo templates. Every edit makes a new immutable version, every value keeps its source, and each run records the template id and version it used, so C4 marks the right runs stale. Edit rights come from the WorkEdge session's role if A1 finds one, otherwise from a grant list of WorkEdge user ids; no user table. The repo templates stay the fixed set CI tests against. | ADR-024, ADR-028, owner decision 5 |

### Track D — the field app (`apps/web`, weeks 3 to 6)

| # | Item | Source |
| --- | --- | --- |
| D1 | Sign-in; entry by deep link from a WorkEdge project; project and property shown in a persistent bar with "Wrong project?"; the job opens on a task overview, not a dashboard. | ADR-027, standard §3 |
| D2 | Quick pass per the A3 map: conditional questions, template picked from year built and stories, every default shows its source, reason and state, expert direct entry on every question, sections in any order. | QST-001, QST-002 |
| D3 | Provenance on every answer: state, source, rationale for overrides. Conflicts are kept, not overwritten, for example a tape-measured floor area against one read from a plan. | PRV-001, PRV-002, PRV-003 |
| D4 | Photo evidence per answer, by WorkEdge media id or `local:` id per decision 6. Signed URLs are resolved at read time and never stored. | DAT-003, ADR-028 |
| D5 | Missing-input review: every proposed or unknown field that blocks a run, shown with the engine's structured error. An old result is never shown as current. | ENG-007 |
| D6 | Results: building heating, cooling sensible and latent, the component breakdown, ft² per ton and Btu/h per ft² against the template band, and the measured-versus-assumed list. | LOD-002, LOD-004 |
| D7 | Checks before a run is accepted: window area against wall area, impossible values, inconsistent areas. | GEO-002 |
| D8 | Phone-first layout that also works on a desktop. The open assessment is cached in IndexedDB so a dropped signal loses no answers. No AI anywhere in this order, so the manual path is the only path. | MOB-001, ADR-017, ADR-003 |
| D9 | **Template editor** (desktop first): create a template from scratch or by copying one, edit any value and the sanity band, and see which open assessments a new version would affect. The editor refuses a value without a source and checks every value against the template schema before saving. | ADR-024, QST-002, owner decision 5 |

### Track E — report, QA and gates (weeks 5 to 8)

| # | Item | Source |
| --- | --- | --- |
| E1 | **Customer summary and technical pages** rendered only from a frozen run: home, design conditions with station and dataset version, totals with the sensible and latent split, sanity figures, measured versus assumed, construction components and the load worksheet. Equipment, room-by-room and duct pages are left out and labeled as not part of this report. Carries the independent-software notice, the non-approval notice and the OpenStudio-HPXML notice. | RPT-001, RPT-002, WTH-001, LIC-002 |
| E2 | **PDF**. ADR-036 leaves the renderer open (ADR-016 assumed Vercel). Before E2 starts, a short spike compares Cloudflare Browser Rendering with rendering the PDF outside the Worker, against ADR-035 (no paid tools beyond the hosting stack); the choice is recorded as a new ADR for the owner. Defined rounding rules, and a test that every printed number equals the run data under them. | ADR-016, ADR-035, ADR-036, RPT-001 |
| E3 | **Write-backs**: report PDF and a design-summary note with the run link saved to the WorkEdge project, each tagged `source: rhoeflow`, `assessment_id`, `run_id`. If WorkEdge's write calls are not live, the PDF stays with the run's artifacts and the write-back waits in a queue. Issued reports are immutable; a change needs a new run and a new report revision. | ADR-030, REV-001 |
| E4 | **Sensitivity cases**: orientation, glazing amount, leakage, duct location and design-temperature changes, each with its expected direction and size justified, and oracle-checked in CI. | QA-005, QA-004 |
| E5 | **Deployment doc** so a clean machine and a clean Cloudflare Worker reproduce the app and the reference cases. | OPS-001, ADR-036 |
| E6 | **G2 and G3**: ten real jobs run in the deployed app. For each, the frozen run's HPXML goes through the pinned oracle on the dev machine, and the owner reviews the two side by side per decision 9. The repo keeps only a log of assessment and run ids with the review outcome, never customer data, and no real house becomes a repo fixture. | G2, G3, QA-003, ADR-035 |
| E7 | **Usability gate** per the A5 plan; findings recorded as observed. | ADR-026 |

## 6. Definition of done

- Every Track B method exists with unit tests and a method-matrix row; all six fixtures pass the
  engine-versus-oracle check in CI within the committed tolerances.
- The migrations are applied, and cross-team negative tests pass against the real project.
- The owner can create, copy and edit a template and its sanity band in the app, and a run names
  the template version it used.
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
in WorkEdge. Cloudflare stays on preview deployments until you promote one. Engine 0.2.0 keeps the
0.1.0 fixtures passing unchanged, so the engine half can be reverted on its own.
