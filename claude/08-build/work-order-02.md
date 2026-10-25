# Work order 02 — phase 1 engine port, block load (DRAFT, not authorized)

**Status:** draft for owner review, 2026-10-25. No code under this order may be written until the
owner changes this line to "authorized" (GOV-003). Drafted from `wo-02-proposed-items.md` (21
items), the plan's phase 1 (`01-plan/research-and-plan.md` §Build plan, item 1), the R01
findings (`09-spikes/r01-hpxml-findings.md`) and WO-01's definition of done.

Owner: Eric Love. Product: RhoeFlow (ADR-033). Target: 4 to 5 weeks, an estimate (ADR-015).

## 1. Goal

`packages/calc` computes a **building-level Manual J block load** for a validated Assessment:
heating, cooling sensible and cooling latent, each broken into the same components the oracle
reports (ducts, windows, doors, walls, roofs, floors, slabs, ceilings, infiltration, internal
gains), with every intermediate value traceable to a stable method id. The engine matches
OpenStudio-HPXML v1.12.0 on the two R01 reference houses within tolerances recorded per
component and per tolerance basis. Gates G0 and G1 close. No UI.

Register IDs this order closes or advances: ENG-006, ENG-007, ENG-008, MTH-001, MTH-002,
MTH-003, UNT-001, WTH-001, WTH-002, LOD-001, QA-001, QA-002, LIC-001, LIC-002. Already closed by
WO-01 and carried: ENG-001 to ENG-005, DAT-001, DAT-002, OWN-001 to OWN-004.

## 2. What the coding session reads

| # | Document | Why |
| --- | --- | --- |
| 1 | `CLAUDE.md`, `claude/00-start-here.md` | Standing rules |
| 2 | `claude/03-decisions/decision-log.md` | ADR-004, 005, 006 (Decided), 015, 023, 024; ADR-034 must be resolved first (§4) |
| 3 | `claude/09-spikes/r01-hpxml-findings.md` and `claude/09-spikes/r01/runs/` | The oracle's numbers, defaults and code locations |
| 4 | `claude/01-plan/research-and-plan.md` §The calculation engine, §Manual J | Scope and sources of the port |
| 5 | `packages/schema`, `packages/calc`, `packages/templates` as built in WO-01 | Contracts to extend, not replace |
| 6 | `claude/02-perplexity-package/Truficient-Requirements-v3.csv` | Requirement IDs for commits |
| 7 | `C:\Users\eric\dev\openstudio-hpxml\v1.12.0\HPXMLtoOpenStudio\resources\hvac_sizing.rb` (local, not in repo) | Structure to port; tables are re-derived, never copied (ADR-004) |

## 3. Scope

Four tracks. A runs first because B depends on its decisions; B, C and D can overlap.

### Track A — decisions and data before code (week 1)

| # | Item | Source |
| --- | --- | --- |
| A1 | **ADR-034 is Decided (2026-10-25): EPW header / ASHRAE design conditions**, the oracle's source. Remaining work: implement as `MJ8.design_conditions`, add the weather library version to `pin.json`, and make the serializer always write `ManualJInputs`. | ADR-034; WTH-001 |
| A2 | **Duct-leakage slot semantics.** Decide whether `duct_leakage_to_outside` is total (applier splits supply/return) or per side (template values halve). Fix templates and applier, regenerate the ranch fixture, update the R01 ranch HPXML to match, re-run the oracle for the new expected numbers. | item 17; ADR-024 |
| A3 | **Two-story template** for 2001 to 2011 (or a `stories`-independent template) so the second reference house has a template of its own. | item 7 |
| A4 | **License inventory** entries for OpenStudio-HPXML v1.12.0 and OpenStudio 3.11.0 from the license files at the pinned tags, with the notices the report must carry. New file `claude/06-architecture/license-inventory.md`. | item 21; LIC-001, LIC-002 |
| A5 | **Method matrix skeleton** `claude/06-architecture/method-matrix.md`: one row per `MJ8.*` method planned in Track B with source, edition, inputs, limits, code path, tests. Filled in as each method lands. | MTH-001 |

### Track B — the port (`packages/calc`, weeks 1 to 4)

Method ids are stable and independent of app version. Proposed set, each a pure function with
typed inputs and a unit-checked output, each with its own tests:

