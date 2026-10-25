# Method matrix (MTH-001)

One row per engineering method RhoeFlow ships. Method ids are stable and independent of the app
version (CLAUDE.md §Conventions). A method's version changes only when its result can change.
Status: **planned** (WO-02 scope, not written), **implemented** (code and tests exist),
**verified** (differential test against the oracle passes within the recorded tolerance).

Started in WO-02 Track A, 2026-10-25. All rows are planned; none is implemented.

| Method id | Version | What it computes | Public source for re-derivation (never ACCA tables) | Inputs | Limits and supported cases | Code | Tests | Oracle counterpart | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `MJ8.design_conditions` | 0.1 | Outdoor heating and cooling design dry bulbs, cooling MCWB, daily range class, indoor setpoints, grains difference | EPW header ASHRAE design block (ADR-034); psychrometrics per ASHRAE Fundamentals ch. 1 | `WeatherRef`, station key, HVACControl setpoints, humidity setpoint | DFW station 722590 first; any TMY3 station in the pinned library | `packages/calc/src/methods/design-conditions.ts` | planned | `defaults.rb` 265 to 276, `weather.rb` 284 to 308 | planned |
| `MJ8.units` | 0.1 | Typed quantities and conversions: ΔT, Btu/h, cfm, fractions, R and U, grains | SI and IP definitions | `QuantityField` | null never coerced to zero | `packages/calc/src/methods/units.ts` | planned | `unit_conversions.rb` | planned |
| `MJ8.construction.assembly_r` | 0.1 | Whole-assembly R from nominal cavity and continuous R for wood-stud walls, ceilings, roofs | ASHRAE Fundamentals parallel-path method; framing fractions from ASHRAE 90.1 / IECC appendix tables | nominal R values, framing factor, layer set | wood stud only in WO-02; masonry, SIP, ICF unsupported (flagged) | `packages/calc/src/methods/assembly-r.ts` | planned | none (oracle consumes assembly R) | planned |
| `MJ8.envelope.conduction` | 0.1 | U × A × ΔT per wall, ceiling, roof, floor, door; cooling ΔT adjusted by daily range | ASHRAE Fundamentals; CLTD-style adjustment re-derived | assembly R, area, adjacency, design conditions | exterior and attic-adjacent surfaces; garage and crawlspace buffers in WO-03 | `packages/calc/src/methods/envelope.ts` | planned | HTM per surface in `results_design_load_details` | planned |
| `MJ8.slab.perimeter` | 0.1 | Slab-on-grade heat loss per foot of exposed perimeter with perimeter insulation depth | ASHRAE Fundamentals slab F-factor approach | exposed perimeter, perimeter R and depth, carpet | slab on grade only; basements and crawlspaces unsupported in WO-02 | `packages/calc/src/methods/slab.ts` | planned | `Floors: Slab1` HTM (59.66 per ft on both R01 houses) | planned |
| `MJ8.glazing` | 0.1 | Conduction plus solar gain per window by orientation, SHGC, interior shading, overhangs | ASHRAE solar heat gain by latitude and orientation; shading coefficients re-derived | U, SHGC, area, azimuth, interior shading type, overhang geometry | vertical glazing; skylights WO-03 | `packages/calc/src/methods/glazing.ts` | planned | window HTM by orientation | planned |
| `MJ8.infiltration.blower_door` | 0.1 | Design heating and cooling CFM from ACH50 or CFM50 with shielding class and stories | LBL infiltration model as in ASHRAE Fundamentals ch. 16 | ACH50/CFM50, volume, height, shielding | detached single-family | `packages/calc/src/methods/infiltration.ts` | planned | infiltration CFM (173 / 106 ranch) | planned |
| `MJ8.infiltration.tightness_class` | 0.1 | Same outputs from a tightness class when no test exists (manual, no-AI path) | ASHRAE tightness classes | class, volume, height | estimates; flagged as such on reports | `packages/calc/src/methods/infiltration.ts` | planned | none | planned |
| `MJ8.internal_gains.default` | 0.1 | Occupants (bedrooms + 1), 230 / 200 Btu/h per person sensible / latent, 1,200 Btu/h appliances | plan §Manual J (public summary of the Manual J convention) | bedrooms, occupants override | block load only | `packages/calc/src/methods/internal-gains.ts` | planned | `ManualJInputs` defaults | planned |
| `MJ8.ducts` | 0.1 | Duct conduction and leakage loads by location, R, leakage, surface area; blower-heat flag | ASHRAE 152 structure re-derived | duct R, location, leakage (fraction or CFM25), served area | attic and conditioned-space ducts in WO-02 | `packages/calc/src/methods/ducts.ts` | planned | duct loads (17,792 / 18,248 / 1,632 on the ranch after A2) | planned |
| `MJ8.latent` | 0.1 | Infiltration, internal and duct latent loads from grains difference | psychrometrics, ASHRAE Fundamentals | design conditions, CFM, occupants | | `packages/calc/src/methods/latent.ts` | planned | latent components | planned |
| `MJ8.aed` | 0.1 | Adequate exposure diversity curve and excursion | Manual J concept re-derived from hourly solar gain | glazing by orientation | | `packages/calc/src/methods/aed.ts` | planned | `AED Curve` report | planned |
| `MJ8.totals` | 0.1 | Aggregation into building totals and the `CalcOutput` component list | n/a | all of the above | block load; zones and spaces empty | `packages/calc/src/methods/totals.ts` | planned | `HVAC Design Load` | planned |

Tolerances per component and per basis (floating point, interpolation, method difference) are
recorded in `packages/calc/fixtures/tolerances.json` once Track C's differential test exists.
