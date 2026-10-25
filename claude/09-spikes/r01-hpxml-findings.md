# R01 spike: OpenStudio-HPXML as the reference engine (WO-01 Track A)

Run on 2026-10-25 on Eric's Windows 11 workstation. Everything below was executed; nothing is
quoted from documentation unless marked "docs". Requirement IDs: ENG-001 to ENG-006, LIC-001,
QA-002, WTH-001. ADRs touched: ADR-004, ADR-005, ADR-006, ADR-023; proposed ADR-034.

## 1. Pinned versions

| Component | Pinned | Evidence |
| --- | --- | --- |
| OpenStudio-HPXML | **v1.12.0**, released 2026-05-14, tag commit `502811cdfa5ccf82cd9afd00114a4d49eca85700` | GitHub API, `releases/tags/v1.12.0`; still the newest release on 2026-10-25 (next-newest v1.11.1, 2026-02-27) |
| OpenStudio-HPXML archive | `OpenStudio-HPXML-v1.12.0.zip`, 15.5 MB, sha256 `0770bfd7bf46441ff7d2dc9beb1aa24f1be4d878aeee47ebea90fc27721eb38a` | https://github.com/NatLabRockies/OpenStudio-HPXML/releases/download/v1.12.0/OpenStudio-HPXML-v1.12.0.zip; hash verified after download |
| OpenStudio | **3.11.0+241b8abb4d** (the version v1.12.0 declares) | `openstudio.exe --version` printed `3.11.0+241b8abb4d` |
| OpenStudio installer (official, not run) | `OpenStudio-3.11.0+241b8abb4d-Windows.exe`, 239.4 MB, sha256 `247e28cffeb18a5d488fcc5f1e56b76b586b1bd70533c79a2bb4cbaaa5343721`, Authenticode **Valid**, signer CN=National Renewable Energy Laboratory | https://github.com/NatLabRockies/OpenStudio/releases/download/v3.11.0/OpenStudio-3.11.0%2B241b8abb4d-Windows.exe |
| OpenStudio archive (official, used) | `OpenStudio-3.11.0+241b8abb4d-Windows.tar.gz`, 326.8 MB, sha256 `d87f737ef44fc38aa96600dd2d8a329b39ffbd9865fc7952f93dcd191b84fc46` | https://github.com/NatLabRockies/OpenStudio/releases/download/v3.11.0/OpenStudio-3.11.0%2B241b8abb4d-Windows.tar.gz |
| EnergyPlus (bundled) | 25.2.0-cf7368216c | `EnergyPlus\energyplus.exe --version` |
| HPXML schema | 5.0, namespace `http://hpxmlonline.com/2025/12` | sample files in `workflow/sample_files`; release notes say "HPXML v5.0-rc1" |
| Weather | `USA_TX_Dallas-Fort.Worth.Intl.AP.722590_TMY3.epw`, shipped inside the v1.12.0 archive under `weather/` | `ls weather | grep _TX_` |
| License | upstream `LICENSE.md` at the pinned tag (BSD-style with NREL attribution, no-endorsement and trademark clauses; brief §Openness) | file present in the archive; not re-reviewed here (LIC-001 inventory is a WO-02 item) |

Repo pin file: `tools/hpxml-oracle/pin.json`. Local install paths (not in the repo):
`C:\Users\eric\openstudio-3.11.0` (OpenStudio) and `C:\Users\eric\dev\openstudio-hpxml\v1.12.0` (OpenStudio-HPXML).