| Method id | What | Oracle counterpart (hvac_sizing.rb) | Source for re-derivation |
| --- | --- | --- | --- |
| `MJ8.design_conditions` | outdoor/indoor design temperatures, daily range class, grains difference | `defaults.rb` 265 to 276; `weather.rb` 284 to 308 | per ADR-034; psychrometrics from ASHRAE Fundamentals |
| `MJ8.units` (UNT-001) | temperature differences, Btu/h, cfm, fractions, R/U, grains; null-safe | `unit_conversions.rb` | SI/IP definitions |
| `MJ8.construction.assembly_r` | nominal cavity/continuous R to whole-assembly R for wood-stud walls, ceilings, roofs | not in oracle (it takes assembly R) | ASHRAE parallel-path; framing fractions from IECC/ASHRAE 90.1 tables |
| `MJ8.envelope.conduction` | U × A × ΔT per wall, ceiling, roof, floor, door with cooling ΔT adjusted by daily range | window/wall/ceiling HTM code | ASHRAE; CLTD-style adjustment re-derived |
| `MJ8.slab.perimeter` | slab-on-grade heat loss per foot of exposed perimeter, insulation depth | slab HTM (59.66 per ft in R01) | ASHRAE Fundamentals slab F-factors |
| `MJ8.glazing` | conduction plus solar gain by orientation, SHGC, interior shading, overhangs | window HTM by orientation (N 31.35 / E 75.02 / S 38.71 / W 75.02 on the ranch) | ASHRAE solar heat gain by latitude; shading coefficients re-derived |
| `MJ8.infiltration.blower_door` | ACH50 or CFM50 to design CFM (heating and cooling) with shielding class and stories | infiltration design CFM (173 / 106 on the ranch) | LBL/ASHRAE infiltration model |
| `MJ8.infiltration.tightness_class` | manual-entry path when no blower-door result exists | n/a (oracle requires ACH50) | ASHRAE tightness classes; this is the no-AI, no-test fallback |
| `MJ8.internal_gains.default` | occupants (bedrooms + 1), 230/200 Btu/h per person, 1,200 Btu/h appliances | ManualJInputs defaults | plan §Manual J |
| `MJ8.ducts` | location, R, leakage (fraction or CFM25, with the CFA conversion from item 2), surface-area derivation, blower heat flag | duct loads (30,885 / 52,142 on the ranch) | ASHRAE 152 structure re-derived |
| `MJ8.latent` | infiltration and internal latent, duct latent | latent components | psychrometrics |
| `MJ8.aed` | adequate exposure diversity curve and excursion | AED Curve report | Manual J concept, re-derived |
| `MJ8.totals` | aggregation into building totals and the `CalcOutput` component list | `HVAC Design Load` | n/a |

Engine behaviour required by WO-01 contracts and CLAUDE.md:

- `runCalculation` returns `status: "ok"` with `results.building` filled and
  `results.components` listing every surface and factor; `zones` and `spaces` stay empty.
- Any `proposed` or `unknown` field still aborts with a structured error (ENG-007); no value is
  ever defaulted inside the engine. Defaults belong to templates and the design-condition
  library, as `defaulted` fields with sources.
- Every method result is explainable: `MTH-003` means the component list carries the inputs
  used and the method id, so a report can "show math" without re-running.
- Sanity band from the template (plan §Manual J): compare ft2 per ton against the template's
  band and emit a warning, never an error, when outside it.
- Engine version bumps to `0.1.0`; `CalcOutput.manifest.engine.version` and the fixture
  `expected` blocks are tied to it.

### Track C — HPXML serializer and oracle in CI (weeks 2 to 4)

| # | Item | Source |
| --- | --- | --- |
| C1 | `packages/hpxml` (new): serialize a validated Assessment to HPXML 5.0 (`http://hpxmlonline.com/2025/12`) using the element mapping already noted in the schema comments (fraction → Percent, cavity R → Layer/NominalRValue, `x_served_zone_ids` → extension, always write `HVACSizingControl/ManualJInputs` and `HeatPumpSizingMethodology`). Round-trip test: serialize both fixtures, validate with the oracle (schema + Schematron pass). Relabel `hpxml_version` to "5.0". | item 8, 19; ADR-023 |
| C2 | **Oracle in CI**: add Linux archive URLs and digests to `tools/hpxml-oracle/pin.json`, install from archives in the workflow (digest-checked, cached), run `run-design-only.mjs` on every fixture's serialized HPXML. | item 18; ENG-001 |
| C3 | **Expected results**: write each fixture's `expected` block from the oracle run, then a differential test per component with three tolerance classes (floating point, interpolation, method difference) and a documented value for each. G1 is this test passing. | item 6; QA-001, QA-002, ADR-015 |
| C4 | **Engine defaults as provenance** (reference mode): read `in.xml` back and surface every load-affecting `dataSource='software'` value from findings §6.4 as a `defaulted` field with source "openstudio-hpxml v1.12.0 default", so a reference run is as inspectable as a RhoeFlow run. | item 20; ENG-003, ENG-006 |
| C5 | **Artifact bundle** (ENG-008): the CLI's `run` writes a directory with the frozen input, canonical JSON, the output, the serialized HPXML, and the oracle's outputs when reference mode is on. | ENG-008 |

