/**
 * MJ8.design_conditions (WTH-001, WTH-002; ADR-034).
 *
 * Outdoor design conditions come from the ASHRAE design-condition block in the TMY3 EPW
 * header of the pinned weather library (the oracle's source). Indoor conditions come from
 * the Assessment's HVAC control and sizing-control fields. Nothing here is defaulted: every
 * input is passed in by the caller, which is where the `defaulted` provenance lives.
 *
 * Structure follows OpenStudio-HPXML v1.12.0 `hvac_sizing.rb` lines 194 to 335 and
 * `weather.rb` lines 284 to 327.
 */
import { DAILY_RANGE_TEMP_ADJUST, groundConductivity } from "./coefficients.js";
import { EngineInputError } from "./errors.js";
import {
  airDensityLbPerFt3,
  enthalpyBtuPerLb,
  humidityRatioFromRh,
  humidityRatioFromWetBulb,
  standardPressurePsi,
  wetBulbFromHumidityRatio,
} from "./psychrometrics.js";
import { cToF, deltaCToDeltaF, humidityRatioToGrains, mToFt } from "./units.js";

export const MJ8_DESIGN_CONDITIONS = { id: "MJ8.design_conditions", version: "0.1.1" } as const;

export type DailyRangeClass = "low" | "medium" | "high";
export const DAILY_RANGE_INDEX: Readonly<Record<DailyRangeClass, 0 | 1 | 2>> = { low: 0, medium: 1, high: 2 };

/** Daily-range class from the cooling daily range (°F) (hvac_sizing.rb lines 321 to 329). */
export function dailyRangeClass(dailyRangeF: number): DailyRangeClass {
  if (dailyRangeF < 16) return "low";
  if (dailyRangeF > 25) return "high";
  return "medium";
}

/** The ASHRAE design block of an EPW header, in IP units, plus station identity. */
export interface EpwDesignHeader {
  stationName: string;
  state: string;
  wmo: string;
  latitude: number;
  longitude: number;
  timeZone: number;
  elevationFt: number;
  designConditionsTitle: string;
  heatingDb99F: number;
  coolingDb1F: number;
  coolingMcwb1F: number;
  dailyRangeF: number;
}

/**
 * Parse the first two lines of an EPW file (LOCATION and DESIGN CONDITIONS). Field order per
 * the EnergyPlus weather-file specification: after "Cooling," come month, daily range,
 * DB 0.4 %, MCWB 0.4 %, DB 1 %, MCWB 1 %, ...; after "Heating," come month, DB 99.6 %, DB 99 %.
 * The oracle reads DB 99 %, DB 1 %, MCWB 1 % and the daily range (weather.rb 293 to 308).
 */
export function parseEpwHeader(text: string): EpwDesignHeader {
  const lines = text.split(/\r?\n/);
  const loc = lines.find((l) => l.startsWith("LOCATION,"))?.split(",");
  const dc = lines.find((l) => l.startsWith("DESIGN CONDITIONS,"))?.split(",");
  if (!loc || !dc) throw new EngineInputError("missing_input", "EPW header needs LOCATION and DESIGN CONDITIONS lines", { method: MJ8_DESIGN_CONDITIONS.id });
  const heatingIdx = dc.indexOf("Heating");
  const coolingIdx = dc.indexOf("Cooling");
  if (Number(dc[1]) < 1 || heatingIdx < 0 || coolingIdx < 0) {
    throw new EngineInputError("missing_input", "EPW header has no ASHRAE design-condition block", { method: MJ8_DESIGN_CONDITIONS.id });
  }
  const num = (s: string | undefined, what: string): number => {
    const v = Number(s);
    if (s === undefined || s === "" || !Number.isFinite(v)) throw new EngineInputError("missing_input", `EPW design field ${what} is missing`, { method: MJ8_DESIGN_CONDITIONS.id });
    return v;
  };
  return {
    stationName: loc[1] ?? "",
    state: loc[2] ?? "",
    wmo: loc[5] ?? "",
    latitude: num(loc[6], "latitude"),
    longitude: num(loc[7], "longitude"),
    timeZone: num(loc[8], "time zone"),
    elevationFt: mToFt(num(loc[9], "elevation")),
    designConditionsTitle: dc[2] ?? "",
    heatingDb99F: cToF(num(dc[heatingIdx + 3], "heating DB 99%")),
    coolingDb1F: cToF(num(dc[coolingIdx + 5], "cooling DB 1%")),
    coolingMcwb1F: cToF(num(dc[coolingIdx + 6], "cooling MCWB 1%")),
    dailyRangeF: deltaCToDeltaF(num(dc[coolingIdx + 2], "cooling daily range")),
  };
}