**Why the archive and not the installer.** The signed installer requests elevation; it cannot run
from a non-interactive session (`Start-Process` returned "The requested operation requires
elevation"). The same release publishes a tar.gz of the identical build; it was extracted into a
user folder and `openstudio.exe` inside it carries a valid NREL signature, so Windows Smart App
Control allows it. No system setting was changed. Running the installer later is optional and
would not change any result here.

## 2. Commands run

All from `C:\Users\eric\dev\openstudio-hpxml\v1.12.0` with
`OS=C:\Users\eric\openstudio-3.11.0\bin\openstudio.exe`. Output directories were under the
session scratchpad; the resulting files are copied verbatim into `claude/09-spikes/r01/runs/`.

```bash
# proof of the design-only path on a shipped sample
$OS workflow/run_simulation.rb -x workflow/sample_files/base-foundation-slab.xml \
    -o <out>/sample-slab-skipsim --skip-simulation --output-format json
# zone/space granularity on a shipped sample
$OS workflow/run_simulation.rb -x workflow/sample_files/base-zones-spaces.xml \
    -o <out>/sample-zones-spaces-skipsim --skip-simulation --output-format json
# the two reference houses
$OS workflow/run_simulation.rb -x <repo>/claude/09-spikes/r01/ranch-1960s-dfw.xml \
    -o <out>/ranch-1960s-dfw --skip-simulation --output-format json
$OS workflow/run_simulation.rb -x <repo>/claude/09-spikes/r01/two-story-2010-dfw.xml \
    -o <out>/two-story-2010-dfw --skip-simulation --output-format json
# sizing-policy audit: five variants generated from the two-story file (claude/09-spikes/r01/variants/)
for v in two-story-autosize-furnace-ac two-story-hp-autosize-default two-story-hp-autosize-hers \
         two-story-hp-autosize-acca two-story-hp-autosize-maxload; do
  $OS workflow/run_simulation.rb -x <repo>/claude/09-spikes/r01/variants/$v.xml \
      -o <out>/$v --skip-simulation --output-format json
done
```

Schema and Schematron validation ran on every file (it is on by default; `-s` would skip it).
The first ranch attempt failed validation with
`A location is specified as "garage" but no surfaces were found adjacent to this space type`
(the water heater had been placed in a garage the model does not have); the file was corrected
to `conditioned space` and re-run. That failure is the evidence that validation is active.

Wall-clock per run, including Ruby start-up: 3 to 6 s. The measure itself reports 1.8 to 3.8 s.

## 3. ADR-006: design-only execution is demonstrated

`run_simulation.rb --skip-simulation` passes `run_measures_only: true` to `run_hpxml_workflow`
(`workflow/run_simulation.rb` line 118; `HPXMLtoOpenStudio/resources/meta_measure.rb` lines
23 and 50). The HPXMLtoOpenStudio measure then does, before returning
(`HPXMLtoOpenStudio/measure.rb` lines 129 to 186):

1. applies defaults and runs the Manual J design-load and sizing calculations
   (`process_defaults_schedules_emissions_files`), then
2. writes `in.xml` (the HPXML with every software-supplied value tagged
   `dataSource='software'`),
3. writes `results_annual.<fmt>` with sections `HVAC Capacity`, `HVAC Design Temperature`,
   `HVAC Design Load` (and `HVAC Zone Design Load`, `HVAC Space Design Load` when zones and
   spaces are modeled), and
4. writes `results_design_load_details.<fmt>` with per-surface heat-transfer multipliers,
   per-surface loads, and the AED curve.

No IDF is generated and EnergyPlus never starts. The `run.log` of each run is empty apart from
engine warnings. Output set observed in every run directory: `in.xml`, `results_annual.json`,
`results_design_load_details.json`, `run.log`.

**Proposal:** move ADR-006 from Open to Decided with the position "Design-only execution exists
in v1.12.0 via `--skip-simulation`; it runs the full Manual J load and sizing code path and
writes `in.xml`, `results_annual` and `results_design_load_details` in a few seconds without
EnergyPlus." Owner approval pending.

## 4. Reference house 1: 1964 brick ranch, 1,600 ft2, slab, DFW

Input: `claude/09-spikes/r01/ranch-1960s-dfw.xml`, hand-authored to mirror
`packages/calc/fixtures/ranch-1960s-dfw.fixture.json` (template `dfw-pre1980-ranch-slab`
applied). No `ManualJInputs` were supplied, so the engine's own defaults show.

Design temperatures chosen by the engine: heating 25.88 °F, cooling 98.42 °F, daily range
"medium". Fixed capacities (60,000 / 36,000 Btu/h) were kept because
`AllowIncreasedFixedCapacities` defaulted to false.

| Component | Heating Btu/h | Cooling sensible Btu/h | Cooling latent Btu/h |
| --- | ---: | ---: | ---: |
| Ducts | 30,885 | 52,142 | 4,662 |
| Windows | 7,500 | 8,391 | |
| Doors | 735 | 574 | |
| Walls | 11,802 | 6,910 | |
| Slabs | 9,545 | 0 | |
| Ceilings | 5,883 | 7,789 | |
| Infiltration | 8,274 | 2,678 | 1,852 |
| Internal gains | | 3,320 | 800 |
| **Total** | **74,625** | **81,804** | **7,314** |

Per-surface multipliers (Btu/h per ft2): windows heating 44.12, cooling N 31.35 / E 75.02 /
S 38.71 / W 75.02; walls 11.03 / 6.46; ceiling 3.68 / 4.87; slab 59.66 per ft of perimeter
heating, 0 cooling; infiltration 173 CFM heating, 106 CFM cooling.

Engine warning: `Very high sum of supply + return duct leakage to the outside; double-check
inputs.` The fixture carries 20 % leakage to outside on the supply **and** 20 % on the return
(40 % total), which is how the template's single `duct_leakage_to_outside` slot got applied to
both measurements. The plan's era table says "20 %+ leakage" without saying per side. With
R-4 ducts in a vented DFW attic this makes ducts 41 % of the heating load and 64 % of the
sensible cooling load. This is a fixture and template-semantics issue, not an engine issue;
see §9.

## 5. Reference house 2: 2010 two-story, 2,400 ft2, slab, DFW

Input: `claude/09-spikes/r01/two-story-2010-dfw.xml` (template
`dfw-2001-2011-one-story-iecc2000` values; duct leakage converted by hand to 240 CFM25 to
outside, split 160 supply / 80 return). Same engine design temperatures.

| Component | Heating Btu/h | Cooling sensible Btu/h | Cooling latent Btu/h |
| --- | ---: | ---: | ---: |
| Ducts | 18,588 | 15,879 | 2,465 |
| Windows | 6,353 | 8,344 | |
| Doors | 441 | 344 | |
| Walls | 7,265 | 3,365 | |
| Slabs | 8,352 | 0 | |
| Ceilings | 1,655 | 2,191 | |
| Infiltration | 9,775 | 3,285 | 2,272 |
| Internal gains | | 3,550 | 1,000 |
| **Total** | **52,429** | **36,959** | **5,737** |

Multipliers: windows heating 17.65, cooling N 13.23 / E 34.48 / S 16.81 / W 34.48; walls 3.68 /
1.70; ceiling 1.38 / 1.83; slab 59.66 / 0; infiltration 205 / 130 CFM.

Both houses are illustrative fixtures with placeholder whole-assembly R-values (see the XML
comments). The numbers are the oracle's answer for those inputs; they are not a claim about any
real DFW house. They become the `expected` block of the two calc fixtures in WO-02 (QA-002),
with the three tolerance bases tracked separately (ADR-015).

## 6. ADR-005 audit: defaults and autosizing

### 6.1 Which sizing policy applies, and when

`HPXMLtoOpenStudio/resources/defaults.rb` lines 417 to 419:

```ruby
if hpxml_bldg.header.heat_pump_sizing_methodology.nil? && (hpxml_bldg.heat_pumps.size > 0)
  hpxml_bldg.header.heat_pump_sizing_methodology = HPXML::HeatPumpSizingHERS
  hpxml_bldg.header.heat_pump_sizing_methodology_isdefaulted = true
```

So the HERS default is applied **only when the house has a heat pump**. A furnace plus air
conditioner has no sizing methodology at all; its autosizing is the Manual S-style logic below
with no policy switch. Observed: the furnace/AC runs' `in.xml` contain no
`HeatPumpSizingMethodology`; the heat-pump run without one contains
`<HeatPumpSizingMethodology dataSource='software'>HERS</HeatPumpSizingMethodology>`.

### 6.2 What each policy produced (two-story house, single-stage equipment, capacities removed)

| Variant | Heating load | Cooling load total | Heating capacity | Cooling capacity | Backup | Cooling cap / cooling load |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Furnace + AC, autosized (no policy field) | 52,429 | 42,696 | 52,429 | 46,104 | 0 | 1.080 |
| Heat pump, no policy given (defaults to HERS) | 49,495 | 42,696 | 53,019 | 53,019 | 49,495 | 1.242 |
| Heat pump, HERS explicit | 49,495 | 42,696 | 53,019 | 53,019 | 49,495 | 1.242 |
| Heat pump, ACCA | 49,495 | 42,696 | 53,019 | 53,019 | 49,495 | 1.242 |
| Heat pump, MaxLoad | 49,495 | 42,696 | 67,184 | 67,184 | 49,495 | 1.574 |

Observations, each tied to code:

- The capacities written to `in.xml` and `results_annual` are **rated** (AHRI-condition)
  capacities, not loads. The engine computes a design capacity from the load with Manual S
  oversize limits, then divides by a performance adjustment for the design outdoor temperature
  and indoor wet bulb to get the rated value (`hvac_sizing.rb` lines ~2700 to 2760,
  `cool_cap_rated = cool_cap_design / total_cap_curve_value`). In these runs the adjustment is
  0.926 for both the AC and the heat pump (42,696 / 46,104 and 49,100 / 53,019). That is why the
  heat-pump "ACCA" result is 1.24 x the total cooling load although the oversize limit is 1.15:
  1.15 x 42,696 = 49,100 design, / 0.926 = 53,019 rated.
- Oversize limits: 1.15 single-stage, 1.20 two-stage, 1.30 variable-speed, plus a 15,000 Btu/h
  delta allowance, undersize limit 0.90 (`get_hvac_size_limits`, lines 1724 to 1738).
- HERS (lines 2976 to 2990) only raises a heat pump's capacity to at least
  max(heating load, sensible cooling load); here the ACCA cooling-based size was already above
  that, so HERS and ACCA coincide. They diverge for heating-dominated houses or low-SHR loads.
  Do not generalize this coincidence beyond single-stage equipment in DFW.
- MaxLoad (lines 2746 to 2753 and 3708 to 3725) sizes to the larger of heating and cooling and
  applies the heat-pump capacity derating at the heating design temperature: 49,495 / 0.737 =
  67,184 rated, with `HeatingCapacity17F` 42,057.
- Backup heat is always the full heating load (`Heat_Load_Supp`, 49,495), unaffected by policy.
- The heat-pump variants show a lower heating load than the furnace variant (49,495 vs 52,429)
  because the duct conduction loss differs with the supply air conditions (ducts 15,654 vs
  18,588). The envelope loads are identical. The "load" therefore already depends on the
  equipment type, which RhoeFlow must keep visible.
- `HeatingAutosizingFactor`, `CoolingAutosizingFactor`, `BackupHeatingAutosizingFactor` default
  to 1.0 and `AllowIncreasedFixedCapacities` to false. Fixed capacities are never raised unless
  the latter is set.

Consequence for ADR-005 (already Decided): RhoeFlow must (a) write `HeatPumpSizingMethodology`
explicitly into every HPXML it generates, including for AC-only houses where the engine will
ignore it, so the chosen policy is on record; (b) treat the engine's capacity output as
"generic autosized rated capacity" and never as a Manual S selection; (c) carry its own
`MS2023.*` methods for the actual selection. The schema already requires a sourced
`hvac_sizing_control.heat_pump_sizing_methodology` (WO-01 Track B).

### 6.3 Design conditions

With no `ManualJInputs`, the engine reads the EPW header (`weather.rb` lines 284 to 308):
heating = 99 % dry bulb, cooling = 1 % dry bulb, daily range, and 1 % mean coincident wet bulb.
The shipped DFW TMY3 header is titled "Climate Design Data 2009 ASHRAE Handbook": heating 99 %
= -3.4 °C = 25.88 °F; cooling 1 % = 36.9 °C = 98.42 °F; range 11.0 °C; MCWB 23.7 °C. Those are
exactly the defaults seen in both `in.xml` files.

These are ASHRAE 2009 values, not ACCA Manual J Table 1A values. Manual J uses the same 99 % / 1 %
definitions but its own table, and local practice (and permit reviewers) may expect the Manual J
numbers. RhoeFlow has to decide which source it cites for DFW design conditions and record it on
every run (WTH-001). Proposed ADR-034, see §10.

### 6.4 Other software-supplied values that touch the load

`in.xml` carries 250 `dataSource='software'` elements per house (most are schedules, utility
rates, appliances and lighting that do not affect design loads). The ones that do:

| Element (in.xml) | Ranch | Two-story | Note |
| --- | --- | --- | --- |
| ManualJInputs: HeatingSetpoint / CoolingSetpoint | 70 / 75 | 70 / 75 | from HVACControl setpoints |
| HumiditySetpoint / HumidityDifference | 0.5 / 26.2 | 0.5 / 26.2 | grains difference derived from EPW MCWB |
| InternalLoadsSensible / Latent | 2,400 / 0 | 2,400 / 0 | flat defaults, not occupancy-scaled |
| NumberofOccupants | 4 | 5 | bedrooms + 1 |
| InfiltrationShieldingClass / InfiltrationMethod | 4 / blower door | 4 / blower door | shielding class 4 = "normal" |
| InfiltrationVolume / InfiltrationHeight | 12,800 / 8.0 | 20,400 / 17.5 | from volume and stories |
| HasFlueOrChimneyInConditionedSpace | **true** | false | ranch has a gas water heater in conditioned space; changes infiltration |
| DuctSurfaceArea (supply / return) | 432 / 80 ft2 | 648 / 240 ft2 | from `FractionDuctArea` 1.0 and floor area served |
| DuctEffectiveRValue (supply / return) | 4.38 / 5.0 | 5.73 / 7.0 | derived from nominal R-4 / R-6; return gets a different derivation |
| DuctBuriedInsulationLevel | not buried | not buried | |
| FractionOperable (windows) | 0.67 | 0.67 | |
| Summer / Winter interior shading coefficient (medium curtains) | 0.822 / 0.822 | 0.9053 / 0.9053 | depends on SHGC |
| RoofColor / wall Color | medium dark / medium | medium dark / medium | derived from absorptance 0.9 / 0.75 |
| CoolingDesignAirflowCFM / HeatingDesignAirflowCFM | 1,080 / 1,200 | 1,440 / 1,601 | from capacities |
| FanPowerWattsPerCFM, FanMotorType | 0.5, PSC | 0.5, PSC | blower heat was 0 in the load (fan heat not added for these system types) |
| AirflowDefectRatio / ChargeDefectRatio | 0 / 0 | 0 / 0 | |
| HeatingCapacity 36,000 / 38,000 (dataSource software) | | | this is the **water heater's** burner, not HVAC; easy to misread |

Every one of these must appear in RhoeFlow as a `defaulted` field with the source
"openstudio-hpxml v1.12.0 default" when the engine runs in reference mode (ENG-003), or be
supplied explicitly by RhoeFlow so the engine's default never applies (preferred for anything
that is a Manual J input).

