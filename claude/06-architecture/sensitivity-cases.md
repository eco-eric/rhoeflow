# Sensitivity cases (WO-03 E4)

Requirements: QA-005 (targeted sensitivity cases with justified expectations) and QA-004
(tolerances justified by category).

Each case changes one input of a base house. For each one, this page says what must happen to
the loads and why. Every case is a calc fixture in `packages/calc/fixtures/sens-*.fixture.json`,
so the CI oracle job (`tools/hpxml-oracle/check-fixtures.mjs`) checks the engine against the
pinned OpenStudio-HPXML v1.12.0 on it, totals and every component, like any other house.
`packages/calc/test/sensitivity.test.ts` asserts each expectation twice:

1. on the engine;
2. on the committed oracle run in `claude/09-spikes/wo03-sensitivity/runs/`.

So a case cannot pass because the engine and the expectation share the same mistake.

The case definitions are in `packages/templates/src/fixtures/sensitivity.ts`. They are generated
by `packages/templates/scripts/build-fixtures.mjs`.

All houses here are illustrative fixtures, not real properties (GOV-002).

## Base

| | |
| --- | --- |
| Quick-pass cases | `sens-base`: the `qp-ranch-1964-slab` answers (1964 one-story slab ranch, 1,600 ft², front south, 3 bedrooms, no garage, template `dfw-pre1980-ranch-slab`), plus a measured blower door at 10 ACH50 and ducts in the vented attic |
| Orientation case | `ranch-1960s-dfw` (R01): its glass is 50 / 30 / 60 / 30 ft² on N / E / S / W |

**Why ACH50 is pinned.** Without a blower-door number, the quick pass estimates ACH50 from the
LBNL ResDB regression. That regression depends on duct location and foundation, so the duct case
would also move infiltration. A measured 10 ACH50 isolates each effect.

**Why the orientation case uses R01.** The quick pass splits glass equally on all four sides. A
rotated quick-pass house would show no change, by construction.

## Cases and results

The totals below are from the committed oracle runs, in Btu/h, as heating / cooling sensible /
cooling latent. The engine matches each one within 0.5 Btu/h.

| Case | Change | Expected, and why | Oracle totals | Holds |
| --- | --- | --- | --- | --- |
| `sens-base` | none | reference | 63,568 / 47,492 / 3,591 | — |
| `sens-glazing-lots` | Window amount "typical" (0.15 of floor area) to "lots" (0.22) | Window area scales ×0.22/0.15 = 1.467 on every side. Window heating is U×A×HTD; solar and conduction cooling are both per ft². So both window components scale by exactly 1.467. Each wall loses the added glass area, so each wall falls by the same U×ΔA×TD. Doors, ceiling, slab, infiltration and internal gains do not change. Ducts carry a share of the load they deliver, so duct heating and cooling rise. Heating and cooling totals rise. | 68,134 / 54,045 / 3,527 | yes; engine exact, oracle within its rounding |
| `sens-leakage-up` | Blower door 10 to 15 ACH50 | `MJ8.infiltration.blower_door` is linear in ACH50: ACH50 gives SLA, SLA gives ELA, and CFM = ELA×√(stack + wind). So infiltration heating, cooling sensible and latent each scale by exactly 1.5. The envelope does not change, and ducts rise with their load. All totals rise. | 67,765 / 48,852 / 4,739 | yes |
| `sens-ducts-conditioned` | Ducts in the vented attic to ducts in conditioned space | Ducts inside the house leak into it. The quick pass sets leakage to outside to 0 when no duct-blaster number is given, so the duct component is 0 for all three loads. Nothing else changes, and each total falls by exactly the base duct component. | 45,411 / 30,996 / 2,343 | yes, after finding 2 below |
| `sens-heating-design-colder` | Heating design 25.88 °F to 20.88 °F | Walls, windows, doors, ceiling (U×A×HTD) and slab (F×P×HTD) each scale by exactly (70−20.88)/(70−25.88) = 1.1133. Infiltration rises by more than that ratio, because its CFM also grows with the stack term. Ducts rise with their load. Cooling does not change at all. | 71,082 / 47,492 / 3,591 | yes |
| `sens-cooling-design-hotter` | Cooling design 98.42 °F to 103.42 °F | Wall, window, door and ceiling conduction cooling each rise by U×A×5. That is the same Btu/h their heating rises by in the case above, because the CLTD and CTD terms move one for one with outdoor temperature. Window solar, slab and internal gains do not change. Infiltration sensible and latent rise: more CFM at the station's own design moisture. Heating does not change. | 63,568 / 53,851 / 3,772 | yes, after finding 1 below |
| `sens-orientation-r01-rot90` | R01 rotated 90° clockwise | Orientation enters no heating term, so heating does not change at all. Walls do not change either: their CLTD does not depend on orientation here. The 60 ft² south group moves to west and the 50 ft² north group to east, and both gain solar. The east and west groups move to south and north, and both lose. Net window cooling and cooling sensible rise. Latent changes only through the duct component. | 61,532 / 50,611 / 4,244, against R01's 61,532 / 47,910 / 4,284 | yes |

