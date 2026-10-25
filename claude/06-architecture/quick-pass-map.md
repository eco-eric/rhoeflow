# Quick-pass map

WO-03 item A3 (QST-001, QST-002, ADR-024, ADR-027). Written 2026-10-25.

This maps each quick-pass question to the Assessment fields it sets, the method that consumes
them, and the source of its default. The field app (D2) and the template editor (D9) are built
from this table. Defaults are values a template or a method supplies when the tech does not
answer; every one is tagged `defaulted` (or `derived`) with its source, never `measured`.

Sources used below, all public or open source:

| Key | Source |
| --- | --- |
| plan | `01-plan/research-and-plan.md` §Quick pass (DFW defaults) |
| template | the era template the answers to Q2 and Q3 select (`packages/templates`, owner-editable from D9) |
| brh | OpenStudio-HPXML v1.12.0 BuildResidentialHPXML defaults and option tables (BSD; `BuildResidentialHPXML/measure.xml`, `resources/options/*.tsv`) |
| hes | LBL Home Energy Score window construction types, as tabulated in OpenStudio-HPXML `defaults.rb` `get_window_ufactor_shgc` |
| resdb | LBNL ResDB infiltration regression, as implemented in OpenStudio-HPXML `defaults.rb` `get_infiltration_ach50` |
| resnet301 | ANSI/RESNET/ICC 301 reference home: window area 18 % of conditioned floor area, equal on four orientations |
| adr034 | ADR-034: design conditions from the EPW header of the pinned weather library |

## 1. The questions

