/**
 * MJ8.totals: walk a validated Assessment through the MJ8 methods and aggregate a building
 * block load with a per-component breakdown (MTH-003: every number traces to a component and
 * a method id).
 *
 * Order and aggregation follow OpenStudio-HPXML v1.12.0 `hvac_sizing.rb` 16 to 127 and 1623
 * to 1651: envelope, infiltration and internal gains first, the AED excursion on the
 * fenestration loads, then the duct loads computed from those pre-duct totals, then the sum.
 *
 * The engine never defaults an input. Everything it reads comes through `requireQuantity` or
 * `requireValue`, so an unknown, proposed, missing or mis-united field stops the run with a
 * structured error. Values it derives from accepted inputs (volume from area × height, duct
 * surface area from floor area served, design grains from the station's MCWB) are listed in
 * `derived` so the report can show them.
 *
 * Supported cases in 0.2.0 are the union of the methods' limits; anything else throws
 * `unsupported` naming the element.
 */
import type { Assessment } from "@rhoeflow/schema";
import { designConditions, type DesignConditions } from "./design-conditions.js";
import { EngineInputError } from "./errors.js";
import {
  MJ8_ENVELOPE_CONDUCTION,
  atticCeilingHtm,
  atticDesignTemps,
  conditionedRoofHtm,
  exteriorCeilingHtm,
  exteriorDoorHtm,
  exteriorWallHtm,
  netArea,
  partitionHtm,
  type AtticDesignTemps,
  type Htm,
} from "./envelope.js";
import {
  MJ8_BUFFER_SPACE,
  crawlspaceDesignTemps,
  crawlspaceDuctRegain,
  floorOverCrawlspaceHtm,
  garageDesignTemps,
  garageFractionUnderConditioned,
  type BufferTemps,
  type CrawlspaceLocation,
  type FoundationWallInput,
} from "./buffer-space.js";
import { MJ8_AED, MJ8_GLAZING, aedExcursion, sumHourly, windowLoad } from "./glazing.js";
import type { InteriorShadingDevice } from "./coefficients.js";
import { MJ8_INFILTRATION_BLOWER_DOOR, blowerDoorInfiltration, infiltrationLoads } from "./infiltration.js";
import { MJ8_INTERNAL_GAINS, internalGains } from "./internal-gains.js";
import { MJ8_SLAB_PERIMETER, slabPerimeterLoad } from "./slab.js";
import {
  MJ8_DUCTS,
  defaultDuctSurfaceArea,
  ductEffectiveRValue,
  ductLoads,
  ductRegainFactor,
  type CoolingEquipment,
  type DuctLeakage,
  type DuctSide,
  type HeatingEquipment,
} from "./ducts.js";
import { MJ8_DESIGN_CONDITIONS } from "./design-conditions.js";
import { MJ8_LATENT } from "./latent.js";
import { requireQuantity, requireValue, uFromR } from "./units.js";
import { DAILY_RANGE_TEMP_ADJUST, EXTERIOR_CEILING_CLTD_OFFSET } from "./coefficients.js";
import type { WeatherStation } from "../weather/library.js";
import type { ComponentDetail } from "../contracts.js";

type DuctSideDetail = NonNullable<ComponentDetail["duct_sides"]>[number];

export const MJ8_TOTALS = { id: "MJ8.totals", version: "0.2.0" } as const;

export type ComponentKind =
  | "wall"
  | "window"
  | "door"
  | "roof"
  | "ceiling"
  | "floor"
  | "slab"
  | "infiltration"
  | "duct"
  | "internal_gain"
  | "aed_excursion";

export interface ComponentLoad {
  component_id: string;
  component_kind: ComponentKind;
  method_id: string;
  heating_sensible: number;
  cooling_sensible: number;
  cooling_latent: number;
  detail?: ComponentDetail;
}

export interface BlockLoad {
  heating: number;
  coolingSensible: number;
  coolingLatent: number;
}

export interface BlockLoadResult {
  totals: BlockLoad;
  preDuct: BlockLoad;
  components: ComponentLoad[];
  methodIds: string[];
  derived: string[];
  warnings: { code: string; message: string; path?: string }[];
  designConditions: DesignConditions;
}

const CONDITIONED = "conditioned space";
const ATTICS = new Set(["attic - vented", "attic - unvented"]);
const CRAWLSPACES = new Set<string>(["crawlspace - vented", "crawlspace - unvented"]);
const GARAGE = "garage";

type B = Assessment["building"];

/** A known numeric field value, for detail that is informative but not required by the method (e.g. a wall's azimuth). */
const knownNumber = (q: { value: unknown } | undefined): number | undefined => (q && typeof q.value === "number" ? q.value : undefined);
const withAzimuth = (q: { value: unknown } | undefined): { azimuth_deg?: number } => {
  const v = knownNumber(q);
  return v === undefined ? {} : { azimuth_deg: v };
};

function shieldingClass(shielding: string, siteType: string): 1 | 2 | 3 | 4 | 5 {
  // defaults.rb 369 to 391: start at 4, ±1 for shielding, ±1 for site type, clamp to 1..5.
  let c = 4;
  if (shielding === "well-shielded") c += 1;
  else if (shielding === "exposed") c -= 1;
  if (siteType === "urban") c += 1;
  else if (siteType === "rural") c -= 1;
  return Math.min(5, Math.max(1, c)) as 1 | 2 | 3 | 4 | 5;
}

