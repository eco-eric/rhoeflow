/**
 * Inputs both reference houses share, each tagged `defaulted` with the exact source it comes
 * from, so the engine never has to default anything (WO-02 §3 Track B; ADR-034).
 */
import type { Unit } from "@rhoeflow/schema";

const WEATHER = "weather: openstudio-hpxml-weather v1.12.0, station 722590 (Dallas Fort Worth Intl AP), EPW header design block 'Climate Design Data 2009 ASHRAE Handbook' (ADR-034)";
const ORACLE_DEFAULT = "OpenStudio-HPXML v1.12.0 default";

function d<T>(value: T, source: string, note?: string) {
  return { value, state: "defaulted" as const, source, evidence: [] as string[], ...(note ? { note } : {}) };
}
function dq<U extends Unit>(value: number, unit: U, source: string, note?: string) {
  return { value, unit, state: "defaulted" as const, source, evidence: [] as string[], ...(note ? { note } : {}) };
}

/** Site fields the engine requires for infiltration shielding and slab ground conductivity. */
export function dfwSiteDefaults() {
  return {
    site_type: d("suburban" as const, `${ORACLE_DEFAULT} SiteType (defaults.rb 817 to 820)`, "drives the Manual J infiltration shielding class with shielding_of_home"),
    soil_type: d("unknown" as const, `${ORACLE_DEFAULT} SoilType (unknown)`, "inspect or look up the NRCS soil survey to replace"),
    moisture_type: d("mixed" as const, `${ORACLE_DEFAULT} MoistureType (mixed)`),
  };
}

/** ManualJ design inputs from the pinned weather library and the oracle's internal-gain convention. */
export function dfwManualJInputs(bedrooms: number) {
  return {
    heating_design_temperature: dq(25.88, "F", `${WEATHER}: heating 99 % dry bulb -3.4 °C`),
    cooling_design_temperature: dq(98.42, "F", `${WEATHER}: cooling 1 % dry bulb 36.9 °C`),
    daily_temperature_range: d("medium" as const, `${WEATHER}: cooling daily range 11.0 °C = 19.8 °F, class medium (16 to 25 °F)`),
    humidity_setpoint: dq(0.5, "fraction", `${ORACLE_DEFAULT} ManualJ HumiditySetpoint for a humid climate (IECC 3A)`),
    internal_loads_sensible: dq(2400, "Btu/h", `${ORACLE_DEFAULT} ManualJ InternalLoadsSensible, one refrigerator (defaults.rb 309 to 313)`),
    internal_loads_latent: dq(0, "Btu/h", `${ORACLE_DEFAULT} ManualJ InternalLoadsLatent`),
    number_of_occupants: dq(bedrooms + 1, "count", `${ORACLE_DEFAULT} ManualJ NumberofOccupants = bedrooms + 1`),
  };
}

export const DFW_WEATHER_REF = { library: "openstudio-hpxml-weather", version: "v1.12.0", station_key: "722590" } as const;