| # | Question and choices | Fields set | Default if not answered | Feeds |
| --- | --- | --- | --- | --- |
| 1 | **Address.** From the WorkEdge property; the tech confirms it | `workedge.property_id` on the Assessment (never the address text, ADR-028); `climate_and_risk_zones.weather_station` | DFW station 722590 (adr034). An address the library does not cover is refused with `unsupported_station`; no geocoding | `MJ8.design_conditions` |
| 2 | **Year built** | `building_construction.year_built` | none: required, because it selects the template | template selection; `RHOE.infiltration.resdb_ach50` |
| 3 | **Conditioned floor area and stories** | `conditioned_floor_area`, `number_of_conditioned_floors`, `..._above_grade` | none: required | geometry (§2), ducts, internal gains |
| 3a | **Attached garage?** No / 1 / 2 / 3 car; which side of the front | garage space and the walls, ceiling or floor it shares | none: asked | `MJ8.buffer_space` (B1) |
| 3b | **Room over the garage?** (two-story with a garage only) | floor over garage, its area | no | `MJ8.buffer_space` |
| 4 | **Ceiling height** | `average_ceiling_height` | template slot `average_ceiling_height` (new); seed 8 ft (brh) until the owner sets era values; the plan's 9 to 10 ft is the newer-home range | volume, wall areas |
| 5 | **Which way does the front face?** 8 compass points | azimuth of the front wall; every surface's azimuth follows | none: asked; no map | `MJ8.glazing` |
| 6 | **Foundation.** Slab / pier-and-beam (vented crawlspace) | `foundations[0].type`, slab or floor-over-crawl surfaces | template `style.foundation`; plan: slab, pier-and-beam before 1960 | `MJ8.slab.perimeter`, `MJ8.buffer_space` |
| 7 | **Window amount.** Light / typical / lots of glass, or a measured total | total window area as a fraction of floor area, split equally on four sides (resnet301) | template slot `window_area_fraction` (new). Typical seed 0.15 (plan's 15 to 18 % low end; resnet301 uses 0.18). Light 0.10 and lots 0.22 are builder placeholders flagged for the owner to set | `MJ8.glazing` |
| 8 | **Window type.** Single / double clear / double low-E; frame metal or not | window U-factor and SHGC | template `window_ufactor`, `window_shgc` by era; a choice maps to the hes table (single clear metal 1.27 / 0.75; double clear non-metal 0.51 / 0.56; double low-E non-metal 0.42 / 0.52) | `MJ8.glazing` |
| 9 | **Attic insulation.** None / some / modern / upgraded, or a measured depth | ceiling cavity R | template `ceiling_insulation_cavity_r`. Choices: none R-0, some R-13, modern R-30, upgraded R-38 (brh `enclosure_ceiling.tsv` steps); a depth in inches times R per inch by material is `measured` | `MJ8.construction.assembly_r` then `MJ8.envelope.conduction` |
| 10 | **Ducts.** Where (attic / conditioned / garage / crawlspace) and sealed or not | duct location, insulation R, leakage to outside (split 2/3 supply, 1/3 return) | template `duct_insulation_r`, `duct_leakage_to_outside`; plan: attic, unsealed before 2015. "Sealed" uses the template's sealed value (new slot `duct_leakage_sealed`, seed from IECC 2015 R403.3.4: 4 cfm25 per 100 ft² total) | `MJ8.ducts` |
| 11 | **House tightness.** Leaky / average / tight, or a blower-door number | `air_infiltration.air_leakage` | the ACH50 from the resdb regression for the house's year, area, height, foundation and duct location, times the leakiness multiplier (tight 0.686, average 1.0, leaky 1.549). A blower-door number is `measured` | `RHOE.infiltration.resdb_ach50` (B8), then `MJ8.infiltration.blower_door` |
| 12 | **Bedrooms** | `number_of_bedrooms` | none: asked | `MJ8.internal_gains` (occupants = bedrooms + 1) |

Values the quick pass never asks but every run needs come from the template and site defaults
already in `packages/templates/src/fixtures/common.ts` (shielding class, soil, wall type,
roof color, setpoints, `ManualJInputs`), each tagged `defaulted` with its source.

## 2. Geometry the answers derive (`RHOE.quick_pass.box_geometry`, new)

The quick pass has no drawing (GEO-001 holds by construction). A box model turns the answers into
surfaces. Every value it writes is `derived`, citing the method and the answers it used.

| Quantity | Derivation | Source |
| --- | --- | --- |
| Footprint | floor area / stories above grade | — |
| Length and width | aspect ratio 2 (front and back are the long walls) | brh `geometry_unit_aspect_ratio` default |
| Wall area per side | side length × ceiling height × stories, less the length shared with a garage | — |
| Window area per side | Q7 fraction × floor area / 4 | resnet301 equal split |
| Doors | 20 ft² opaque, on the front wall | brh `geometry_door_area` default |
| Ceiling and roof | ceiling = top-floor footprint; roof at 6:12 pitch over a vented attic | brh `geometry_roof_pitch`, `geometry_attic_type` defaults |
| Slab perimeter | exposed perimeter of the footprint, less the garage-shared length | — |
| Garage | 12 ft wide per car, 20 ft deep, inset on the chosen side | brh `geometry_garage_type.tsv` |
| Duct surface area | from floor area and stories by `MJ8.ducts` (already in 0.1.0) | — |

The box model is a sizing-grade approximation, which is what the quick pass promises. The detail
pass (phase 4) replaces it with measured surfaces.

## 3. Unknown answers (ADR-027)

Every question offers two kinds of unknown, and neither becomes zero.

- **Didn't inspect.** The template default stays, tagged `defaulted`, and the item stays on the
  task overview as not inspected.
- **Inspected, can't tell.** The template default stays, the field carries the note
  "inspected, could not determine", and the report's assumptions list shows it.

In both cases the answer appears on the report as assumed, not measured. The engine still refuses
`unknown` and `proposed` fields (ENG-007); the quick pass resolves an unknown answer to a sourced
default before a run, and the missing-input review (D5) lists anything left unresolved.

## 4. Changes this map needs elsewhere

| Change | Where | WO-03 item |
| --- | --- | --- |
| New template slots: `average_ceiling_height`, `window_area_fraction`, `duct_leakage_sealed` | `packages/templates` | A4 / C7 |
| Sanity band on templates | `packages/templates` | A4 |
| `RHOE.quick_pass.box_geometry` | new module in `packages/templates` (it writes Assessment fields, it is not a load method) | D2 |
| `RHOE.infiltration.resdb_ach50`, oracle-verified through a `LeakinessDescription` fixture variant | `packages/calc` | B8 |
| Wire `MJ8.construction.assembly_r` from Q9 and the template wall cavity R | `packages/templates` applier | D2 |
| Garage, crawlspace and room-over-garage surfaces | `packages/calc`, `packages/hpxml` | B1, B4 |

## 5. What the owner sets in the template editor

The placeholders above stay labeled as builder placeholders until the owner replaces them in D9:
the light and lots window fractions, the era ceiling heights, the sanity bands, and any template
value the owner's field experience contradicts. The editor requires a source for every value.