export interface DesignConditionsInput {
  /** Outdoor, °F. From the EPW header unless the Assessment supplies ManualJ inputs. */
  heatingDesignTempF: number;
  coolingDesignTempF: number;
  dailyRange: DailyRangeClass;
  /** Needed to derive the outdoor humidity ratio when `humidityDifferenceGrains` is not given. */
  coolingMcwbF?: number;
  /**
   * The dry bulb the MCWB is coincident with (the station's 1 % cooling DB), °F. The outdoor
   * humidity ratio is a property of that pair, not of the design temperature the job uses, so a
   * moved cooling design temperature keeps the station's moisture (weather.rb 325,
   * defaults.rb 301 to 305). Defaults to `coolingDesignTempF`.
   */
  coolingMcwbDbF?: number;
  /** Indoor setpoints, °F. */
  heatingSetpointF: number;
  coolingSetpointF: number;
  /** Indoor relative humidity for cooling, fraction. */
  humiditySetpoint: number;
  /** Design grains difference (outdoor − indoor); derived from MCWB when absent. */
  humidityDifferenceGrains?: number;
  elevationFt: number;
  soilType?: string;
  moistureType?: string;
  groundConductivity?: number;
}

export interface DesignConditions {
  method: typeof MJ8_DESIGN_CONDITIONS;
  heatingDesignTempF: number;
  coolingDesignTempF: number;
  dailyRange: DailyRangeClass;
  dailyRangeIndex: 0 | 1 | 2;
  dailyRangeTempAdjustF: number;
  heatingSetpointF: number;
  coolingSetpointF: number;
  humiditySetpoint: number;
  /** Cooling temperature difference, °F, never negative. */
  ctd: number;
  /** Heating temperature difference, °F, never negative. */
  htd: number;
  /** Altitude correction factor (1 − 0.0000308 × elevation). */
  acf: number;
  pressurePsi: number;
  indoorHumidityRatio: number;
  outdoorHumidityRatio: number | null;
  /** Grains difference outdoor − indoor, rounded to 0.1 like the oracle's default. */
  designGrains: number;
  coolIndoorWetBulbF: number;
  coolOutdoorWetBulbF: number | null;
  coolIndoorEnthalpyBtuPerLb: number;
  indoorAirDensityLbPerFt3: number;
  groundConductivity: number;
  /** Which inputs the engine derived rather than received, for provenance (ENG-003). */
  derived: string[];
}

/** Round like the oracle writes `in.xml` (temperatures to 0.01 °F, grains to 0.1). */
const round2 = (x: number) => Math.round(x * 100) / 100;
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Design conditions from an EPW header plus indoor inputs; the ADR-034 path. */
export function designConditionsFromEpw(
  header: EpwDesignHeader,
  indoor: Pick<DesignConditionsInput, "heatingSetpointF" | "coolingSetpointF" | "humiditySetpoint" | "soilType" | "moistureType" | "groundConductivity">,
): DesignConditions {
  return designConditions({
    heatingDesignTempF: round2(header.heatingDb99F),
    coolingDesignTempF: round2(header.coolingDb1F),
    dailyRange: dailyRangeClass(header.dailyRangeF),
    coolingMcwbF: header.coolingMcwb1F,
    elevationFt: Math.round(header.elevationFt * 10) / 10,
    ...indoor,
  });
}

