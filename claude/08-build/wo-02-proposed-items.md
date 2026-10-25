# Proposed WO-02 items (collected during WO-01 Track B)

Things that looked necessary while scaffolding but sit outside WO-01's scope (GOV-003).
Recorded here, not built. Each names the ADR or requirement it serves. Owner decides.

## Engine (phase 1 port)

1. **Nominal-to-assembly R derivation.** Templates seed `insulation_cavity_r_value` /
   `insulation_continuous_r_value` (HPXML layer values); the engine consumes
   `insulation_assembly_r_value`. Method `MJ8.construction.assembly_r` (re-derived from
   ASHRAE parallel-path, not copied from Manual J tables) turns the first into the second as
   a `derived` field. Until then fixtures carry placeholder assembly R values marked
   `assumed` with a PLACEHOLDER note. [MTH-001, ADR-004, ADR-024]
2. **Duct leakage rate conversion.** Templates 3 to 5 give leakage as cfm25 per 100 ft2;
   HPXML `DuctLeakageMeasurement` takes CFM25 / CFM50 / Percent. Derive CFM25 from the
   served floor area (`conditioned_floor_area_served`) as a `derived` field. The applier
   currently records these as skipped with a reason. [MTH-002, ADR-024]
3. **Design conditions from the pinned weather library** (`WeatherRef`), replacing the
   PLACEHOLDER `manualj_inputs` design temperatures in fixtures. [WTH-001, WTH-002]
4. **MJ8 default internal gains and occupants** as a method, replacing fixture placeholders.
   [MTH-001]
5. **Scenario overrides.** `ScenarioSchema.overrides` is an empty tuple in WO-01. Define the
   override record (field path, value field, rationale) and the frozen-baseline rule.
   [SCN-001, SCN-002]
6. **Expected results for the ranch fixture** from the Track A OpenStudio-HPXML run, with
   the three tolerance bases recorded separately. [QA-001, QA-002, ADR-015]
7. **Second fixture: 2010 two-story** (Track A reference house 2), built from template
   `dfw-2001-2011-one-story-iecc2000` or a two-story sibling; decide whether the template set
   needs a 2001 to 2011 two-story variant. [ADR-024]
8. **HPXML XML serializer** from the schema's building model, so the same Assessment feeds
   OpenStudio-HPXML directly (ADR-023) and the CI oracle (ADR-004). Mapping notes already
   sit in the schema comments: fraction -> Percent, cavity R -> Layer/NominalRValue,
   `x_served_zone_ids` -> extension.

## Data and storage

9. **Supabase migrations** for `assessments`, `calc_runs`, `artifacts` (RLS by
   `workedge_team_id`), plus the `rhoe-media` bucket policy for jobstore-local. Deferred
   until the project URL and keys arrive (owner instruction, Oct 24). [DAT-001, SEC-001, ADR-028]
10. **Local-media migration tool.** Enumerate `local:` ids via their sidecars, upload to
    WorkEdge once the endpoint exists, rewrite evidence ids, set
    `migrated_to_workedge_media_id`. `LocalJobStore.listPhotos/listVideos` stay
    `not_implemented` until this exists. [ADR-031]
11. **Assessment persistence API** (create/resume by `workedge_project_id`, revision bump,
    optimistic concurrency) once the tables exist. [API-002, REV-001]

## WorkEdge

12. **Confirm WorkEdge routes and field names** against its repo and replace the
    provisional `WORKEDGE_CALLS` table; then implement the five reads. [ADR-011, standard §11]
13. **Open the upload-endpoint ticket** on WorkEdge's API/MCP epic (blocking for phase 3). [ADR-028]

## Tooling

14. **Vitest 4 / rolldown.** The dev machine's Smart App Control blocks rolldown's native
    binding (see `wo-01-build-log.md`). Revisit when the binding's reputation clears or
    CI-only test runs are acceptable; until then Vitest stays on 3.2.x.
15. **ESLint or Biome** for source-level rules (the provenance lint covers JSON data only).
    Decided 2026-10-25: not in WO-02; revisit when a second contributor joins. [GOV-002]
16. **Vercel project** rooted at `apps/web` with `pnpm build` as the install/build command;
    not created in WO-01 (owner: "don't deploy until I say so"). [ADR-013]

## Added after Track A (R01), 2026-10-25

17. **Duct-leakage slot semantics.** `duct_leakage_to_outside` is applied to both the supply and
    the return measurement, so the pre-1980 template's 0.20 became 40 % total and the oracle
    warned. Decided 2026-10-25: slot = total, applier splits 2/3 supply and 1/3 return.
    Regenerate the ranch fixture afterwards (WO-02 Track A, item A2). [ADR-024]
18. **Oracle in CI.** Install the pinned OpenStudio + OpenStudio-HPXML on the CI runner from
    `tools/hpxml-oracle/pin.json` (archives, digest check, no elevation), run
    `run-design-only.mjs` on every fixture, and compare `results_annual` against each fixture's
    `expected` block within its tolerances. [QA-001, QA-002, ADR-004, ADR-015]
19. **Resolve ADR-034** (design-condition source) and have the HPXML serializer always write
    `ManualJInputs` so the engine never picks design conditions silently. [WTH-001, ENG-003]
20. **Engine defaults as provenance.** In reference mode, read `in.xml` back and surface every
    `dataSource='software'` value that affects the load (findings §6.4) as a `defaulted` field
    with source "openstudio-hpxml v1.12.0 default". [ENG-003, PRV-001]
21. **License inventory entry** for OpenStudio-HPXML v1.12.0 and OpenStudio 3.11.0 from the
    license files at the pinned tags, with required notices. [LIC-001, LIC-002]