## 7. Output granularity (ENG-005)

| Level | Heating | Cooling sensible | Cooling latent | Where |
| --- | --- | --- | --- | --- |
| Building | total + 11 components (ducts, windows, skylights, doors, walls, roofs, floors, slabs, ceilings, infiltration, ventilation, piping) | total + 14 components (adds internal gains, blower heat, AED excursion) | total + 4 components (ducts, infiltration, ventilation, internal gains) | `results_annual` → `HVAC Design Load` (33 keys) |
| Zone (when `Zones/Zone` present) | same 33 keys per zone | | | `results_annual` → `HVAC Zone Design Load`; `results_design_load_details` → `<zone>: Loads` with a Total carrying latent |
| Space (room) | heating components | sensible components | **none** | `HVAC Space Design Load` (24 keys per space); `<space>: Loads` Totals carry Heating and Cooling Sensible only |
| Surface | heating HTM and load per window, door, wall, ceiling, floor, slab | cooling HTM and load | | `results_design_load_details` → Summary and Loads |
| Infiltration / ventilation | design CFM heating and cooling | | | Summary |
| AED curve | hourly (8:00 to 19:00) sensible excursion curve | | | `AED Curve` report, building level in the runs inspected |
| Equipment | rated capacities (heating, cooling, backup), design airflows, 17 °F capacity for heat pumps | | | `HVAC Capacity`, `in.xml` |

