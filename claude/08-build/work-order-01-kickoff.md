# Work order 01 — kickoff (authorized Oct 24, 2026)

This is the first authorized work order under GOV-003. Product name: **RhoeFlow** (ADR-033). The session prompt that starts each build session lives in `/KICKOFF-PROMPT.md` at the repo root; use it until WO-02 replaces it.

Blanks: `REPO = <fill in GitHub org/repo>`, `OWNER_DEV = Eric Love`.

## What the coding session reads

These five are in the repo under `claude/`, nothing else is needed for WO-01:

| # | Document | Why |
| --- | --- | --- |
| 1 | `claude/00-start-here.md` | Working rules; forbids reopening ADRs and screenshot-as-evidence |
| 2 | `claude/01-plan/research-and-plan.md` | Tech stack, domain model, phases, gates, sources |
| 3 | `claude/03-decisions/decision-log.md` | ADR-001 to 033; the session must cite an ADR for any architectural choice |
| 4 | `claude/06-architecture/workedge-integration-standard.md` | What the app owns vs. WorkEdge, the `JobStore` adapter, ids |
| 5 | `claude/02-perplexity-package/Truficient-Requirements-v3.csv` | Requirement IDs to name in commits and reports |

Add later, when the relevant phase starts (they live in the Claude Project "Load Calc and Duct Design App"): `04-design/field-app-mockups-v1.md` + `04-design/hcd-review.md` (phase 3 capture UI), `05-research/photo-analysis.md` (photo engine), `06-architecture/storage-and-organization.md` (storage layout).

## Scope of WO-01 (target: 2 weeks)

Two tracks run in parallel. Neither depends on WorkEdge shipping anything.

**Track A — R01 spike (1 week, no app code).** Pin an OpenStudio-HPXML release; run design-only on two reference houses (a 1960s DFW ranch and a 2010 two-story); audit the default and autosizing behavior (ADR-005, 006); record output granularity; write `claude/09-spikes/r01-hpxml-findings.md` with commands run and numbers observed. Gate: ADR-006 moves to Decided.

**Track B — repo scaffold and engine input (runs alongside).**

1. Monorepo at `REPO`: pnpm workspaces, TypeScript strict, Next.js app on Vercel, Supabase project for the app's own data (Assessments, runs, artifacts only; see ADR-028). Package scope `@rhoeflow/*`.
2. `packages/calc`: empty engine package with CLI entry and a fixture format; no formulas yet, just the input/output types.
3. `packages/schema`: Assessment type with HPXML as the building model (ADR-023); every input field carries `{ value, state, source, evidence: workedge_media_id[] }` where `state ∈ {measured, documented, assumed, proposed, derived, defaulted, unknown}` and unknown carries a reason `∈ {didnt_inspect, inspected_cant_tell}` (ADR-003, 024, 027). `source` is a citation string. No numeric confidence.
4. `packages/jobstore`: the `JobStore` interface from integration standard §10 (getProject, getProperty, listPhotos, listVideos, listEquipment, uploadMedia, saveReport, addNote, upsertEquipment). Two implementations: `jobstore-workedge` with stubbed calls and documented request/response shapes, and `jobstore-local` backed by the app's Supabase storage for use until WorkEdge's upload endpoint exists (ADR-031).
5. Six era/style templates as data (ADR-024), values marked `defaulted` with source; no research runs yet.
6. CI: typecheck, unit tests for schema validation, a fixture round-trip through `packages/calc` CLI (input → output types), lint on the `state`/`source` rule (a field with a value and no source fails).

Not in WO-01: any Manual J formula, any UI beyond a placeholder page, photo engine, RoomPlan, duct canvas, WorkEdge live calls.

## Definition of done

- Track A findings doc exists with reproducible commands.
- `pnpm test` passes; CI green on main.
- An Assessment fixture for the 1960s ranch validates against the schema, round-trips through the calc CLI, and every field has a state and source.
- `JobStore` interface compiles with both implementations; `jobstore-local` can upload a file and return an id.
- Decision log updated: ADR-006 status, any new ADRs the spike forces.

WO-02 (phase 1 engine port, block load) is authorized only after this list is met and `claude/09-spikes/r01-hpxml-findings.md` is reviewed.
