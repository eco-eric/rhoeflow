/**
 * MJ8.glazing and MJ8.aed: window heating (U × HTD) and cooling (solar through peak solar
 * factor × cooling load factor × SHGC × interior shading, plus conduction at the hourly
 * adjusted CTD), the hourly aggregate fenestration load for 8:00 to 19:00, and the adequate
 * exposure diversity excursion. Overhang shading uses shade-line multipliers.
 *
 * Structure follows OpenStudio-HPXML v1.12.0 `hvac_sizing.rb` 612 to 985 and the interior
 * shading coefficient lookup 4996 to 5116. Tables in coefficients.ts.
 *
 * Supported in 0.1.0: vertical windows with curtains, blinds or shades at a known summer
 * coverage, optional overhangs. Not supported (throws `unsupported`): skylights, storm
 * windows, insect screens, exterior solar screens and films, blind open/half-open states.
 */
import {
  AED_EXCURSION_LIMIT,
  CLF_AVG_NO_SHADE,
  CLF_AVG_SHADE,
  CLF_HOURLY_NO_SHADE,
  CLF_HOURLY_SHADE,
  HOURLY_TEMP_ADJUST,
  INTERIOR_SHADING_COEFFICIENTS,
  INTERIOR_SHADING_COLUMNS,
  NORTH_INDEX,
  PSF,
  PSF_LATITUDES,
  SHGC_REFERENCE,
  SLM_AVG,
  SLM_AVG_LATITUDES,
  SLM_HOURLY,
  SLM_HOURLY_LATITUDES,
  type InteriorShadingDevice,
} from "./coefficients.js";
import type { DesignConditions } from "./design-conditions.js";
import { EngineInputError } from "./errors.js";

export const MJ8_GLAZING = { id: "MJ8.glazing", version: "0.1.0" } as const;
export const MJ8_AED = { id: "MJ8.aed", version: "0.1.0" } as const;
const M = MJ8_GLAZING.id;

/** Hours in the aggregate fenestration load: 8:00 to 19:00. */
export const AFL_HOURS = 12;

/** Linear interpolation with end-segment extrapolation, as the oracle's neighbor-index lookup does (math.rb 13 to 15, 161 to 173). */
export function interpolateByLatitude(latitudes: readonly number[], values: readonly number[], latitude: number): number {
  let i1 = latitudes.findIndex((l) => l >= latitude);
  let i0: number;
  if (i1 < 0) {
    i0 = latitudes.length - 2;
    i1 = latitudes.length - 1;
  } else if (i1 === 0) {
    i0 = 0;
    i1 = 1;
  } else {
    i0 = i1 - 1;
  }
  const x0 = latitudes[i0]!, x1 = latitudes[i1]!, f0 = values[i0]!, f1 = values[i1]!;
  return f0 + ((latitude - x0) / (x1 - x0)) * (f1 - f0);
}

/** Orientation table index from a compass azimuth (0 = north, clockwise): S=0, SW=1, W=2, NW=3, N=4, NE=5, E=6, SE=7 (hvac_sizing.rb 4242 to 4248, 730). */
export function orientationIndex(azimuthDeg: number): number {
  let mj = azimuthDeg - 180;
  if (mj < 0) mj += 360;
  return Math.round(mj / 45) % 9;
}

/** Manual J window type from U-factor and SHGC when layers and glass type are unknown (lines 5000 to 5027). */
export function windowTypeFromRatings(ufactor: number, shgc: number): string {
  if (ufactor >= 0.85) {
    if (shgc >= (0.74 + 0.5) / 2) return "1P Clear";
    if (shgc >= (0.5 + 0.44) / 2) return "1P Heat Absorbing";
    return "1P Reflective";
  }
  if (ufactor >= 0.3) {
    if (shgc >= (0.64 + 0.55) / 2) return "2P Clear";
    if (shgc >= (0.55 + 0.48) / 2) return "2P Low-e Option 1";
    if (shgc >= (0.48 + 0.43) / 2) return "2P Low-e Option 2";
    if (shgc >= (0.43 + 0.33) / 2) return "2P Heat Absorbing";
    return "2P Low-e Option 3";
  }
  if (shgc >= (0.59 + 0.3) / 2) return "3P Clear";
  return "3P Heat Absorbing";
}

/**
 * Interior shading coefficient: table value for the window type and device, blended with the
 * uncovered fraction, rounded to 3 places (lines 5064 to 5115). `none` returns 1.0.
 */
export function interiorShadingCoefficient(ufactor: number, shgc: number, device: InteriorShadingDevice | "none", summerCoverage: number): number {
  if (device === "none") return 1.0;
  if (!(summerCoverage >= 0 && summerCoverage <= 1)) throw new EngineInputError("out_of_range", "summer coverage must be a fraction", { method: M });
  const col = INTERIOR_SHADING_COLUMNS.indexOf(device);
  const row = INTERIOR_SHADING_COEFFICIENTS[windowTypeFromRatings(ufactor, shgc)]!;
  const isc = summerCoverage * row[col]! + (1 - summerCoverage) * 1.0;
  return Math.round(isc * 1000) / 1000;
}

export interface OverhangInput {
  depthFt: number;
  distanceToTopOfWindowFt: number;
  distanceToBottomOfWindowFt: number;
}

