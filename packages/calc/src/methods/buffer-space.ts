/**
 * MJ8.buffer_space: design temperatures of unconditioned spaces next to the house (garages and
 * crawlspaces) and the partition loads of the surfaces between them and conditioned space
 * (WO-03 B1).
 *
 * Structure follows OpenStudio-HPXML v1.12.0 `hvac_sizing.rb`: garage design temperatures 365
 * to 371 and 522 to 537, garage fraction under conditioned space 558 to 581, floors over a
 * crawlspace 1274 to 1350, space design temperature by UA balance 4257 to 4440, foundation-wall
 * U-factors 4813 to 4912, crawlspace duct regain 1777 to 1820. Constants live in
 * coefficients.ts with their line ranges.
 *
 * Supported in 0.2.0: an above-grade garage (no foundation walls into it), vented and unvented
 * crawlspaces with foundation walls given by whole-assembly R. Not supported: below-grade
 * garages, unconditioned basements, foundation-wall insulation given layer by layer.
 */
import {
  AIR_CP_BTU_PER_LB_F,
  AIR_FILM_OUTSIDE_R,
  CRAWLSPACE_DEFAULT_HEIGHT_FT,
  CRAWLSPACE_DUCT_REGAIN,
  CRAWLSPACE_INSULATED_R_THRESHOLD,
  CRAWLSPACE_PTD,
  FOUNDATION_WALL_MIN_BELOW_GRADE_FT,
  GARAGE_DESIGN_TEMP,
  UNVENTED_SPACE_ACH,
} from "./coefficients.js";
import type { DesignConditions } from "./design-conditions.js";
import type { Htm } from "./envelope.js";
import { EngineInputError } from "./errors.js";
import { airDensityLbPerFt3 } from "./psychrometrics.js";
import { uFromR } from "./units.js";

export const MJ8_BUFFER_SPACE = { id: "MJ8.buffer_space", version: "0.1.0" } as const;
const M = MJ8_BUFFER_SPACE.id;

export interface BufferTemps {
  heatF: number;
  coolF: number;
}

export type CrawlspaceLocation = "crawlspace - vented" | "crawlspace - unvented";

// ---------------------------------------------------------------------------------------
// Garages

/**
 * Fraction of an above-grade garage that sits under conditioned space: the area of floors
 * between conditioned space and the garage over the area of every roof and floor that bounds
 * the garage. With nothing to weigh, the oracle uses one half.
 */
export function garageFractionUnderConditioned(roofAreas: readonly number[], floors: ReadonlyArray<{ area: number; boundsConditioned: boolean }>): number {
  let total = 0;
  let conditioned = 0;
  for (const a of roofAreas) total += a;
  for (const f of floors) {
    total += f.area;
    if (f.boundsConditioned) conditioned += f.area;
  }
  if (total === 0) return GARAGE_DESIGN_TEMP.fracWhenNoArea;
  return conditioned / total;
}

export function garageDesignTemps(fractionUnderConditioned: number, dc: DesignConditions): BufferTemps {
  const f = fractionUnderConditioned;
  if (!(f >= 0 && f <= 1)) throw new EngineInputError("out_of_range", `garage fraction under conditioned space must be in [0, 1], got ${f}`, { method: M });
  const i = dc.dailyRangeIndex;
  return {
    heatF: dc.heatingDesignTempF + GARAGE_DESIGN_TEMP.heatPerFracUnderConditioned * f,
    coolF: dc.coolingDesignTempF + GARAGE_DESIGN_TEMP.coolUnder[i]! * f + GARAGE_DESIGN_TEMP.coolOpen[i]! * (1 - f),
  };
}

// ---------------------------------------------------------------------------------------
// Foundation walls

export interface FoundationWallInput {
  areaFt2: number;
  heightFt: number;
  depthBelowGradeFt: number;
  assemblyR: number;
}

export function foundationWallBelowGradeArea(w: FoundationWallInput): number {
  return w.heightFt > 0 ? (w.areaFt2 * w.depthBelowGradeFt) / w.heightFt : 0;
}

export function foundationWallAboveGradeArea(w: FoundationWallInput): number {
  return w.areaFt2 - foundationWallBelowGradeArea(w);
}

/** Above-grade U-factor from a whole-assembly R (lines 4813 to 4817). */
export function foundationWallAboveGradeU(w: FoundationWallInput): number {
  return uFromR(w.assemblyR);
}

/**
 * Below-grade U-factor without soil, from a whole-assembly R (lines 4858 to 4911 with no
 * insulation layers): every 1 ft bin has R − R(outside air film), so the bins average to that.
 */
export function foundationWallBelowGradeU(w: FoundationWallInput): number {
  const r = w.assemblyR - AIR_FILM_OUTSIDE_R;
  return uFromR(r);
}

// ---------------------------------------------------------------------------------------
// Floors over crawlspaces

export interface CrawlspaceBoundary {
  foundationWalls: readonly FoundationWallInput[];
  /** Above-grade walls between the crawlspace and outside, net area and assembly R. */
  walls: ReadonlyArray<{ netAreaFt2: number; assemblyR: number }>;
}

/** Area-weighted U of the walls that enclose the crawlspace (lines 1287 to 1314). */
export function crawlspaceWallU(b: CrawlspaceBoundary): number {
  let a = 0;
  let ua = 0;
  for (const fw of b.foundationWalls) {
    const bg = foundationWallBelowGradeArea(fw);
    if (bg > 0) {
      a += bg;
      ua += foundationWallBelowGradeU(fw) * bg;
    }
    const ag = foundationWallAboveGradeArea(fw);
    if (ag > 0) {
      a += ag;
      ua += foundationWallAboveGradeU(fw) * ag;
    }
  }
  for (const w of b.walls) {
    a += w.netAreaFt2;
    ua += uFromR(w.assemblyR) * w.netAreaFt2;
  }
  if (!(a > 0)) throw new EngineInputError("missing_input", "a floor over a crawlspace needs the crawlspace's foundation walls (or walls) to set its partition temperature", { method: M });
  return ua / a;
}

