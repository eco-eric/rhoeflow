/**
 * MJ8.envelope.conduction: heat-transfer multipliers (Btu/h per ft2) and loads for opaque
 * surfaces: above-grade walls, doors, ceilings under attics or exposed, and conditioned
 * (cathedral) roofs. Heating is U × HTD. Cooling is U × CLTD, where the CLTD comes from the
 * coefficient tables (see coefficients.ts for provenance) adjusted for the site's cooling
 * design temperature and daily-range class.
 *
 * Structure follows OpenStudio-HPXML v1.12.0 `hvac_sizing.rb`: doors 987 to 1035, walls
 * 1036 to 1131 (above grade), roofs 1163 to 1232, ceilings 1234 to 1272, attic design
 * temperatures 338 to 520, wall groups 4456 to 4717.
 *
 * Supported in 0.1.0: exterior and attic-adjacent surfaces of a detached single-family
 * house. Not supported (throws `unsupported`): foundation walls, rim joists, garages,
 * basements, crawlspaces, encapsulated unvented attics, inter-unit surfaces.
 */
import {
  DOOR_CLTD_OFFSET,
  ENCAPSULATED_VENTED_ATTIC_COOLING_OFFSET_F,
  EXTERIOR_CEILING_CLTD_OFFSET,
  ROOF_CLTD_BY_R,
  TABLE_4A_TO_ASHRAE_GROUP,
  UNVENTED_ATTIC_BASE_TEMP_F,
  WALL_CLTD_BASE_SUN,
  WALL_COLOR_MULTIPLIER,
  WALL_GROUP_THRESHOLDS,
  roofCltdColorMultiplier,
  roofColorFromAbsorptance,
  ventedAtticBaseTempF,
  wallColorFromAbsorptance,
  type RoofColorClass,
} from "./coefficients.js";
import type { DesignConditions } from "./design-conditions.js";
import { EngineInputError } from "./errors.js";
import { uFromR } from "./units.js";

export const MJ8_ENVELOPE_CONDUCTION = { id: "MJ8.envelope.conduction", version: "0.1.0" } as const;
const M = MJ8_ENVELOPE_CONDUCTION.id;

export interface Htm {
  heating: number;
  cooling: number;
}

export interface SurfaceLoad extends Htm {
  area: number;
  heatingLoad: number;
  coolingSensibleLoad: number;
}

export function surfaceLoad(htm: Htm, area: number): SurfaceLoad {
  if (!(area >= 0)) throw new EngineInputError("out_of_range", `area must be non-negative, got ${area}`, { method: M });
  return { ...htm, area, heatingLoad: htm.heating * area, coolingSensibleLoad: htm.cooling * area };
}

/** Net area = gross − attached openings; never negative. */
export function netArea(grossArea: number, openingAreas: readonly number[]): number {
  const net = grossArea - openingAreas.reduce((s, a) => s + a, 0);
  if (net < 0) throw new EngineInputError("out_of_range", `openings (${grossArea - net}) exceed the gross area (${grossArea})`, { method: M });
  return net;
}

/** Area-weighted average R of surfaces (hvac_sizing.rb 4794 to 4806). */
export function averageRValue(surfaces: ReadonlyArray<{ area: number; assemblyR: number }>): number {
  let a = 0;
  let ua = 0;
  for (const s of surfaces) {
    a += s.area;
    ua += uFromR(s.assemblyR) * s.area;
  }
  if (ua === 0) throw new EngineInputError("missing_input", "no surfaces to average", { method: M });
  return a / ua;
}

// ---------------------------------------------------------------------------------------
// Walls

export type MasonrySiding = "brick veneer" | "stucco" | "stone";
const MASONRY_SIDINGS: ReadonlySet<string> = new Set(["brick veneer", "stone"]);

export interface WallGroupInput {
  wallType: string;
  siding: string;
  assemblyR: number;
}