export function designConditions(input: DesignConditionsInput): DesignConditions {
  const m = MJ8_DESIGN_CONDITIONS.id;
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "number" && !Number.isFinite(v)) throw new EngineInputError("out_of_range", `${k} is not finite`, { method: m, path: k });
  }
  if (input.humiditySetpoint <= 0 || input.humiditySetpoint >= 1) {
    throw new EngineInputError("out_of_range", "humiditySetpoint must be a fraction in (0, 1)", { method: m, path: "humiditySetpoint" });
  }
  const derived: string[] = [];
  const dailyRangeIndex = DAILY_RANGE_INDEX[input.dailyRange];
  const ctd = Math.max(input.coolingDesignTempF - input.coolingSetpointF, 0);
  const htd = Math.max(input.heatingSetpointF - input.heatingDesignTempF, 0);
  const acf = 1.0 - 0.0000308 * input.elevationFt;
  const pressurePsi = standardPressurePsi(input.elevationFt);

  const indoorHumidityRatio = humidityRatioFromRh(input.coolingSetpointF, input.humiditySetpoint, pressurePsi);
  let outdoorHumidityRatio: number | null = null;
  let coolOutdoorWetBulbF: number | null = null;
  if (input.coolingMcwbF !== undefined) {
    outdoorHumidityRatio = humidityRatioFromWetBulb(input.coolingMcwbDbF ?? input.coolingDesignTempF, input.coolingMcwbF, pressurePsi);
    coolOutdoorWetBulbF = wetBulbFromHumidityRatio(input.coolingDesignTempF, outdoorHumidityRatio, pressurePsi);
  }
  let designGrains: number;
  if (input.humidityDifferenceGrains !== undefined) {
    designGrains = input.humidityDifferenceGrains;
  } else if (outdoorHumidityRatio !== null) {
    designGrains = round1(humidityRatioToGrains(outdoorHumidityRatio) - humidityRatioToGrains(indoorHumidityRatio));
    derived.push("designGrains");
  } else {
    throw new EngineInputError("missing_input", "need humidityDifferenceGrains or coolingMcwbF to set the design grains", { method: m, path: "humidityDifferenceGrains" });
  }

  const coolIndoorWetBulbF = wetBulbFromHumidityRatio(input.coolingSetpointF, indoorHumidityRatio, pressurePsi);
  const coolIndoorEnthalpyBtuPerLb = enthalpyBtuPerLb(input.coolingSetpointF, indoorHumidityRatio);
  const avgSetpoint = (input.coolingSetpointF + input.heatingSetpointF) / 2;
  const indoorAirDensityLbPerFt3 = airDensityLbPerFt3(pressurePsi, avgSetpoint);
  const gc = groundConductivity(input.soilType, input.moistureType, input.groundConductivity);
  if (input.groundConductivity === undefined) derived.push("groundConductivity");

  return {
    method: MJ8_DESIGN_CONDITIONS,
    heatingDesignTempF: input.heatingDesignTempF,
    coolingDesignTempF: input.coolingDesignTempF,
    dailyRange: input.dailyRange,
    dailyRangeIndex,
    dailyRangeTempAdjustF: DAILY_RANGE_TEMP_ADJUST[dailyRangeIndex],
    heatingSetpointF: input.heatingSetpointF,
    coolingSetpointF: input.coolingSetpointF,
    humiditySetpoint: input.humiditySetpoint,
    ctd,
    htd,
    acf,
    pressurePsi,
    indoorHumidityRatio,
    outdoorHumidityRatio,
    designGrains,
    coolIndoorWetBulbF,
    coolOutdoorWetBulbF,
    coolIndoorEnthalpyBtuPerLb,
    indoorAirDensityLbPerFt3,
    groundConductivity: gc,
    derived,
  };
}