## Findings

The cases found two defects. Both are fixed in the same change, and each case now matches the
oracle.

### 1. Cooling design temperature changed the outdoor moisture

`MJ8.design_conditions` is now 0.1.1.

**What was wrong.** The engine read the station's mean coincident wet bulb at whatever cooling
design temperature the job used. At 103.42 °F with the same 74.66 °F wet bulb, that is drier
air. Engine latent fell to 2,928 Btu/h while the oracle's rose to 3,772.

**What the oracle does.** It takes the outdoor humidity ratio from the station's own 1 % dry-bulb
and wet-bulb pair (`weather.rb` 325, used by `defaults.rb` 301 to 305), whatever the design
temperature.

**The fix.** The engine now takes the dry bulb the wet bulb pairs with (`coolingMcwbDbF`, the
station's 1 % DB).

**Effect on existing results.** None: their design temperature is the station's.

### 2. Ducts in conditioned space kept the template's leakage to outside

The quick pass, `RHOE.quick_pass.box_geometry`, gave inside ducts the template's 20 % leakage to
outside.

**What the oracle does.** It rejects that input (`airflow.rb` 795 to 813). For ducts entirely
inside conditioned space, it does not accept more than 10 cfm25 per 100 ft², or 12.5 %, to
outside.

**What the engine did.** It modelled the leakage as lost to ambient, so the inside-duct house
still carried 10,440 Btu/h of duct heating.

**The fix.** For inside ducts with no duct-blaster number, the quick pass now writes 0 cfm25 to
outside. The value is `derived`, with that source, and a duct-blaster number still takes
precedence.

**Effect on existing results.** None. The one committed house with inside ducts
(`qp-one-story-2018-heat-pump`) has a measured number.

## Tolerances (QA-004)

| Comparison | Tolerance | Category | Why |
| --- | --- | --- | --- |
| Engine case against engine base, exact ratios and equal deltas | 1e-9 relative, 1e-6 Btu/h absolute | floating point | Same arithmetic path; only rounding noise |
| Oracle case against oracle base, ratios | 0.5×ratio + 0.5 Btu/h | oracle reporting precision | The oracle reports each component rounded to 1 Btu/h |
| Oracle equal deltas (the cooling-hotter case) | 2 Btu/h | oracle reporting precision | Two differences of rounded values |
| Engine against oracle, every case | 5 Btu/h on totals, 2 Btu/h per component | floating point (`packages/calc/fixtures/tolerances.json`) | As for every fixture (ADR-015) |

None of these is an accuracy claim about Manual J or about real houses. They only bound how
closely the engine reproduces its own method and the pinned oracle.

## Not covered

- **Weather station changes.** One station (DFW 722590) is in the pinned library, and the
  design-temperature cases cover the weather inputs the method reads.
- **Duct leakage amount.** Q10 sealed versus unsealed is covered by the quick-pass houses, not
  as an isolated case.
- **Two-story and crawlspace bases.** Each case varies the one-story slab ranch only.