/** ASHRAE wall group for the CLTD table (hvac_sizing.rb get_ashrae_wall_group). */
export function ashraeWallGroup(w: WallGroupInput): string {
  const u = uFromR(w.assemblyR);
  const masonry = MASONRY_SIDINGS.has(w.siding);
  let group: string | undefined;
  switch (w.wallType) {
    case "wood stud":
    case "steel frame": {
      const key = `${w.wallType}|${masonry ? "masonry" : "other"}`;
      group = WALL_GROUP_THRESHOLDS[key]!.find(([maxU]) => u <= maxU)![1];
      break;
    }
    case "double wood stud":
      group = masonry ? "K" : "J";
      break;
    case "structurally insulated panel":
      if (u >= (0.072 + 0.05) / 2) group = masonry ? "J" : "G";
      else if (u >= 0.05) group = masonry ? "K" : "I";
      else group = "K";
      break;
    case "concrete masonry unit":
      group = WALL_GROUP_THRESHOLDS["concrete masonry unit|any"]!.find(([maxU]) => u <= maxU)![1];
      break;
    case "structural brick":
    case "adobe":
    case "solid concrete":
    case "stone":
      if (u >= (0.218 + 0.179) / 2) group = "G";
      else if (u >= (0.152 + 0.132) / 2) group = "H";
      else if (u >= (0.117 + 0.079) / 2) group = "I";
      else if (u >= 0.079) group = "J";
      else group = "K";
      break;
    case "log wall":
      if (u >= (0.103 + 0.091) / 2) group = "G";
      else if (u >= (0.091 + 0.082) / 2) group = "H";
      else if (u >= (0.074 + 0.068) / 2) group = "I";
      else if (u >= (0.068 + 0.063) / 2) group = "J";
      else group = "K";
      break;
    case "insulated concrete forms":
      group = "K";
      break;
    default:
      throw new EngineInputError("unsupported", `wall type "${w.wallType}" has no wall-group rule`, { method: M });
  }
  const ashrae = TABLE_4A_TO_ASHRAE_GROUP[group];
  if (!ashrae) throw new Error(`unexpected wall group ${group}`);
  return ashrae;
}

export interface ExteriorWallInput extends WallGroupInput {
  solarAbsorptance: number;
}

/** CLTD for a sunlit exterior wall after color, CTD and daily-range adjustment (hvac_sizing.rb 1066 to 1102). */
export function exteriorWallCltd(w: ExteriorWallInput, dc: DesignConditions): number {
  const group = ashraeWallGroup(w);
  const base = WALL_CLTD_BASE_SUN[group];
  if (base === undefined) throw new Error(`no base CLTD for wall group ${group}`);
  const color = wallColorFromAbsorptance(w.solarAbsorptance);
  let cltd = base * WALL_COLOR_MULTIPLIER[color];
  if (dc.ctd >= 10) {
    cltd += dc.coolingDesignTempF - 95 + dc.dailyRangeTempAdjustF;
  } else {
    // Low CTD handling per MJ8 A12-18/A12-19 as implemented by the oracle.
    const corr = dc.ctd - 20 - dc.dailyRangeTempAdjustF;
    cltd = Math.max(cltd + corr, 0);
  }
  return cltd;
}

export function exteriorWallHtm(w: ExteriorWallInput, dc: DesignConditions): Htm {
  const u = uFromR(w.assemblyR);
  return { heating: u * dc.htd, cooling: u * exteriorWallCltd(w, dc) };
}

/** Any surface between conditioned space and an unconditioned space with known design temperatures. */
export function partitionHtm(assemblyR: number, adjacent: { heatF: number; coolF: number }, dc: DesignConditions): Htm {
  const u = uFromR(assemblyR);
  return { heating: u * (dc.heatingSetpointF - adjacent.heatF), cooling: u * (adjacent.coolF - dc.coolingSetpointF) };
}

// ---------------------------------------------------------------------------------------
// Doors

export function exteriorDoorHtm(rValue: number, dc: DesignConditions): Htm {
  const u = uFromR(rValue);
  const cltd = dc.ctd + DOOR_CLTD_OFFSET[dc.dailyRangeIndex];
  return { heating: u * dc.htd, cooling: u * cltd };
}

