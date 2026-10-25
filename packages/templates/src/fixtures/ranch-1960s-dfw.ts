/**
 * The 1960s DFW ranch reference house (WO-01 definition of done; Track A reference house 1).
 *
 * ILLUSTRATIVE FIXTURE, not a real property (GOV-002). Geometry and equipment are plausible
 * for a 1964 brick-veneer slab ranch and are entered as `assumed` with this file as the
 * source. Fields an era template seeds (insulation, windows, air leakage, ducts) start
 * `unknown` so `applyTemplate(..., dfw-pre1980-ranch-slab)` fills them as `defaulted`.
 * Whole-assembly R-values are placeholders until the nominal-to-assembly method (WO-02).
 */
import type { AssessmentInput, KnownState, Unit, UnknownReason } from "@rhoeflow/schema";
import { dfwManualJInputs, dfwSiteDefaults } from "./common.js";

const SRC = "fixture: @rhoeflow/templates ranch-1960s-dfw (illustrative reference house, not a real property)";
const WE_PROPERTY = "we_property_fixture_ranch";

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

export const RANCH_ASSESSMENT_ID = "6b1c6c2e-9d4f-4d1a-9a4e-0c1f2e3d4c5b";
export const RANCH_TIMESTAMP = "2026-10-24T09:00:00-05:00";

