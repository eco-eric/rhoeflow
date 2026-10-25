/**
 * The 2010 DFW two-story reference house (R01 reference house 2; WO-02 Track A, item A3).
 *
 * ILLUSTRATIVE FIXTURE, not a real property (GOV-002). Mirrors
 * claude/09-spikes/r01/two-story-2010-dfw.xml: 30 × 40 ft footprint, 1,200 ft2 per floor,
 * brick veneer, slab, vented attic over the second floor, furnace and central AC. Fields the
 * era template seeds (windows, air leakage, duct insulation, cavity R) start `unknown` so
 * `applyTemplate(..., dfw-2001-2011-two-story-iecc2000)` fills them as `defaulted`.
 * Whole-assembly R-values are placeholders until MJ8.construction.assembly_r replaces them.
 */
import type { AssessmentInput, KnownState, Unit, UnknownReason } from "@rhoeflow/schema";
import { dfwManualJInputs, dfwSiteDefaults } from "./common.js";

const SRC = "fixture: @rhoeflow/templates two-story-2010-dfw (illustrative reference house, not a real property)";
const WE_PROPERTY = "we_property_fixture_two_story";

function a<T>(value: T, note?: string, state: KnownState = "assumed") {
  return { value, state, source: SRC, evidence: [] as string[], ...(note ? { note } : {}) };
}
function q<U extends Unit>(value: number, unit: U, note?: string, state: KnownState = "assumed") {
  return { value, unit, state, source: SRC, evidence: [] as string[], ...(note ? { note } : {}) };
}
function unknownQ<U extends Unit>(unit: U, reason: UnknownReason = "didnt_inspect") {
  return { value: null, unit, state: "unknown" as const, reason, evidence: [] as string[] };
}
function fromProperty<T>(value: T, field: string) {
  return { value, state: "documented" as const, source: `workedge:property:${WE_PROPERTY}.${field}`, evidence: [] as string[] };
}

export const TWO_STORY_ASSESSMENT_ID = "8d2e7f3a-1b4c-4e5d-9f60-7a8b9c0d1e2f";
export const TWO_STORY_TIMESTAMP = "2026-10-25T09:00:00-05:00";

/** 10 cfm25 per 100 ft2 (template) × 2,400 ft2 = 240 cfm25 total to outside, split 2/3 supply and 1/3 return (WO-02 A2). */
const LEAKAGE_SOURCE =
  "derived: template dfw-2001-2011-two-story-iecc2000 duct_leakage_to_outside 10 cfm25/100 ft2 (total to outside) × conditioned_floor_area_served 2,400 ft2 = 240 cfm25, split 2/3 supply / 1/3 return per WO-02 A2";