### Track D — carried, deferred, or needs the owner's call

| Item | Proposed disposition |
| --- | --- |
| 3 design conditions from the weather library | in Track B (`MJ8.design_conditions`) once ADR-034 is resolved |
| 4 internal-gain defaults | in Track B |
| 5 scenario overrides | **defer to WO-03** (phase 2, SCN-001) |
| 9 Supabase migrations, 11 persistence API | **defer to WO-03** (phase 2 app); the project exists, keys are held by the owner |
| 10 local-media migration tool | **defer** until WorkEdge's upload endpoint exists (ADR-028) |
| 12, 13 WorkEdge route confirmation and upload ticket | **outside this order**; handled through `07-briefs/brief-to-workedge-integration.md` |
| 14 Vitest 4 | **defer**; revisit when the binding's reputation clears |
| 15 ESLint or Biome | **owner decision**: approve a linter dependency or stay with the provenance lint only |
| 16 Vercel project | **defer** until the owner says deploy |

## 4. Owner decisions needed before authorization

1. ~~ADR-034~~ decided 2026-10-25: EPW header (ASHRAE) design conditions.
2. Duct-leakage slot meaning (A2): total or per side.
3. Whether Manual J 8th edition has been bought (plan open decision). Without the book, tables
   are re-derived from ASHRAE and IECC only and nothing can be checked against ACCA's own
   worked examples; the order can still run, but G1's "method difference" tolerance class has
   no second reference.
4. Linter dependency (item 15): yes or no.
5. Scope check: confirm that Track D's deferrals to WO-03 are acceptable, in particular that no
   Supabase tables are created in WO-02.

## 5. Definition of done

- Every `MJ8.*` method in §3 Track B exists, has unit tests, and has a method-matrix row with
  source, edition, limits and code path (MTH-001).
- `rhoe-calc run` on both fixtures returns `status: "ok"` with building totals and a complete
  component list; `pnpm roundtrip` still passes; `pnpm verify` green; CI green on main.
- Differential test against the oracle passes on both reference houses, component by component,
  within the recorded tolerances; the tolerance table is committed and each entry names its basis
  (G1).
- Both fixtures carry an `expected` block citing the oracle run that produced it (QA-002).
- The serializer's HPXML for both fixtures passes the oracle's schema and Schematron validation.
- No field is defaulted inside the engine; the provenance lint runs over the artifact bundle's
  frozen input and passes.
- Decision log: ADR-034 Decided; any ADRs the port forces appended with the next numbers.
- Report in the WO-01 format: files, requirement IDs, commands, observed output, omissions.

## 6. Reference tests and evidence

- Oracle runs: `claude/09-spikes/r01/runs/` (regenerated after A2 changes the ranch).
- Per-component tolerance table: `packages/calc/fixtures/tolerances.json` (new).
- Method matrix: `claude/06-architecture/method-matrix.md` (new).
- CI: the existing `verify` job plus a new `oracle` job; both must pass.

## 7. Exclusions

No Manual S selection logic (the engine's autosized capacities stay labeled "generic autosized",
ADR-005), no Manual D, no room or zone loads (schema fields exist, engine ignores them), no UI
beyond the CLI, no photo engine, no WorkEdge live calls, no Supabase tables, no ACCA tables
copied from any source, no accuracy percentages.

## 8. Rollback

Each track lands on its own branch and merges only when its tests pass. The engine's
`not_implemented` path stays reachable behind a `--engine-version 0.0.1` CLI flag until G1 closes,
so WO-01's contract tests keep running unchanged. Reverting WO-02 is reverting its merges; no data
store is touched.