export function ranchBaseAssessment(): AssessmentInput {
  const wall = (id: string, azimuth: number, area: number) => ({
    id,
    exterior_adjacent_to: a("outside" as const),
    interior_adjacent_to: a("conditioned space" as const),
    wall_type: a("wood stud" as const),
    area: q(area, "ft2", "gross wall area including openings, 40 ft x 8 ft"),
    azimuth: q(azimuth, "degrees"),
    siding: a("brick veneer" as const),
    solar_absorptance: q(0.75, "fraction", "red brick"),
    emittance: q(0.9, "fraction"),
    insulation_assembly_r_value: q(4, "h-ft2-F/Btu", "PLACEHOLDER whole-assembly R for an uninsulated 2x4 brick-veneer wall; derive from nominal layers in WO-02 (MJ8 construction tables)"),
  });
  const window = (id: string, wall_id: string, azimuth: number, area: number) => ({
    id,
    attached_to_wall: wall_id,
    area: q(area, "ft2"),
    azimuth: q(azimuth, "degrees"),
    ufactor: unknownQ("Btu/h-ft2-F"),
    shgc: unknownQ("fraction"),
    interior_shading: a("medium curtains" as const, "drapes typical"),
    interior_shading_summer_coverage: { value: 0.5, unit: "fraction" as const, state: "defaulted" as const, source: "ANSI/RESNET/ICC 301-2022 default summer coverage for curtains, as applied by OpenStudio-HPXML v1.12.0 (defaults.rb 1666 to 1671)", evidence: [] as string[] },
  });

  return {
    schema_version: "0.1.0",
    assessment_id: RANCH_ASSESSMENT_ID,
    revision: 0,
    created_at: RANCH_TIMESTAMP,
    updated_at: RANCH_TIMESTAMP,
    workedge: {
      team_id: "we_team_fixture",
      project_id: "we_project_fixture_ranch",
      property_id: WE_PROPERTY,
    },
    building: {
      hpxml_version: "4.0",
      site: {
        azimuth_of_front_of_home: q(180, "degrees", "front faces south"),
        shielding_of_home: a("normal" as const, "established neighborhood, mature trees"),
        ...dfwSiteDefaults(),
      },
      building_construction: {
        year_built: { ...fromProperty(1964, "year_built"), unit: "year" as const },
        residential_facility_type: fromProperty("single-family detached" as const, "property_type"),
        number_of_conditioned_floors: q(1, "count"),
        number_of_conditioned_floors_above_grade: q(1, "count"),
        number_of_bedrooms: q(3, "count"),
        conditioned_floor_area: { ...fromProperty(1600, "sq_ft"), unit: "ft2" as const },
        average_ceiling_height: q(8, "ft"),
        conditioned_building_volume: q(12800, "ft3", "1600 ft2 x 8 ft"),
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
            area: q(1690, "ft2", "1600 ft2 footprint at 4:12 pitch"),
            roof_type: a("asphalt or fiberglass shingles" as const),
            solar_absorptance: q(0.9, "fraction", "dark shingles"),
            emittance: q(0.9, "fraction"),
            pitch: q(4, "in:12"),
            radiant_barrier: a(false, "none visible in attic photo", "documented"),
            insulation_assembly_r_value: q(2.3, "h-ft2-F/Btu", "uninsulated roof deck; attic insulation is on the ceiling"),
          },
        ],
        walls: [wall("wall-n", 0, 320), wall("wall-e", 90, 320), wall("wall-s", 180, 320), wall("wall-w", 270, 320)],
        floors: [
          {
            id: "ceiling-1",
            exterior_adjacent_to: a("attic - vented" as const),
            interior_adjacent_to: a("conditioned space" as const),
            floor_or_ceiling: a("ceiling" as const),
            floor_type: a("wood frame" as const, "2x6 ceiling joists seen in the attic photo"),
            area: q(1600, "ft2"),
            insulation_assembly_r_value: q(12, "h-ft2-F/Btu", "PLACEHOLDER whole-assembly R; derive from nominal cavity R in WO-02"),
          },
        ],
        slabs: [
          {
            id: "slab-1",
            interior_adjacent_to: a("conditioned space" as const),
            area: q(1600, "ft2"),
            thickness: q(4, "in"),
            exposed_perimeter: q(160, "ft", "40 x 40 footprint"),
            perimeter_insulation_r_value: q(0, "h-ft2-F/Btu", "no slab-edge insulation in 1960s DFW slabs; asserted, not unknown"),
            perimeter_insulation_depth: q(0, "ft"),
            under_slab_insulation_r_value: q(0, "h-ft2-F/Btu", "none; asserted, not unknown"),
            carpet_fraction: q(0.6, "fraction", "carpet in bedrooms and living, tile elsewhere"),
            carpet_r_value: q(2, "h-ft2-F/Btu"),
          },
        ],
        windows: [
          window("win-n", "wall-n", 0, 50),
          window("win-e", "wall-e", 90, 30),
          window("win-s", "wall-s", 180, 60),
          window("win-w", "wall-w", 270, 30),
        ],
        doors: [
          { id: "door-front", attached_to_wall: "wall-s", area: q(20, "ft2"), azimuth: q(180, "degrees"), r_value: q(3, "h-ft2-F/Btu", "solid wood door") },
          { id: "door-back", attached_to_wall: "wall-n", area: q(20, "ft2"), azimuth: q(0, "degrees"), r_value: q(2, "h-ft2-F/Btu", "half-lite steel door") },
        ],
      },
      systems: {
        hvac: {
          heating_systems: [
            {
              id: "heat-1",
              heating_system_type: { value: "Furnace" as const, state: "documented" as const, source: "workedge:equipment:we_equip_fixture_furnace", evidence: [] },
              heating_system_fuel: { value: "natural gas" as const, state: "documented" as const, source: "workedge:equipment:we_equip_fixture_furnace", evidence: [] },
              heating_capacity: { value: 60000, unit: "Btu/h" as const, state: "documented" as const, source: "workedge:equipment:we_equip_fixture_furnace.nameplate", evidence: [] },
              annual_heating_efficiency: { value: 0.8, unit: "AFUE" as const, state: "documented" as const, source: "workedge:equipment:we_equip_fixture_furnace.nameplate", evidence: [] },
              fraction_heat_load_served: q(1, "fraction"),
              distribution_system: "dist-1",
              x_served_zone_ids: ["zone-main"],
            },
          ],
          cooling_systems: [
            {
              id: "cool-1",
              cooling_system_type: { value: "central air conditioner" as const, state: "documented" as const, source: "workedge:equipment:we_equip_fixture_condenser", evidence: [] },
              cooling_system_fuel: a("electricity" as const),
              cooling_capacity: { value: 36000, unit: "Btu/h" as const, state: "documented" as const, source: "workedge:equipment:we_equip_fixture_condenser.nameplate", evidence: [], note: "3-ton nominal, 1998 replacement" },
              compressor_type: a("single stage" as const),
              annual_cooling_efficiency: { value: 10, unit: "SEER" as const, state: "documented" as const, source: "workedge:equipment:we_equip_fixture_condenser.nameplate", evidence: [] },
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
              conditioned_floor_area_served: q(1600, "ft2"),
              number_of_return_registers: q(1, "count", "single central return in hall"),
              duct_leakage_measurements: [
                { duct_type: a("supply" as const), value: unknownQ("fraction"), total_or_to_outside: a("to outside" as const) },
                { duct_type: a("return" as const), value: unknownQ("fraction"), total_or_to_outside: a("to outside" as const) },
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
              ...dfwManualJInputs(3),
            },
          },
        },
      },
    },
  };
}