export function twoStoryBaseAssessment(): AssessmentInput {
  const placeholderWallR = "PLACEHOLDER whole-assembly R for 2x4 R-13 brick veneer; MJ8.construction.assembly_r replaces it";
  const wall = (id: string, azimuth: number, area: number) => ({
    id,
    exterior_adjacent_to: a("outside" as const),
    interior_adjacent_to: a("conditioned space" as const),
    wall_type: a("wood stud" as const),
    area: q(area, "ft2", "gross wall area including openings; 17.5 ft wall height"),
    azimuth: q(azimuth, "degrees"),
    siding: a("brick veneer" as const),
    solar_absorptance: q(0.75, "fraction", "red brick"),
    emittance: q(0.9, "fraction"),
    insulation_assembly_r_value: q(12, "h-ft2-F/Btu", placeholderWallR),
  });
  const window = (id: string, wall_id: string, azimuth: number, area: number) => ({
    id,
    attached_to_wall: wall_id,
    area: q(area, "ft2"),
    azimuth: q(azimuth, "degrees"),
    ufactor: unknownQ("Btu/h-ft2-F"),
    shgc: unknownQ("fraction"),
    interior_shading: a("medium curtains" as const, "drapes typical"),
    interior_shading_summer_coverage: {
      value: 0.5,
      unit: "fraction" as const,
      state: "defaulted" as const,
      source: "ANSI/RESNET/ICC 301-2022 default summer coverage for curtains, as applied by OpenStudio-HPXML v1.12.0 (defaults.rb 1666 to 1671)",
      evidence: [] as string[],
    },
  });

  return {
    schema_version: "0.1.0",
    assessment_id: TWO_STORY_ASSESSMENT_ID,
    revision: 0,
    created_at: TWO_STORY_TIMESTAMP,
    updated_at: TWO_STORY_TIMESTAMP,
    workedge: {
      team_id: "we_team_fixture",
      project_id: "we_project_fixture_two_story",
      property_id: WE_PROPERTY,
    },
    building: {
      hpxml_version: "4.0",
      site: {
        azimuth_of_front_of_home: q(90, "degrees", "front faces east"),
        shielding_of_home: a("normal" as const, "production subdivision"),
        ...dfwSiteDefaults(),
      },
      building_construction: {
        year_built: { ...fromProperty(2010, "year_built"), unit: "year" as const },
        residential_facility_type: fromProperty("single-family detached" as const, "property_type"),
        number_of_conditioned_floors: q(2, "count"),
        number_of_conditioned_floors_above_grade: q(2, "count"),
        number_of_bedrooms: q(4, "count"),
        conditioned_floor_area: { ...fromProperty(2400, "sq_ft"), unit: "ft2" as const },
        average_ceiling_height: q(8.5, "ft", "9 ft first floor, 8 ft second"),
        conditioned_building_volume: q(20400, "ft3", "2,400 ft2 × 8.5 ft"),
      },
      climate_and_risk_zones: {
        iecc_climate_zone: a("3A" as const, "Dallas County is IECC climate zone 3A", "documented"),
        iecc_year: q(2021, "year", undefined, "documented"),
        weather_station: {
          id: "ws-dfw",
          name: a("Dallas Fort Worth Intl AP", undefined, "documented"),
          station_key: a("722590", "WMO id; weather library version is pinned on the run", "documented"),
        },
      },
      zones: [{ id: "zone-main", zone_type: a("conditioned" as const), spaces: [] }],
      enclosure: {
        air_infiltration: {
          id: "infil-1",
          house_pressure: q(50, "Pa"),
          air_leakage: unknownQ("ACH50", "didnt_inspect"),
        },
        attics: [{ id: "attic-1", attic_type: a("vented" as const, "soffit and ridge vents") }],
        foundations: [{ id: "found-1", foundation_type: a("slab-on-grade" as const) }],
        roofs: [
          {
            id: "roof-1",
            interior_adjacent_to: a("attic - vented" as const),
            area: q(1342, "ft2", "1,200 ft2 footprint at 6:12 pitch"),
            roof_type: a("asphalt or fiberglass shingles" as const),
            solar_absorptance: q(0.9, "fraction", "dark shingles"),
            emittance: q(0.9, "fraction"),
            pitch: q(6, "in:12"),
            radiant_barrier: a(false, "none visible in attic photo", "documented"),
            insulation_assembly_r_value: q(2.3, "h-ft2-F/Btu", "uninsulated roof deck; attic insulation is on the ceiling"),
          },
        ],
        walls: [wall("wall-n", 0, 680), wall("wall-e", 90, 510), wall("wall-s", 180, 680), wall("wall-w", 270, 510)],
        floors: [
          {
            id: "ceiling-2",
            exterior_adjacent_to: a("attic - vented" as const),
            interior_adjacent_to: a("conditioned space" as const),
            floor_or_ceiling: a("ceiling" as const),
            floor_type: a("wood frame" as const, "2x6 ceiling joists seen in the attic photo"),
            area: q(1200, "ft2"),
            insulation_assembly_r_value: q(32, "h-ft2-F/Btu", "PLACEHOLDER whole-assembly R for R-30 blown over 2x6 joists; MJ8.construction.assembly_r replaces it"),
          },
        ],
        slabs: [
          {
            id: "slab-1",
            interior_adjacent_to: a("conditioned space" as const),
            area: q(1200, "ft2"),
            thickness: q(4, "in"),
            exposed_perimeter: q(140, "ft", "30 × 40 footprint"),
            perimeter_insulation_r_value: q(0, "h-ft2-F/Btu", "no slab-edge insulation required by the 2000 IECC in CZ3; asserted, not unknown"),
            perimeter_insulation_depth: q(0, "ft"),
            under_slab_insulation_r_value: q(0, "h-ft2-F/Btu", "none; asserted, not unknown"),
            carpet_fraction: q(0.4, "fraction", "carpet upstairs, tile and wood downstairs"),
            carpet_r_value: q(2, "h-ft2-F/Btu"),
          },
        ],
        windows: [window("win-n", "wall-n", 0, 100), window("win-e", "wall-e", 90, 90), window("win-s", "wall-s", 180, 110), window("win-w", "wall-w", 270, 60)],
        doors: [
          { id: "door-front", attached_to_wall: "wall-e", area: q(24, "ft2"), azimuth: q(90, "degrees"), r_value: q(4.4, "h-ft2-F/Btu", "insulated steel door") },
          { id: "door-back", attached_to_wall: "wall-w", area: q(20, "ft2"), azimuth: q(270, "degrees"), r_value: q(4.4, "h-ft2-F/Btu", "insulated steel door") },
        ],
      },
      systems: {
        hvac: {
          heating_systems: [
            {
              id: "heat-1",
              heating_system_type: { value: "Furnace" as const, state: "documented" as const, source: "workedge:equipment:we_equip_fixture_ts_furnace", evidence: [] },
              heating_system_fuel: { value: "natural gas" as const, state: "documented" as const, source: "workedge:equipment:we_equip_fixture_ts_furnace", evidence: [] },
              heating_capacity: { value: 80000, unit: "Btu/h" as const, state: "documented" as const, source: "workedge:equipment:we_equip_fixture_ts_furnace.nameplate", evidence: [] },
              annual_heating_efficiency: { value: 0.8, unit: "AFUE" as const, state: "documented" as const, source: "workedge:equipment:we_equip_fixture_ts_furnace.nameplate", evidence: [] },
              fraction_heat_load_served: q(1, "fraction"),
              distribution_system: "dist-1",
              x_served_zone_ids: ["zone-main"],
            },
          ],
          cooling_systems: [
            {
              id: "cool-1",
              cooling_system_type: { value: "central air conditioner" as const, state: "documented" as const, source: "workedge:equipment:we_equip_fixture_ts_condenser", evidence: [] },
              cooling_system_fuel: a("electricity" as const),
              cooling_capacity: { value: 48000, unit: "Btu/h" as const, state: "documented" as const, source: "workedge:equipment:we_equip_fixture_ts_condenser.nameplate", evidence: [], note: "4-ton original equipment" },
              compressor_type: a("single stage" as const),
              annual_cooling_efficiency: { value: 13, unit: "SEER" as const, state: "documented" as const, source: "workedge:equipment:we_equip_fixture_ts_condenser.nameplate", evidence: [] },
              fraction_cool_load_served: q(1, "fraction"),
              distribution_system: "dist-1",
              x_served_zone_ids: ["zone-main"],
            },
          ],
          heat_pumps: [],
          hvac_control: { id: "ctrl-1", heating_setpoint: q(70, "F"), cooling_setpoint: q(75, "F") },
          hvac_distributions: [
            {
              id: "dist-1",
              distribution_system_type: a("AirDistribution" as const),
              air_distribution_type: a("regular velocity" as const),
              conditioned_floor_area_served: q(2400, "ft2"),
              number_of_return_registers: q(2, "count", "one return per floor"),
              duct_leakage_measurements: [
                { duct_type: a("supply" as const), value: { value: 160, unit: "cfm25" as const, state: "derived" as const, source: LEAKAGE_SOURCE, evidence: [] as string[] }, total_or_to_outside: a("to outside" as const) },
                { duct_type: a("return" as const), value: { value: 80, unit: "cfm25" as const, state: "derived" as const, source: LEAKAGE_SOURCE, evidence: [] as string[] }, total_or_to_outside: a("to outside" as const) },
              ],
              ducts: [
                { id: "duct-supply", duct_type: a("supply" as const), duct_insulation_r_value: unknownQ("h-ft2-F/Btu"), duct_location: a("attic - vented" as const), duct_fraction_area: q(1, "fraction") },
                { id: "duct-return", duct_type: a("return" as const), duct_insulation_r_value: unknownQ("h-ft2-F/Btu"), duct_location: a("attic - vented" as const), duct_fraction_area: q(1, "fraction") },
              ],
            },
          ],
          hvac_sizing_control: {
            heat_pump_sizing_methodology: a("ACCA" as const, "ADR-005: the policy is an explicit input; ACCA chosen for the reference run"),
            allow_increased_fixed_capacities: a(false, "ADR-005: no silent capacity increase"),
            manualj_inputs: {
              ...dfwManualJInputs(4),
            },
          },
        },
      },
    },
  };
}