Not available from the engine: room-level latent loads (confirmed on `base-zones-spaces.xml`:
the four Space totals have no latent entry), room airflow assignment, any equipment selection
beyond the autosized rated capacity, and anything Manual D. Spaces require the HPXML
`Zones/Zone/Spaces/Space` structure with surfaces carrying `AttachedToSpace` and systems
carrying `AttachedToZone`; the schema's `attached_to_space` / `x_served_zone_ids` fields map to
those.

## 8. What this means for the TypeScript port (ADR-004)

- `hvac_sizing.rb` is 5,800 lines; the load section (surface HTMs, infiltration, ducts, AED) is
  the part to port first, the equipment-adjustment section (lines ~2700 to 3740) is Manual S
  territory and is replaced by `MS2023.*` methods, not ported.
- The oracle's per-surface HTMs and per-component loads give a component-level differential
  test, not just totals. Tolerances per component and per tolerance basis (ADR-015).
- The engine's load depends on the equipment type through duct loads; RhoeFlow's block load
  should report envelope and duct contributions separately so that dependency is visible.
- HPXML 5.0 (`http://hpxmlonline.com/2025/12`) is the schema the pinned engine validates
  against. `packages/schema` currently labels its model `hpxml_version: "4.0"`; change to "5.0"
  with the serializer (WO-02 proposal 8).