// ---------------------------------------------------------------------------------------
// Ceilings, roofs and attics

/** Ceiling directly under outdoor air (hvac_sizing.rb 1245 to 1247). */
export function exteriorCeilingHtm(assemblyR: number, dc: DesignConditions): Htm {
  const u = uFromR(assemblyR);
  return { heating: u * dc.htd, cooling: u * (dc.ctd + EXTERIOR_CEILING_CLTD_OFFSET + dc.dailyRangeTempAdjustF) };
}

export interface AtticRoofInput {
  area: number;
  assemblyR: number;
  roofType: string;
  solarAbsorptance: number;
  radiantBarrier: boolean;
}

export interface AtticInput {
  vented: boolean;
  roofs: readonly AtticRoofInput[];
  /** Ceilings between the attic and conditioned space. */
  ceilings: ReadonlyArray<{ area: number; assemblyR: number }>;
}

export interface AtticDesignTemps {
  heatF: number;
  coolF: number;
  /** Floor R below roof R: the attic is treated as encapsulated. */
  encapsulated: boolean;
  roofColor: RoofColorClass[];
}

/** Attic design temperatures (hvac_sizing.rb 349 to 364 heating, 409 to 512 cooling). */
export function atticDesignTemps(attic: AtticInput, dc: DesignConditions): AtticDesignTemps {
  if (attic.roofs.length === 0 || attic.ceilings.length === 0) {
    throw new EngineInputError("missing_input", "an attic needs at least one roof and one ceiling", { method: M });
  }
  const floorR = averageRValue(attic.ceilings);
  const roofR = averageRValue(attic.roofs);
  const encapsulated = floorR < roofR;
  const roofColor = attic.roofs.map((r) => roofColorFromAbsorptance(r.roofType, r.solarAbsorptance));

  if (encapsulated) {
    if (!attic.vented) {
      throw new EngineInputError("unsupported", "encapsulated unvented attic needs the UA space-temperature model (not in 0.1.0)", { method: M });
    }
    return { heatF: dc.heatingDesignTempF, coolF: dc.coolingDesignTempF + ENCAPSULATED_VENTED_ATTIC_COOLING_OFFSET_F, encapsulated, roofColor };
  }

  let totalArea = 0;
  let weighted = 0;
  attic.roofs.forEach((r, i) => {
    totalArea += r.area;
    const base = attic.vented
      ? ventedAtticBaseTempF(r.roofType, roofColor[i]!, r.radiantBarrier)
      : r.radiantBarrier
        ? UNVENTED_ATTIC_BASE_TEMP_F.barrier
        : UNVENTED_ATTIC_BASE_TEMP_F.noBarrier;
    weighted += base * r.area;
  });
  const coolF = weighted / totalArea + (dc.coolingDesignTempF - 95) + dc.dailyRangeTempAdjustF;
  return { heatF: dc.heatingDesignTempF, coolF, encapsulated, roofColor };
}

/** Ceiling under an attic: a partition to the attic's design temperatures. */
export function atticCeilingHtm(assemblyR: number, attic: AtticDesignTemps, dc: DesignConditions): Htm {
  return partitionHtm(assemblyR, attic, dc);
}

export interface ConditionedRoofInput {
  assemblyR: number;
  roofType: string;
  solarAbsorptance: number;
}

/** Roof that is itself the thermal boundary (cathedral ceiling) (hvac_sizing.rb 1163 to 1215). */
export function conditionedRoofHtm(r: ConditionedRoofInput, dc: DesignConditions): Htm {
  const u = uFromR(r.assemblyR);
  const base = ROOF_CLTD_BY_R.find(([maxR]) => r.assemblyR <= maxR)![1];
  const color = roofColorFromAbsorptance(r.roofType, r.solarAbsorptance);
  let cltd = base * roofCltdColorMultiplier(r.roofType, color);
  cltd += dc.coolingDesignTempF - 95 + dc.dailyRangeTempAdjustF;
  return { heating: u * dc.htd, cooling: u * cltd };
}