/** Floor over a crawlspace: U × partition temperature difference (lines 1318 to 1340). */
export function floorOverCrawlspaceHtm(floorAssemblyR: number, location: CrawlspaceLocation, boundary: CrawlspaceBoundary, dc: DesignConditions): Htm {
  const uFloor = uFromR(floorAssemblyR);
  const uWall = crawlspaceWallU(boundary);
  const k = CRAWLSPACE_PTD.floorWeight;
  let ptdc: number;
  let ptdh: number;
  if (location === "crawlspace - vented") {
    const d = 1 + (k * uFloor) / (uWall + CRAWLSPACE_PTD.ventedWallAdder);
    ptdc = dc.ctd / d;
    ptdh = dc.htd / d;
  } else {
    ptdc = (uWall * dc.ctd) / (k * uFloor + uWall);
    ptdh = (uWall * dc.htd) / (k * uFloor + uWall);
  }
  return { heating: uFloor * ptdh, cooling: uFloor * ptdc };
}

// ---------------------------------------------------------------------------------------
// Crawlspace air temperature (used for ducts in the crawlspace)

export interface CrawlspaceHeatBalanceInput {
  location: CrawlspaceLocation;
  /** UA to conditioned space: floors between the house and the crawlspace, Σ area / R. */
  uaToConditioned: number;
  foundationWalls: readonly FoundationWallInput[];
  /** Crawlspace walls to outside, Σ net area / R. */
  uaWallsToOutside: number;
  /** Dirt or concrete floor of the crawlspace: area, thickness (0 for dirt) and insulation. */
  floor: { areaFt2: number; thicknessIn: number };
  /** Vented crawlspace vent SLA; ignored for unvented. */
  ventedSla?: number;
  /** Weather shielding factor of the station (oracle weather data WSF). */
  wsf: number;
  /** Annual average dry bulb of the station, °F, for outdoor air density. */
  annualAvgDrybulbF: number;
}

/** Dirt-floor U (Walker 1998 via hvac_sizing.rb 4303 to 4306). */
const DIRT_FLOOR_U = 0.1;

/**
 * Crawlspace design temperatures from a UA balance between outdoors, the house and the ground
 * (lines 4257 to 4400). Crawlspace ground contact counts as outdoor, per Walker (1998).
 */
export function crawlspaceDesignTemps(c: CrawlspaceHeatBalanceInput, dc: DesignConditions): BufferTemps {
  let uaOutside = c.uaWallsToOutside;
  for (const fw of c.foundationWalls) {
    const bg = foundationWallBelowGradeArea(fw);
    const ag = foundationWallAboveGradeArea(fw);
    let a = 0;
    let ua = 0;
    if (bg > 0) {
      a += bg;
      ua += foundationWallBelowGradeU(fw) * bg;
    }
    if (ag > 0) {
      a += ag;
      ua += foundationWallAboveGradeU(fw) * ag;
    }
    if (a > 0) uaOutside += (ua / a) * fw.areaFt2;
  }
  if (c.floor.thicknessIn !== 0) {
    throw new EngineInputError("unsupported", "a concrete crawlspace floor needs the slab UA path (not in 0.2.0); a dirt floor has thickness 0", { method: M });
  }
  uaOutside += DIRT_FLOOR_U * c.floor.areaFt2;

  let ach: number;
  if (c.location === "crawlspace - vented") {
    if (c.ventedSla === undefined) throw new EngineInputError("missing_input", "a vented crawlspace needs vented_crawlspace_sla", { method: M });
    // airflow.rb 2781 to 2797 with infiltration height = average ceiling height = reference height.
    ach = 1000 * c.ventedSla * c.wsf;
  } else {
    ach = UNVENTED_SPACE_ACH;
  }
  const heights = c.foundationWalls.map((w) => w.heightFt);
  const height = heights.length > 0 ? Math.max(...heights) : CRAWLSPACE_DEFAULT_HEIGHT_FT;
  const volume = c.floor.areaFt2 * height;
  const cfm = (ach / 60) * volume;
  const rhoOut = airDensityLbPerFt3(dc.pressurePsi, c.annualAvgDrybulbF);
  uaOutside += cfm * rhoOut * AIR_CP_BTU_PER_LB_F * 60;

  const balance = (outdoorF: number, setpointF: number) => (uaOutside * outdoorF + c.uaToConditioned * setpointF) / (uaOutside + c.uaToConditioned);
  return { heatF: balance(dc.heatingDesignTempF, dc.heatingSetpointF), coolF: balance(dc.coolingDesignTempF, dc.coolingSetpointF) };
}

/** Duct regain factor in a crawlspace from whether its ceiling and walls are insulated (lines 1777 to 1820). */
export function crawlspaceDuctRegain(location: CrawlspaceLocation, floorAboveAvgR: number, foundationWallAvgR: number): number {
  const ceiling = floorAboveAvgR > CRAWLSPACE_INSULATED_R_THRESHOLD;
  const walls = foundationWallAvgR > CRAWLSPACE_INSULATED_R_THRESHOLD;
  const t = CRAWLSPACE_DUCT_REGAIN[location];
  if (ceiling && walls) return t.floorAndWalls;
  if (ceiling) return t.floorOnly;
  if (walls) return t.wallsOnly;
  return t.neither;
}

export { FOUNDATION_WALL_MIN_BELOW_GRADE_FT };
