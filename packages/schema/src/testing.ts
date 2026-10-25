/**
 * Test helpers and a minimal valid Assessment. Exported under `@rhoeflow/schema/testing`
 * so other packages' tests do not re-type a whole house. These values are illustrative
 * (labeled fixtures, GOV-002) and must never seed a real Assessment.
 */
import type { AssessmentInput } from "./assessment.js";
import type { KnownState, UnknownReason } from "./provenance.js";
import type { Unit } from "./units.js";

export const FIXTURE_SOURCE = "fixture: @rhoeflow/schema/testing (illustrative, not a real house)";

export function known<T>(value: T, source: string = FIXTURE_SOURCE, state: KnownState = "documented") {
  return { value, state, source, evidence: [] as string[] };
}

export function qty<U extends Unit>(value: number, unit: U, source: string = FIXTURE_SOURCE, state: KnownState = "documented") {
  return { value, unit, state, source, evidence: [] as string[] };
}

export function unknownQty<U extends Unit>(unit: U, reason: UnknownReason = "didnt_inspect") {
  return { value: null, unit, state: "unknown" as const, reason, evidence: [] as string[] };
}

export function unknownField(reason: UnknownReason = "didnt_inspect") {
  return { value: null, state: "unknown" as const, reason, evidence: [] as string[] };
}

export const FIXTURE_ASSESSMENT_ID = "0f1e2d3c-4b5a-4968-8777-66554433aa11";
export const FIXTURE_TIMESTAMP = "2026-10-24T12:00:00-05:00";