export interface WindowInput {
  area: number;
  azimuthDeg: number;
  ufactor: number;
  shgc: number;
  interiorShading: InteriorShadingDevice | "none";
  /** Fraction of the summer the device covers the window; the oracle defaults curtains and shades to 0.5, blinds to 1.0. */
  interiorShadingSummerCoverage: number;
  overhang?: OverhangInput;
}

export interface WindowLoad {
  heatingHtm: number;
  coolingHtm: number;
  heatingLoad: number;
  coolingSensibleLoad: number;
  /** Aggregate fenestration load for 8:00 to 19:00, for the AED check. */
  hourlyCoolingLoads: number[];
  interiorShadingCoefficient: number;
  orientation: number;
}

export function windowLoad(w: WindowInput, latitude: number, dc: DesignConditions): WindowLoad {
  if (!(w.area >= 0) || !(w.ufactor > 0) || !(w.shgc >= 0 && w.shgc <= 1)) {
    throw new EngineInputError("out_of_range", "window needs area ≥ 0, U > 0 and SHGC in [0, 1]", { method: M });
  }
  const cnt = orientationIndex(w.azimuthDeg);
  const isc = interiorShadingCoefficient(w.ufactor, w.shgc, w.interiorShading, w.interiorShadingSummerCoverage);
  const shaded = isc < 1;
  const psfD = interpolateByLatitude(PSF_LATITUDES, PSF[cnt]!, latitude);
  const psfN = interpolateByLatitude(PSF_LATITUDES, PSF[NORTH_INDEX]!, latitude);
  const slmAvg = interpolateByLatitude(SLM_AVG_LATITUDES, SLM_AVG[cnt]!, latitude);
  const slmHourly = [0, 1, 2, 3].map((j) => interpolateByLatitude(SLM_HOURLY_LATITUDES, SLM_HOURLY[cnt]!.map((lat) => lat[j]!), latitude));

  const heatingHtm = w.ufactor * dc.htd;

  const htmFor = (hr: number | null): number => {
    const clfD = hr === null ? (shaded ? CLF_AVG_SHADE[cnt]! : CLF_AVG_NO_SHADE[cnt]!) : shaded ? CLF_HOURLY_SHADE[cnt]![hr]! : CLF_HOURLY_NO_SHADE[cnt]![hr]!;
    const clfN = hr === null ? (shaded ? CLF_AVG_SHADE[NORTH_INDEX] : CLF_AVG_NO_SHADE[NORTH_INDEX]) : shaded ? CLF_HOURLY_SHADE[NORTH_INDEX]![hr]! : CLF_HOURLY_NO_SHADE[NORTH_INDEX]![hr]!;
    const ctdAdj = dc.ctd + (hr === null ? 0 : HOURLY_TEMP_ADJUST[dc.dailyRangeIndex]![hr]!);
    const htmD = (psfD * clfD * w.shgc * isc) / SHGC_REFERENCE + w.ufactor * ctdAdj;
    const htmN = (psfN * clfN * w.shgc * isc) / SHGC_REFERENCE + w.ufactor * ctdAdj;
    if (!w.overhang || w.overhang.depthFt <= 0) return htmD;
    const slm = hr === null ? slmAvg : slmHourly[hr <= 2 ? 0 : hr <= 5 ? 1 : hr <= 8 ? 2 : 3]!;
    const zSl = slm * w.overhang.depthFt;
    const height = w.overhang.distanceToBottomOfWindowFt - w.overhang.distanceToTopOfWindowFt;
    if (zSl < w.overhang.distanceToTopOfWindowFt) return htmD;
    if (zSl < w.overhang.distanceToBottomOfWindowFt) {
      const pct = (zSl - w.overhang.distanceToTopOfWindowFt) / height;
      return pct * htmN + (1 - pct) * htmD;
    }
    return htmN;
  };

  const coolingHtm = htmFor(null);
  const hourlyCoolingLoads = Array.from({ length: AFL_HOURS }, (_, hr) => htmFor(hr) * w.area);
  return {
    heatingHtm,
    coolingHtm,
    heatingLoad: heatingHtm * w.area,
    coolingSensibleLoad: coolingHtm * w.area,
    hourlyCoolingLoads,
    interiorShadingCoefficient: isc,
    orientation: cnt,
  };
}

/** Sum hourly fenestration loads of many windows. */
export function sumHourly(loads: ReadonlyArray<readonly number[]>): number[] {
  const out = new Array<number>(AFL_HOURS).fill(0);
  for (const l of loads) for (let i = 0; i < AFL_HOURS; i++) out[i]! += l[i] ?? 0;
  return out;
}

/** AED excursion: peak hourly fenestration load above 1.3 × daily average, never negative (lines 966 to 979). */
export function aedExcursion(hourlyFenestrationLoads: readonly number[]): number {
  if (hourlyFenestrationLoads.length === 0) return 0;
  const dal = hourlyFenestrationLoads.reduce((s, x) => s + x, 0) / hourlyFenestrationLoads.length;
  const pfl = Math.max(...hourlyFenestrationLoads);
  return Math.max(0, pfl - AED_EXCURSION_LIMIT * dal);
}