export function computeBlockLoad(assessment: Assessment, station: WeatherStation): BlockLoadResult {
  const b: B = assessment.building;
  const e = b.enclosure;
  const hvac = b.systems.hvac;
  const derived: string[] = [];
  const warnings: BlockLoadResult["warnings"] = [];
  const methods = new Set<string>([MJ8_TOTALS.id, MJ8_DESIGN_CONDITIONS.id]);
  const components: ComponentLoad[] = [];
  const P = "building";

  // ---------------------------------------------------------------- design conditions
  const control = hvac.hvac_control;
  if (!control) throw new EngineInputError("missing_input", "systems.hvac.hvac_control (setpoints) is required", { path: `${P}.systems.hvac.hvac_control`, method: MJ8_TOTALS.id });
  const mj = hvac.hvac_sizing_control.manualj_inputs;
  const mjP = `${P}.systems.hvac.hvac_sizing_control.manualj_inputs`;
  const hasSlab = e.slabs.some((s) => requireValue(s.interior_adjacent_to, `${P}.enclosure.slabs[].interior_adjacent_to`) === CONDITIONED);
  const dc = designConditions({
    heatingDesignTempF: requireQuantity(mj.heating_design_temperature, "F", `${mjP}.heating_design_temperature`),
    coolingDesignTempF: requireQuantity(mj.cooling_design_temperature, "F", `${mjP}.cooling_design_temperature`),
    dailyRange: requireValue(mj.daily_temperature_range, `${mjP}.daily_temperature_range`),
    coolingMcwbF: station.coolingMcwb1F,
    coolingMcwbDbF: station.coolingDb1F,
    heatingSetpointF: requireQuantity(control.heating_setpoint, "F", `${P}.systems.hvac.hvac_control.heating_setpoint`),
    coolingSetpointF: requireQuantity(control.cooling_setpoint, "F", `${P}.systems.hvac.hvac_control.cooling_setpoint`),
    humiditySetpoint: requireQuantity(mj.humidity_setpoint, "fraction", `${mjP}.humidity_setpoint`),
    ...(mj.humidity_difference ? { humidityDifferenceGrains: requireQuantity(mj.humidity_difference, "grains", `${mjP}.humidity_difference`) } : {}),
    elevationFt: station.elevationFt,
    ...(hasSlab
      ? {
          soilType: requireValue(b.site.soil_type, `${P}.site.soil_type`),
          moistureType: requireValue(b.site.moisture_type, `${P}.site.moisture_type`),
        }
      : { groundConductivity: 1 / 2 }), // not used when there is no slab
  });
  for (const d of dc.derived) if (d !== "groundConductivity" || hasSlab) derived.push(`designConditions.${d}`);

  // ---------------------------------------------------------------- attics
  const atticCache = new Map<string, AtticDesignTemps>();
  const atticTemps = (location: string): AtticDesignTemps => {
    const hit = atticCache.get(location);
    if (hit) return hit;
    const roofs = e.roofs
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => requireValue(r.interior_adjacent_to, `${P}.enclosure.roofs[].interior_adjacent_to`) === location)
      .map(({ r, i }) => ({
        area: requireQuantity(r.area, "ft2", `${P}.enclosure.roofs[${i}].area`),
        assemblyR: requireQuantity(r.insulation_assembly_r_value, "h-ft2-F/Btu", `${P}.enclosure.roofs[${i}].insulation_assembly_r_value`),
        roofType: requireValue(r.roof_type, `${P}.enclosure.roofs[${i}].roof_type`),
        solarAbsorptance: requireQuantity(r.solar_absorptance, "fraction", `${P}.enclosure.roofs[${i}].solar_absorptance`),
        radiantBarrier: requireValue(r.radiant_barrier, `${P}.enclosure.roofs[${i}].radiant_barrier`),
      }));
    const ceilings = e.floors
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => requireValue(f.exterior_adjacent_to, `${P}.enclosure.floors[].exterior_adjacent_to`) === location)
      .map(({ f, i }) => ({
        area: requireQuantity(f.area, "ft2", `${P}.enclosure.floors[${i}].area`),
        assemblyR: requireQuantity(f.insulation_assembly_r_value, "h-ft2-F/Btu", `${P}.enclosure.floors[${i}].insulation_assembly_r_value`),
      }));
    const temps = atticDesignTemps({ vented: location === "attic - vented", roofs, ceilings }, dc);
    atticCache.set(location, temps);
    return temps;
  };

  // ---------------------------------------------------------------- foundation walls and buffer spaces
  const foundationWalls = e.foundation_walls.map((w, i) => {
    const fp = `${P}.enclosure.foundation_walls[${i}]`;
    const int = requireValue(w.interior_adjacent_to, `${fp}.interior_adjacent_to`);
    const ext = requireValue(w.exterior_adjacent_to, `${fp}.exterior_adjacent_to`);
    if (int === CONDITIONED || ext === CONDITIONED) {
      throw new EngineInputError("unsupported", `foundation wall ${w.id} bounds conditioned space (conditioned basement or crawlspace, not in 0.2.0)`, { path: fp, method: MJ8_BUFFER_SPACE.id });
    }
    if (int === GARAGE) throw new EngineInputError("unsupported", `foundation wall ${w.id}: below-grade garages are not in 0.2.0`, { path: fp, method: MJ8_BUFFER_SPACE.id });
    const input: FoundationWallInput = {
      areaFt2: requireQuantity(w.area, "ft2", `${fp}.area`),
      heightFt: requireQuantity(w.height, "ft", `${fp}.height`),
      depthBelowGradeFt: requireQuantity(w.depth_below_grade, "ft", `${fp}.depth_below_grade`),
      assemblyR: requireQuantity(w.insulation_assembly_r_value, "h-ft2-F/Btu", `${fp}.insulation_assembly_r_value`),
    };
    return { id: w.id, interior: int, exterior: ext, input };
  });
  const floorSide = (fl: (typeof e.floors)[number], i: number) => ({
    int: requireValue(fl.interior_adjacent_to, `${P}.enclosure.floors[${i}].interior_adjacent_to`),
    ext: requireValue(fl.exterior_adjacent_to, `${P}.enclosure.floors[${i}].exterior_adjacent_to`),
  });
  const crawlBoundary = (location: string) => ({
    foundationWalls: foundationWalls.filter((w) => w.interior === location).map((w) => w.input),
    walls: e.walls
      .map((w, i) => ({ w, i }))
      .filter(({ w, i }) => requireValue(w.interior_adjacent_to, `${P}.enclosure.walls[${i}].interior_adjacent_to`) === location && requireValue(w.exterior_adjacent_to, `${P}.enclosure.walls[${i}].exterior_adjacent_to`) === "outside")
      .map(({ w, i }) => ({ netAreaFt2: requireQuantity(w.area, "ft2", `${P}.enclosure.walls[${i}].area`), assemblyR: requireQuantity(w.insulation_assembly_r_value, "h-ft2-F/Btu", `${P}.enclosure.walls[${i}].insulation_assembly_r_value`) })),
  });
  const bufferCache = new Map<string, BufferTemps>();
  const bufferTemps = (location: string, path: string): BufferTemps => {
    const hit = bufferCache.get(location);
    if (hit) return hit;
    let t: BufferTemps;
    if (ATTICS.has(location)) {
      const a = atticTemps(location);
      t = { heatF: a.heatF, coolF: a.coolF };
    } else if (location === "outside") {
      t = { heatF: dc.heatingDesignTempF, coolF: dc.coolingDesignTempF };
    } else if (location === GARAGE) {
      const roofAreas = e.roofs
        .map((r, i) => ({ r, i }))
        .filter(({ r, i }) => requireValue(r.interior_adjacent_to, `${P}.enclosure.roofs[${i}].interior_adjacent_to`) === GARAGE)
        .map(({ r, i }) => requireQuantity(r.area, "ft2", `${P}.enclosure.roofs[${i}].area`));
      const floors = e.floors
        .map((fl, i) => ({ fl, i, ...floorSide(fl, i) }))
        .filter(({ int, ext }) => int === GARAGE || ext === GARAGE)
        .map(({ fl, i, int, ext }) => ({ area: requireQuantity(fl.area, "ft2", `${P}.enclosure.floors[${i}].area`), boundsConditioned: int === CONDITIONED && ext === GARAGE }));
      const frac = garageFractionUnderConditioned(roofAreas, floors);
      derived.push(`garage fraction under conditioned space = ${frac.toFixed(3)} (floor area under conditioned space / garage roof and floor areas)`);
      t = garageDesignTemps(frac, dc);
    } else if (CRAWLSPACES.has(location)) {
      const loc = location as CrawlspaceLocation;
      let uaToConditioned = 0;
      e.floors.forEach((fl, i) => {
        const { int, ext } = floorSide(fl, i);
        if ((int === CONDITIONED && ext === loc) || (ext === CONDITIONED && int === loc)) {
          uaToConditioned +=
            requireQuantity(fl.area, "ft2", `${P}.enclosure.floors[${i}].area`) / requireQuantity(fl.insulation_assembly_r_value, "h-ft2-F/Btu", `${P}.enclosure.floors[${i}].insulation_assembly_r_value`);
        }
      });
      const b = crawlBoundary(loc);
      const slabIdx = e.slabs.findIndex((sl, i) => requireValue(sl.interior_adjacent_to, `${P}.enclosure.slabs[${i}].interior_adjacent_to`) === loc);
      if (slabIdx < 0) throw new EngineInputError("missing_input", `${loc} needs its floor as a slab (thickness 0 for dirt)`, { path: `${P}.enclosure.slabs`, method: MJ8_BUFFER_SPACE.id });
      const slab = e.slabs[slabIdx]!;
      let ventedSla: number | undefined;
      if (loc === "crawlspace - vented") {
        const fi = e.foundations.findIndex((fd, i) => requireValue(fd.foundation_type, `${P}.enclosure.foundations[${i}].foundation_type`) === "vented crawlspace");
        const fd = e.foundations[fi];
        if (!fd || !fd.vented_crawlspace_sla) {
          throw new EngineInputError("missing_input", "a vented crawlspace needs foundations[].vented_crawlspace_sla", { path: `${P}.enclosure.foundations`, method: MJ8_BUFFER_SPACE.id });
        }
        ventedSla = requireQuantity(fd.vented_crawlspace_sla, "fraction", `${P}.enclosure.foundations[${fi}].vented_crawlspace_sla`);
      }
      t = crawlspaceDesignTemps(
        {
          location: loc,
          uaToConditioned,
          foundationWalls: b.foundationWalls,
          uaWallsToOutside: b.walls.reduce((s2, w) => s2 + w.netAreaFt2 / w.assemblyR, 0),
          floor: {
            areaFt2: requireQuantity(slab.area, "ft2", `${P}.enclosure.slabs[${slabIdx}].area`),
            thicknessIn: requireQuantity(slab.thickness, "in", `${P}.enclosure.slabs[${slabIdx}].thickness`),
          },
          ...(ventedSla !== undefined ? { ventedSla } : {}),
          wsf: station.hourlyDerived.wsf,
          annualAvgDrybulbF: station.hourlyDerived.annualAvgDrybulbF,
        },
        dc,
      );
      derived.push(`${loc} design temperatures ${t.heatF.toFixed(2)} / ${t.coolF.toFixed(2)} F (UA balance)`);
    } else {
      throw new EngineInputError("unsupported", `design temperatures for "${location}" are not in 0.2.0`, { path, method: MJ8_BUFFER_SPACE.id });
    }
    methods.add(MJ8_BUFFER_SPACE.id);
    bufferCache.set(location, t);
    return t;
  };

  // ---------------------------------------------------------------- openings by wall
  const openingsByWall = new Map<string, number[]>();
  const addOpening = (wallId: string, area: number) => openingsByWall.set(wallId, [...(openingsByWall.get(wallId) ?? []), area]);
  e.windows.forEach((w, i) => addOpening(w.attached_to_wall, requireQuantity(w.area, "ft2", `${P}.enclosure.windows[${i}].area`)));
  e.doors.forEach((d, i) => addOpening(d.attached_to_wall, requireQuantity(d.area, "ft2", `${P}.enclosure.doors[${i}].area`)));

  const exteriorWalls = new Set<string>();
  /** Walls between conditioned space and a buffer space, by wall id to buffer location. */
  const partitionWalls = new Map<string, string>();

  // ---------------------------------------------------------------- walls
  e.walls.forEach((w, i) => {
    const wp = `${P}.enclosure.walls[${i}]`;
    const ext = requireValue(w.exterior_adjacent_to, `${wp}.exterior_adjacent_to`);
    const int = requireValue(w.interior_adjacent_to, `${wp}.interior_adjacent_to`);
    if (int !== CONDITIONED && ext !== CONDITIONED) return; // e.g. attic gable wall: not a thermal boundary
    if (int !== CONDITIONED) {
      throw new EngineInputError("unsupported", `wall ${w.id} has conditioned space on its exterior side; give interior_adjacent_to = conditioned space`, { path: wp, method: MJ8_ENVELOPE_CONDUCTION.id });
    }
    const net = netArea(requireQuantity(w.area, "ft2", `${wp}.area`), openingsByWall.get(w.id) ?? []);
    if (ext === GARAGE) {
      partitionWalls.set(w.id, ext);
      const r = requireQuantity(w.insulation_assembly_r_value, "h-ft2-F/Btu", `${wp}.insulation_assembly_r_value`);
      const htm = partitionHtm(r, bufferTemps(ext, wp), dc);
      methods.add(MJ8_ENVELOPE_CONDUCTION.id);
      components.push({
        component_id: w.id,
        component_kind: "wall",
        method_id: MJ8_BUFFER_SPACE.id,
        heating_sensible: htm.heating * net,
        cooling_sensible: htm.cooling * net,
        cooling_latent: 0,
        detail: { area_ft2: net, u_value: uFromR(r), htm_heating: htm.heating, htm_cooling: htm.cooling, adjacent_to: ext, ...withAzimuth(w.azimuth) },
      });
      return;
    }
    if (ext !== "outside") {
      throw new EngineInputError("unsupported", `wall ${w.id} between "${int}" and "${ext}" needs partition design temperatures (not in 0.2.0)`, { path: wp, method: MJ8_ENVELOPE_CONDUCTION.id });
    }
    exteriorWalls.add(w.id);
    const assemblyR = requireQuantity(w.insulation_assembly_r_value, "h-ft2-F/Btu", `${wp}.insulation_assembly_r_value`);
    const htm = exteriorWallHtm(
      {
        wallType: requireValue(w.wall_type, `${wp}.wall_type`),
        siding: requireValue(w.siding, `${wp}.siding`),
        assemblyR,
        solarAbsorptance: requireQuantity(w.solar_absorptance, "fraction", `${wp}.solar_absorptance`),
      },
      dc,
    );
    methods.add(MJ8_ENVELOPE_CONDUCTION.id);
    components.push({
      component_id: w.id,
      component_kind: "wall",
      method_id: MJ8_ENVELOPE_CONDUCTION.id,
      heating_sensible: htm.heating * net,
      cooling_sensible: htm.cooling * net,
      cooling_latent: 0,
      detail: { area_ft2: net, u_value: uFromR(assemblyR), htm_heating: htm.heating, htm_cooling: htm.cooling, adjacent_to: ext, ...withAzimuth(w.azimuth) },
    });
  });

  // ---------------------------------------------------------------- windows
  const hourly: number[][] = [];
  e.windows.forEach((w, i) => {
    const wp = `${P}.enclosure.windows[${i}]`;
    if (!exteriorWalls.has(w.attached_to_wall)) {
      throw new EngineInputError("unsupported", `window ${w.id} is not on an exterior wall of conditioned space`, { path: wp, method: MJ8_GLAZING.id });
    }
    const shading = requireValue(w.interior_shading, `${wp}.interior_shading`);
    if (shading === "other") throw new EngineInputError("unsupported", `window ${w.id}: interior shading "other" has no coefficient`, { path: `${wp}.interior_shading`, method: MJ8_GLAZING.id });
    if (shading.endsWith("blinds")) {
      throw new EngineInputError("unsupported", `window ${w.id}: blinds need a summer open/closed state (not in 0.1.0)`, { path: `${wp}.interior_shading`, method: MJ8_GLAZING.id });
    }
    const device: InteriorShadingDevice | "none" = shading === "not present" ? "none" : (shading as InteriorShadingDevice);
    const coverage = device === "none" ? 0 : requireQuantity(w.interior_shading_summer_coverage, "fraction", `${wp}.interior_shading_summer_coverage`);
    const overhang = w.overhangs
      ? {
          depthFt: requireQuantity(w.overhangs.depth, "ft", `${wp}.overhangs.depth`),
          distanceToTopOfWindowFt: requireQuantity(w.overhangs.distance_to_top_of_window, "ft", `${wp}.overhangs.distance_to_top_of_window`),
          distanceToBottomOfWindowFt: requireQuantity(w.overhangs.distance_to_bottom_of_window, "ft", `${wp}.overhangs.distance_to_bottom_of_window`),
        }
      : undefined;
    const winArea = requireQuantity(w.area, "ft2", `${wp}.area`);
    const azimuthDeg = requireQuantity(w.azimuth, "degrees", `${wp}.azimuth`);
    const ufactor = requireQuantity(w.ufactor, "Btu/h-ft2-F", `${wp}.ufactor`);
    const shgc = requireQuantity(w.shgc, "fraction", `${wp}.shgc`);
    const load = windowLoad(
      {
        area: winArea,
        azimuthDeg,
        ufactor,
        shgc,
        interiorShading: device,
        interiorShadingSummerCoverage: coverage,
        ...(overhang ? { overhang } : {}),
      },
      station.latitude,
      dc,
    );
    methods.add(MJ8_GLAZING.id);
    hourly.push(load.hourlyCoolingLoads);
    components.push({
      component_id: w.id,
      component_kind: "window",
      method_id: MJ8_GLAZING.id,
      heating_sensible: load.heatingLoad,
      cooling_sensible: load.coolingSensibleLoad,
      cooling_latent: 0,
      detail: { area_ft2: winArea, u_value: ufactor, shgc, azimuth_deg: azimuthDeg, htm_heating: load.heatingLoad / winArea, htm_cooling: load.coolingSensibleLoad / winArea, adjacent_to: "outside" },
    });
  });

  // ---------------------------------------------------------------- doors
  e.doors.forEach((d, i) => {
    const dp = `${P}.enclosure.doors[${i}]`;
    const buffer = partitionWalls.get(d.attached_to_wall);
    if (!exteriorWalls.has(d.attached_to_wall) && buffer === undefined) {
      throw new EngineInputError("unsupported", `door ${d.id} is not on a wall of conditioned space`, { path: dp, method: MJ8_ENVELOPE_CONDUCTION.id });
    }
    const area = requireQuantity(d.area, "ft2", `${dp}.area`);
    const doorR = requireQuantity(d.r_value, "h-ft2-F/Btu", `${dp}.r_value`);
    const htm = buffer === undefined ? exteriorDoorHtm(doorR, dc) : partitionHtm(doorR, bufferTemps(buffer, dp), dc);
    methods.add(MJ8_ENVELOPE_CONDUCTION.id);
    components.push({
      component_id: d.id,
      component_kind: "door",
      method_id: MJ8_ENVELOPE_CONDUCTION.id,
      heating_sensible: htm.heating * area,
      cooling_sensible: htm.cooling * area,
      cooling_latent: 0,
      detail: { area_ft2: area, u_value: uFromR(doorR), htm_heating: htm.heating, htm_cooling: htm.cooling, adjacent_to: buffer ?? "outside", ...withAzimuth(d.azimuth) },
    });
  });

  // ---------------------------------------------------------------- floors and ceilings
  /** Floor over outdoor air (cantilever), hvac_sizing.rb 1290 to 1295: U x (CTD - 5 + daily-range adjust), U x HTD. */
  const exteriorFloorHtm = (r: number): Htm => {
    const u = uFromR(r);
    return { heating: u * dc.htd, cooling: u * (dc.ctd + EXTERIOR_CEILING_CLTD_OFFSET + DAILY_RANGE_TEMP_ADJUST[dc.dailyRangeIndex]) };
  };
  e.floors.forEach((f, i) => {
    const fp = `${P}.enclosure.floors[${i}]`;
    const ext = requireValue(f.exterior_adjacent_to, `${fp}.exterior_adjacent_to`);
    const int = requireValue(f.interior_adjacent_to, `${fp}.interior_adjacent_to`);
    if (int !== CONDITIONED && ext !== CONDITIONED) return;
    if (int !== CONDITIONED) {
      throw new EngineInputError("unsupported", `floor ${f.id} has conditioned space on its exterior side; give interior_adjacent_to = conditioned space`, { path: fp, method: MJ8_ENVELOPE_CONDUCTION.id });
    }
    let isCeiling: boolean;
    if (f.floor_or_ceiling) isCeiling = requireValue(f.floor_or_ceiling, `${fp}.floor_or_ceiling`) === "ceiling";
    else if (ATTICS.has(ext)) isCeiling = true;
    else if (CRAWLSPACES.has(ext)) isCeiling = false;
    else throw new EngineInputError("missing_input", `floor ${f.id} next to "${ext}" needs floor_or_ceiling`, { path: `${fp}.floor_or_ceiling`, method: MJ8_ENVELOPE_CONDUCTION.id });
    const area = requireQuantity(f.area, "ft2", `${fp}.area`);
    const r = requireQuantity(f.insulation_assembly_r_value, "h-ft2-F/Btu", `${fp}.insulation_assembly_r_value`);
    let htm: Htm;
    let method: string = MJ8_ENVELOPE_CONDUCTION.id;
    if (isCeiling && ATTICS.has(ext)) htm = atticCeilingHtm(r, atticTemps(ext), dc);
    else if (ext === "outside") htm = isCeiling ? exteriorCeilingHtm(r, dc) : exteriorFloorHtm(r);
    else if (!isCeiling && CRAWLSPACES.has(ext)) {
      htm = floorOverCrawlspaceHtm(r, ext as CrawlspaceLocation, crawlBoundary(ext), dc);
      method = MJ8_BUFFER_SPACE.id;
      methods.add(MJ8_BUFFER_SPACE.id);
    } else if (ext === GARAGE) {
      htm = partitionHtm(r, bufferTemps(ext, fp), dc);
      method = MJ8_BUFFER_SPACE.id;
    } else {
      throw new EngineInputError("unsupported", `${isCeiling ? "ceiling" : "floor"} ${f.id} next to "${ext}" is not in 0.2.0`, { path: fp, method: MJ8_ENVELOPE_CONDUCTION.id });
    }
    methods.add(MJ8_ENVELOPE_CONDUCTION.id);
    components.push({
      component_id: f.id,
      component_kind: isCeiling ? "ceiling" : "floor",
      method_id: method,
      heating_sensible: htm.heating * area,
      cooling_sensible: htm.cooling * area,
      cooling_latent: 0,
      detail: { area_ft2: area, u_value: uFromR(r), htm_heating: htm.heating, htm_cooling: htm.cooling, adjacent_to: ext },
    });
  });

  // ---------------------------------------------------------------- roofs (cathedral only; attic roofs set the attic temperature)
  e.roofs.forEach((r, i) => {
    const rp = `${P}.enclosure.roofs[${i}]`;
    const int = requireValue(r.interior_adjacent_to, `${rp}.interior_adjacent_to`);
    if (int !== CONDITIONED) return; // attic and garage roofs set that space temperature; not a thermal boundary
    const area = requireQuantity(r.area, "ft2", `${rp}.area`);
    const roofR = requireQuantity(r.insulation_assembly_r_value, "h-ft2-F/Btu", `${rp}.insulation_assembly_r_value`);
    const htm = conditionedRoofHtm(
      {
        assemblyR: roofR,
        roofType: requireValue(r.roof_type, `${rp}.roof_type`),
        solarAbsorptance: requireQuantity(r.solar_absorptance, "fraction", `${rp}.solar_absorptance`),
      },
      dc,
    );
    methods.add(MJ8_ENVELOPE_CONDUCTION.id);
    components.push({
      component_id: r.id,
      component_kind: "roof",
      method_id: MJ8_ENVELOPE_CONDUCTION.id,
      heating_sensible: htm.heating * area,
      cooling_sensible: htm.cooling * area,
      cooling_latent: 0,
      detail: { area_ft2: area, u_value: uFromR(roofR), htm_heating: htm.heating, htm_cooling: htm.cooling, adjacent_to: "outside", ...withAzimuth(r.azimuth) },
    });
  });

  // ---------------------------------------------------------------- slabs
  e.slabs.forEach((s, i) => {
    const sp = `${P}.enclosure.slabs[${i}]`;
    if (requireValue(s.interior_adjacent_to, `${sp}.interior_adjacent_to`) !== CONDITIONED) return;
    const load = slabPerimeterLoad(
      {
        thicknessIn: requireQuantity(s.thickness, "in", `${sp}.thickness`),
        exposedPerimeterFt: requireQuantity(s.exposed_perimeter, "ft", `${sp}.exposed_perimeter`),
        perimeterInsulationR: requireQuantity(s.perimeter_insulation_r_value, "h-ft2-F/Btu", `${sp}.perimeter_insulation_r_value`),
        perimeterInsulationDepthFt: requireQuantity(s.perimeter_insulation_depth, "ft", `${sp}.perimeter_insulation_depth`),
        underSlabInsulationR: requireQuantity(s.under_slab_insulation_r_value, "h-ft2-F/Btu", `${sp}.under_slab_insulation_r_value`),
        underSlabInsulationWidthFt: s.under_slab_insulation_width ? requireQuantity(s.under_slab_insulation_width, "ft", `${sp}.under_slab_insulation_width`) : 0,
        underSlabInsulationSpansEntireSlab: false,
      },
      dc,
    );
    methods.add(MJ8_SLAB_PERIMETER.id);
    components.push({
      component_id: s.id,
      component_kind: "slab",
      method_id: MJ8_SLAB_PERIMETER.id,
      heating_sensible: load.heatingLoad,
      cooling_sensible: 0,
      cooling_latent: 0,
      detail: { perimeter_ft: load.lengthFt, f_value: load.fValue, htm_heating: load.heatingHtmPerFt, htm_cooling: 0, adjacent_to: "ground" },
    });
  });

  // ---------------------------------------------------------------- infiltration
  const bc = b.building_construction;
  const bcP = `${P}.building_construction`;
  const cfa = requireQuantity(bc.conditioned_floor_area, "ft2", `${bcP}.conditioned_floor_area`);
  const stories = requireQuantity(bc.number_of_conditioned_floors_above_grade, "count", `${bcP}.number_of_conditioned_floors_above_grade`);
  let volume: number;
  if (bc.conditioned_building_volume) {
    volume = requireQuantity(bc.conditioned_building_volume, "ft3", `${bcP}.conditioned_building_volume`);
  } else {
    volume = cfa * requireQuantity(bc.average_ceiling_height, "ft", `${bcP}.average_ceiling_height`);
    derived.push("building_construction.conditioned_building_volume = conditioned_floor_area × average_ceiling_height");
  }
  const ai = e.air_infiltration;
  const aiP = `${P}.enclosure.air_infiltration`;
  const leakageUnit = ai.air_leakage.unit;
  if (leakageUnit === "ACHnatural") throw new EngineInputError("unsupported", "natural ACH needs the SLA-from-nACH path (not in 0.1.0)", { path: `${aiP}.air_leakage`, method: MJ8_INFILTRATION_BLOWER_DOOR.id });
  const infil = blowerDoorInfiltration(
    {
      airLeakage: requireQuantity(ai.air_leakage, leakageUnit, `${aiP}.air_leakage`),
      unit: leakageUnit,
      housePressurePa: requireQuantity(ai.house_pressure, "Pa", `${aiP}.house_pressure`),
      conditionedFloorAreaFt2: cfa,
      infiltrationVolumeFt3: volume,
      storiesAboveGrade: stories,
      shieldingClass: shieldingClass(requireValue(b.site.shielding_of_home, `${P}.site.shielding_of_home`), requireValue(b.site.site_type, `${P}.site.site_type`)),
      facilityType: requireValue(bc.residential_facility_type, `${bcP}.residential_facility_type`),
    },
    dc,
  );
  const il = infiltrationLoads(infil, dc);
  methods.add(MJ8_INFILTRATION_BLOWER_DOOR.id).add(MJ8_LATENT.id);
  components.push({
    component_id: ai.id,
    component_kind: "infiltration",
    method_id: MJ8_INFILTRATION_BLOWER_DOOR.id,
    heating_sensible: il.heating,
    cooling_sensible: il.coolingSensible,
    cooling_latent: il.coolingLatent,
    detail: { ach50: infil.ach50, cfm_heating: infil.heatingCfm, cfm_cooling: infil.coolingCfm },
  });

  // ---------------------------------------------------------------- internal gains
  const occupants = requireQuantity(mj.number_of_occupants, "count", `${mjP}.number_of_occupants`);
  const gains = internalGains({
    appliancesSensibleBtuh: requireQuantity(mj.internal_loads_sensible, "Btu/h", `${mjP}.internal_loads_sensible`),
    appliancesLatentBtuh: requireQuantity(mj.internal_loads_latent, "Btu/h", `${mjP}.internal_loads_latent`),
    occupants,
  });
  methods.add(MJ8_INTERNAL_GAINS.id);
  components.push({
    component_id: "internal-gains",
    component_kind: "internal_gain",
    method_id: MJ8_INTERNAL_GAINS.id,
    heating_sensible: 0,
    cooling_sensible: gains.coolingSensible,
    cooling_latent: gains.coolingLatent,
    detail: { occupants },
  });

  // ---------------------------------------------------------------- AED excursion
  const excursion = aedExcursion(sumHourly(hourly));
  methods.add(MJ8_AED.id);
  components.push({ component_id: "aed-excursion", component_kind: "aed_excursion", method_id: MJ8_AED.id, heating_sensible: 0, cooling_sensible: excursion, cooling_latent: 0 });

  const sum = (pick: (c: ComponentLoad) => number) => components.reduce((s, c) => s + pick(c), 0);
  const preDuct: BlockLoad = { heating: sum((c) => c.heating_sensible), coolingSensible: sum((c) => c.cooling_sensible), coolingLatent: sum((c) => c.cooling_latent) };

  // ---------------------------------------------------------------- ducts
  // Each ducted system carries its share of the pre-duct load (fraction of load served) through
  // the duct calculation, and every system's duct load adds to the house total
  // (hvac_sizing.rb 40 to 75, 1700 to 1713, 1965 to 1997). One conditioned zone in 0.2.0.
  const allFractions = { heat: 0, cool: 0 };
  hvac.heat_pumps.forEach((h, i) => {
    allFractions.heat += requireQuantity(h.fraction_heat_load_served, "fraction", `${P}.systems.hvac.heat_pumps[${i}].fraction_heat_load_served`);
    allFractions.cool += requireQuantity(h.fraction_cool_load_served, "fraction", `${P}.systems.hvac.heat_pumps[${i}].fraction_cool_load_served`);
  });
  hvac.heating_systems.forEach((h, i) => (allFractions.heat += requireQuantity(h.fraction_heat_load_served, "fraction", `${P}.systems.hvac.heating_systems[${i}].fraction_heat_load_served`)));
  hvac.cooling_systems.forEach((c, i) => (allFractions.cool += requireQuantity(c.fraction_cool_load_served, "fraction", `${P}.systems.hvac.cooling_systems[${i}].fraction_cool_load_served`)));
  for (const [label, total] of [["heating", allFractions.heat], ["cooling", allFractions.cool]] as const) {
    if (total > 1 + 1e-6) throw new EngineInputError("out_of_range", `${label} fractions of load served sum to ${total}, more than 1`, { path: `${P}.systems.hvac`, method: MJ8_DUCTS.id });
  }
  const ducted = hvac.hvac_distributions.filter((d) => d.ducts.length > 0);
  for (const dist of ducted) {
    const dp = `${P}.systems.hvac.hvac_distributions[${hvac.hvac_distributions.indexOf(dist)}]`;
    const heatPumps = hvac.heat_pumps.filter((h) => h.distribution_system === dist.id);
    const furnaces = hvac.heating_systems.filter((h) => h.distribution_system === dist.id);
    const acs = hvac.cooling_systems.filter((c) => c.distribution_system === dist.id);

    let heatingEquipment: HeatingEquipment | null = null;
    let coolingEquipment: CoolingEquipment | null = null;
    let heatServed = 0;
    let coolServed = 0;
    for (const [i, h] of heatPumps.entries()) {
      const t = requireValue(h.heat_pump_type, `${P}.systems.hvac.heat_pumps[${i}].heat_pump_type`);
      if (t !== "air-to-air") throw new EngineInputError("unsupported", `ducted heat pump type "${t}" is not in 0.1.0`, { method: MJ8_DUCTS.id });
      const fh = requireQuantity(h.fraction_heat_load_served, "fraction", `${P}.systems.hvac.heat_pumps[${i}].fraction_heat_load_served`);
      const fc = requireQuantity(h.fraction_cool_load_served, "fraction", `${P}.systems.hvac.heat_pumps[${i}].fraction_cool_load_served`);
      if (fh > 0) heatingEquipment = "heat pump";
      if (fc > 0) coolingEquipment = "heat pump";
      heatServed += fh;
      coolServed += fc;
    }
    for (const [i, h] of furnaces.entries()) {
      const t = requireValue(h.heating_system_type, `${P}.systems.hvac.heating_systems[${i}].heating_system_type`);
      if (t !== "Furnace") throw new EngineInputError("unsupported", `ducted heating system type "${t}" is not in 0.1.0`, { method: MJ8_DUCTS.id });
      if (heatingEquipment === null) heatingEquipment = "furnace";
      heatServed += requireQuantity(h.fraction_heat_load_served, "fraction", `${P}.systems.hvac.heating_systems[${i}].fraction_heat_load_served`);
    }
    for (const [i, c] of acs.entries()) {
      const t = requireValue(c.cooling_system_type, `${P}.systems.hvac.cooling_systems[${i}].cooling_system_type`);
      if (t !== "central air conditioner") throw new EngineInputError("unsupported", `ducted cooling system type "${t}" is not in 0.1.0`, { method: MJ8_DUCTS.id });
      coolingEquipment = "central air conditioner";
      coolServed += requireQuantity(c.fraction_cool_load_served, "fraction", `${P}.systems.hvac.cooling_systems[${i}].fraction_cool_load_served`);
    }
    if (heatServed > 1 + 1e-6 || coolServed > 1 + 1e-6) {
      throw new EngineInputError("out_of_range", `systems on ${dist.id} serve more than the whole load (heating ${heatServed}, cooling ${coolServed})`, { path: dp, method: MJ8_DUCTS.id });
    }

    const cfaServed = dist.conditioned_floor_area_served
      ? requireQuantity(dist.conditioned_floor_area_served, "ft2", `${dp}.conditioned_floor_area_served`)
      : (derived.push("hvac_distribution.conditioned_floor_area_served = conditioned_floor_area"), cfa);

    const side = (type: "supply" | "return"): DuctSide => {
      let area = 0;
      let ua = 0;
      let tHeat = 0;
      let tCool = 0;
      let regain = 0;
      const located: { area: number; r: number; heat: number; cool: number; regain: number; location: string }[] = [];
      dist.ducts.forEach((d, di) => {
        const kp = `${dp}.ducts[${di}]`;
        if (requireValue(d.duct_type, `${kp}.duct_type`) !== type) return;
        const location = requireValue(d.duct_location, `${kp}.duct_location`);
        if (location === CONDITIONED) return; // oracle excludes ducts inside conditioned space from the area
        let ductArea: number;
        if (d.duct_surface_area) {
          ductArea = requireQuantity(d.duct_surface_area, "ft2", `${kp}.duct_surface_area`);
        } else {
          const frac = requireQuantity(d.duct_fraction_area, "fraction", `${kp}.duct_fraction_area`);
          const returns = type === "return" ? requireQuantity(dist.number_of_return_registers, "count", `${dp}.number_of_return_registers`) : 0;
          ductArea = defaultDuctSurfaceArea(type, cfaServed, frac, returns);
          derived.push(`${d.id}.duct_surface_area = ${ductArea.toFixed(1)} ft2 (ASHRAE 152 default from floor area served)`);
        }
        const r = ductEffectiveRValue(requireQuantity(d.duct_insulation_r_value, "h-ft2-F/Btu", `${kp}.duct_insulation_r_value`), type);
        derived.push(`${d.id}.effective_r_value = ${r} (from nominal R, air films and round-duct geometry)`);
        let heat: number;
        let cool: number;
        const t = bufferTemps(location, kp);
        heat = t.heatF;
        cool = t.coolF;
        let regain: number;
        if (CRAWLSPACES.has(location)) {
          const avgR = (xs: { a: number; r: number }[]) => xs.reduce((s2, x) => s2 + x.a, 0) / xs.reduce((s2, x) => s2 + x.a / x.r, 0);
          const above = e.floors.map((fl, i) => ({ fl, i, ...floorSide(fl, i) })).filter(({ int, ext }) => int === location || ext === location);
          const floorR = avgR(
            above.map(({ fl, i }) => ({
              a: requireQuantity(fl.area, "ft2", `${P}.enclosure.floors[${i}].area`),
              r: requireQuantity(fl.insulation_assembly_r_value, "h-ft2-F/Btu", `${P}.enclosure.floors[${i}].insulation_assembly_r_value`),
            })),
          );
          const wallR = avgR(foundationWalls.filter((w) => w.interior === location || w.exterior === location).map((w) => ({ a: w.input.areaFt2, r: w.input.assemblyR })));
          regain = crawlspaceDuctRegain(location as CrawlspaceLocation, floorR, wallR);
        } else {
          regain = ductRegainFactor(location);
        }
        located.push({ area: ductArea, r, heat, cool, regain, location });
      });
      for (const l of located) area += l.area;
      for (const l of located) {
        const f = l.area / area;
        ua += f / l.r;
        tHeat += l.heat * f;
        tCool += l.cool * f;
        regain += l.regain * f;
      }
      const leak = dist.duct_leakage_measurements.find(
        (m) => requireValue(m.duct_type, `${dp}.duct_leakage_measurements[].duct_type`) === type && requireValue(m.total_or_to_outside, `${dp}.duct_leakage_measurements[].total_or_to_outside`) === "to outside",
      );
      if (!leak) throw new EngineInputError("missing_input", `${type} duct leakage to outside is required`, { path: `${dp}.duct_leakage_measurements`, method: MJ8_DUCTS.id });
      const unit = leak.value.unit;
      const leakage: DuctLeakage = { kind: unit, value: requireQuantity(leak.value, unit, `${dp}.duct_leakage_measurements[${type}].value`) };
      if (area === 0) {
        return { surfaceAreaFt2: 0, effectiveR: Infinity, location: "outside", regainFactor: 0, ambientHeatingF: dc.heatingDesignTempF, ambientCoolingF: dc.coolingDesignTempF, leakageToOutside: leakage };
      }
      return { surfaceAreaFt2: area, effectiveR: 1 / ua, location: located[0]!.location, regainFactor: regain, ambientHeatingF: tHeat, ambientCoolingF: tCool, leakageToOutside: leakage };
    };

    const supply = side("supply");
    const ret = side("return");
    const sideDetail = (duct_type: "supply" | "return", d: DuctSide): DuctSideDetail => ({
      duct_type,
      location: d.surfaceAreaFt2 === 0 ? CONDITIONED : d.location,
      surface_area_ft2: d.surfaceAreaFt2,
      effective_r_value: Number.isFinite(d.effectiveR) ? d.effectiveR : null,
      regain_factor: d.regainFactor ?? 0,
      leakage_to_outside: { value: d.leakageToOutside.value, unit: d.leakageToOutside.kind },
    });
    const dl = ductLoads(
      { supply, return: ret, heatingEquipment, coolingEquipment },
      { heating: preDuct.heating * heatServed, coolingSensible: preDuct.coolingSensible * coolServed, coolingLatent: preDuct.coolingLatent * coolServed },
      dc,
      dc.outdoorHumidityRatio!,
    );
    methods.add(MJ8_DUCTS.id);
    if (!dl.converged) warnings.push({ code: "DUCT_LOAD_NOT_CONVERGED", message: "duct delivery-effectiveness iteration did not converge within 5 % after 50 iterations", path: dp });
    components.push({
      component_id: dist.id,
      component_kind: "duct",
      method_id: MJ8_DUCTS.id,
      heating_sensible: dl.heating,
      cooling_sensible: dl.coolingSensible,
      cooling_latent: dl.coolingLatent,
      detail: { duct_sides: [sideDetail("supply", supply), sideDetail("return", ret)] },
    });
  }

  const totals: BlockLoad = { heating: sum((c) => c.heating_sensible), coolingSensible: sum((c) => c.cooling_sensible), coolingLatent: sum((c) => c.cooling_latent) };
  if (derived.length > 0) {
    warnings.push({ code: "ENGINE_DERIVED_INPUTS", message: `derived from accepted inputs: ${derived.join("; ")}` });
  }
  return { totals, preDuct, components, methodIds: [...methods].sort(), derived, warnings, designConditions: dc };
}