/** A one-zone, one-wall, slab-on-grade box with a furnace and an AC. Valid; not realistic. */
export function minimalAssessment(): AssessmentInput {
  return {
    schema_version: "0.1.0",
    assessment_id: FIXTURE_ASSESSMENT_ID,
    revision: 0,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    workedge: {
      team_id: "we_team_fixture",
      project_id: "we_project_fixture",
      property_id: "we_property_fixture",
    },
    building: {
      hpxml_version: "4.0",
      site: {
        azimuth_of_front_of_home: qty(180, "degrees"),
        shielding_of_home: known("normal"),
      },
      building_construction: {
        year_built: qty(1965, "year"),
        residential_facility_type: known("single-family detached"),
        number_of_conditioned_floors: qty(1, "count"),
        number_of_conditioned_floors_above_grade: qty(1, "count"),
        number_of_bedrooms: qty(3, "count"),
        conditioned_floor_area: qty(1500, "ft2"),
        average_ceiling_height: qty(8, "ft"),
      },
      climate_and_risk_zones: {
        iecc_climate_zone: known("3A"),
        iecc_year: qty(2021, "year"),
        weather_station: {
          id: "ws-dfw",
          name: known("Dallas Fort Worth Intl AP"),
          station_key: known("722590"),
        },
      },
      zones: [{ id: "zone-conditioned", zone_type: known("conditioned"), spaces: [] }],
      enclosure: {
        air_infiltration: {
          id: "infil-1",
          house_pressure: qty(50, "Pa"),
          air_leakage: qty(10, "ACH50", FIXTURE_SOURCE, "assumed"),
        },
        attics: [{ id: "attic-1", attic_type: known("vented") }],
        foundations: [{ id: "found-1", foundation_type: known("slab-on-grade") }],
        roofs: [
          {
            id: "roof-1",
            interior_adjacent_to: known("attic - vented"),
            area: qty(1600, "ft2"),
            roof_type: known("asphalt or fiberglass shingles"),
            solar_absorptance: qty(0.9, "fraction"),
            emittance: qty(0.9, "fraction"),
            pitch: qty(5, "in:12"),
            radiant_barrier: known(false),
            insulation_assembly_r_value: qty(2.3, "h-ft2-F/Btu"),
          },
        ],
        walls: [
          {
            id: "wall-1",
            exterior_adjacent_to: known("outside"),
            interior_adjacent_to: known("conditioned space"),
            wall_type: known("wood stud"),
            area: qty(1240, "ft2"),
            azimuth: qty(180, "degrees"),
            siding: known("brick veneer"),
            solar_absorptance: qty(0.7, "fraction"),
            emittance: qty(0.9, "fraction"),
            insulation_assembly_r_value: qty(4, "h-ft2-F/Btu"),
          },
        ],
        floors: [
          {
            id: "ceiling-1",
            exterior_adjacent_to: known("attic - vented"),
            interior_adjacent_to: known("conditioned space"),
            floor_or_ceiling: known("ceiling"),
            area: qty(1500, "ft2"),
            insulation_assembly_r_value: qty(12, "h-ft2-F/Btu"),
          },
        ],
        slabs: [
          {
            id: "slab-1",
            interior_adjacent_to: known("conditioned space"),
            area: qty(1500, "ft2"),
            thickness: qty(4, "in"),
            exposed_perimeter: qty(160, "ft"),
            perimeter_insulation_r_value: qty(0, "h-ft2-F/Btu"),
            perimeter_insulation_depth: qty(0, "ft"),
            under_slab_insulation_r_value: qty(0, "h-ft2-F/Btu"),
            carpet_fraction: qty(0.5, "fraction"),
            carpet_r_value: qty(2, "h-ft2-F/Btu"),
          },
        ],
        windows: [
          {
            id: "win-1",
            attached_to_wall: "wall-1",
            area: qty(180, "ft2"),
            azimuth: qty(180, "degrees"),
            ufactor: qty(1.0, "Btu/h-ft2-F"),
            shgc: qty(0.8, "fraction"),
          },
        ],
        doors: [
          {
            id: "door-1",
            attached_to_wall: "wall-1",
            area: qty(40, "ft2"),
            azimuth: qty(180, "degrees"),
            r_value: qty(3, "h-ft2-F/Btu"),
          },
        ],
      },
      systems: {
        hvac: {
          heating_systems: [
            {
              id: "heat-1",
              heating_system_type: known("Furnace"),
              heating_system_fuel: known("natural gas"),
              heating_capacity: qty(60000, "Btu/h"),
              annual_heating_efficiency: qty(0.8, "AFUE"),
              fraction_heat_load_served: qty(1, "fraction"),
              distribution_system: "dist-1",
              x_served_zone_ids: ["zone-conditioned"],
            },
          ],
          cooling_systems: [
            {
              id: "cool-1",
              cooling_system_type: known("central air conditioner"),
              cooling_system_fuel: known("electricity"),
              cooling_capacity: qty(36000, "Btu/h"),
              compressor_type: known("single stage"),
              annual_cooling_efficiency: qty(10, "SEER"),
              fraction_cool_load_served: qty(1, "fraction"),
              distribution_system: "dist-1",
              x_served_zone_ids: ["zone-conditioned"],
            },
          ],
          heat_pumps: [],
          hvac_control: {
            id: "ctrl-1",
            heating_setpoint: qty(70, "F"),
            cooling_setpoint: qty(75, "F"),
          },
          hvac_distributions: [
            {
              id: "dist-1",
              distribution_system_type: known("AirDistribution"),
              air_distribution_type: known("regular velocity"),
              duct_leakage_measurements: [
                {
                  duct_type: known("supply"),
                  units: known("CFM25"),
                  value: qty(150, "cfm25", FIXTURE_SOURCE, "assumed"),
                  total_or_to_outside: known("to outside"),
                },
                {
                  duct_type: known("return"),
                  units: known("CFM25"),
                  value: qty(75, "cfm25", FIXTURE_SOURCE, "assumed"),
                  total_or_to_outside: known("to outside"),
                },
              ],
              ducts: [
                {
                  id: "duct-supply-1",
                  duct_type: known("supply"),
                  duct_insulation_r_value: qty(4, "h-ft2-F/Btu"),
                  duct_location: known("attic - vented"),
                  duct_fraction_area: qty(1, "fraction"),
                },
                {
                  id: "duct-return-1",
                  duct_type: known("return"),
                  duct_insulation_r_value: qty(4, "h-ft2-F/Btu"),
                  duct_location: known("attic - vented"),
                  duct_fraction_area: qty(1, "fraction"),
                },
              ],
            },
          ],
          hvac_sizing_control: {
            heat_pump_sizing_methodology: known("ACCA", "ADR-005: sizing policy is an explicit input; fixture picks ACCA", "assumed"),
            allow_increased_fixed_capacities: known(false, "ADR-005: no silent capacity increase", "assumed"),
            manualj_inputs: {
              heating_design_temperature: qty(22, "F", "fixture placeholder; real values come from the weather library", "assumed"),
              cooling_design_temperature: qty(100, "F", "fixture placeholder; real values come from the weather library", "assumed"),
              daily_temperature_range: known("medium", "fixture placeholder", "assumed"),
              humidity_setpoint: qty(0.5, "fraction", "fixture placeholder", "assumed"),
              internal_loads_sensible: qty(2400, "Btu/h", "fixture placeholder", "assumed"),
              internal_loads_latent: qty(0, "Btu/h", "fixture placeholder", "assumed"),
              number_of_occupants: qty(4, "count", "fixture placeholder", "assumed"),
            },
          },
        },
      },
    },
  };
}