## 9. Findings about our own fixtures and templates

1. Template slot `duct_leakage_to_outside` is applied to each leakage measurement, so a 0.20
   fraction becomes 40 % total. The engine flags it. Decide whether the slot means total (then
   the applier splits it, e.g. supply 2/3, return 1/3) or per side (then the template values
   halve). Owner call; proposed as WO-02 item 17.
2. The two-story house used the one-story 2001 to 2011 template because there is no two-story
   variant for that era (WO-02 item 7).
3. Both houses carry placeholder whole-assembly R-values. The expected results recorded in
   WO-02 must be regenerated when the nominal-to-assembly method lands (WO-02 item 1).

## 10. Proposed decision-log changes

- **ADR-006** Open → **Decided** with the position in §3. Evidence: this document and the eight
  run directories under `claude/09-spikes/r01/runs/`.
- **ADR-005** stays Decided; add to its next action: "R01 confirmed the HERS default applies
  only to heat pumps; capacities are rated values after a 0.926 design-condition adjustment;
  RhoeFlow writes the methodology explicitly and labels engine capacities 'generic autosized'."
- **ADR-034 (new, Open):** source of DFW design conditions. Options: (a) ASHRAE design
  conditions as carried in the TMY3 EPW header (what the oracle uses; reproducible, citable, free);
  (b) ACCA Manual J Table 1A values (what reviewers expect; ACCA's table, so entered per job
  from the owned manual, never copied into the repo); (c) ASHRAE Handbook Fundamentals current
  edition values keyed by WMO. Each run records which. Owner decision before phase 2 (WTH-001).

## 11. Not done, and why

- The signed installer was not executed (needs elevation). The archive build is identical.
- No full annual simulation was run; WO-01 asked for design-only.
- License text at the pinned tag was not re-reviewed line by line (LIC-001 inventory, WO-02).
- The CI job does not yet run the oracle; `tools/hpxml-oracle/run-design-only.mjs` is the
  local runner and documents the environment variables CI will need (WO-02 item 18).
