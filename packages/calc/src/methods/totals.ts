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
 * Supported cases in 0.1.0 are the union of the methods' limits; anything else throws
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
  type AtticDesignTemps,
} from "./envelope.js";
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
import { requireQuantity, requireValue } from "./units.js";
import type { WeatherStation } from "../weather/library.js";

export const MJ8_TOTALS = { id: "MJ8.totals", version: "0.1.0" } as const;

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

type B = Assessment["building"];

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

  // ---------------------------------------------------------------- openings by wall
  const openingsByWall = new Map<string, number[]>();
  const addOpening = (wallId: string, area: number) => openingsByWall.set(wallId, [...(openingsByWall.get(wallId) ?? []), area]);
  e.windows.forEach((w, i) => addOpening(w.attached_to_wall, requireQuantity(w.area, "ft2", `${P}.enclosure.windows[${i}].area`)));
  e.doors.forEach((d, i) => addOpening(d.attached_to_wall, requireQuantity(d.area, "ft2", `${P}.enclosure.doors[${i}].area`)));

  const exteriorWalls = new Set<string>();

  // ---------------------------------------------------------------- walls
  e.walls.forEach((w, i) => {
    const wp = `${P}.enclosure.walls[${i}]`;
    const ext = requireValue(w.exterior_adjacent_to, `${wp}.exterior_adjacent_to`);
    const int = requireValue(w.interior_adjacent_to, `${wp}.interior_adjacent_to`);
    if (int !== CONDITIONED && ext !== CONDITIONED) return; // e.g. attic gable wall: not a thermal boundary
    if (!(int === CONDITIONED && ext === "outside")) {
      throw new EngineInputError("unsupported", `wall ${w.id} between "${int}" and "${ext}" needs partition design temperatures (not in 0.1.0)`, { path: wp, method: MJ8_ENVELOPE_CONDUCTION.id });
    }
    exteriorWalls.add(w.id);
    const net = netArea(requireQuantity(w.area, "ft2", `${wp}.area`), openingsByWall.get(w.id) ?? []);
    const htm = exteriorWallHtm(
      {
        wallType: requireValue(w.wall_type, `${wp}.wall_type`),
        siding: requireValue(w.siding, `${wp}.siding`),
        assemblyR: requireQuantity(w.insulation_assembly_r_value, "h-ft2-F/Btu", `${wp}.insulation_assembly_r_value`),
        solarAbsorptance: requireQuantity(w.solar_absorptance, "fraction", `${wp}.solar_absorptance`),
      },
      dc,
    );
    methods.add(MJ8_ENVELOPE_CONDUCTION.id);
    components.push({ component_id: w.id, component_kind: "wall", method_id: MJ8_ENVELOPE_CONDUCTION.id, heating_sensible: htm.heating * net, cooling_sensible: htm.cooling * net, cooling_latent: 0 });
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
    const load = windowLoad(
      {
        area: requireQuantity(w.area, "ft2", `${wp}.area`),
        azimuthDeg: requireQuantity(w.azimuth, "degrees", `${wp}.azimuth`),
        ufactor: requireQuantity(w.ufactor, "Btu/h-ft2-F", `${wp}.ufactor`),
        shgc: requireQuantity(w.shgc, "fraction", `${wp}.shgc`),
        interiorShading: device,
        interiorShadingSummerCoverage: coverage,
        ...(overhang ? { overhang } : {}),
      },
      station.latitude,
      dc,
    );
    methods.add(MJ8_GLAZING.id);
    hourly.push(load.hourlyCoolingLoads);
    components.push({ component_id: w.id, component_kind: "window", method_id: MJ8_GLAZING.id, heating_sensible: load.heatingLoad, cooling_sensible: load.coolingSensibleLoad, cooling_latent: 0 });
  });

  // ---------------------------------------------------------------- doors
  e.doors.forEach((d, i) => {
    const dp = `${P}.enclosure.doors[${i}]`;
    if (!exteriorWalls.has(d.attached_to_wall)) {
      throw new EngineInputError("unsupported", `door ${d.id} is not on an exterior wall of conditioned space`, { path: dp, method: MJ8_ENVELOPE_CONDUCTION.id });
    }
    const area = requireQuantity(d.area, "ft2", `${dp}.area`);
    const htm = exteriorDoorHtm(requireQuantity(d.r_value, "h-ft2-F/Btu", `${dp}.r_value`), dc);
    methods.add(MJ8_ENVELOPE_CONDUCTION.id);
    components.push({ component_id: d.id, component_kind: "door", method_id: MJ8_ENVELOPE_CONDUCTION.id, heating_sensible: htm.heating * area, cooling_sensible: htm.cooling * area, cooling_latent: 0 });
  });

  // ---------------------------------------------------------------- floors and ceilings
  e.floors.forEach((f, i) => {
    const fp = `${P}.enclosure.floors[${i}]`;
    const ext = requireValue(f.exterior_adjacent_to, `${fp}.exterior_adjacent_to`);
    const int = requireValue(f.interior_adjacent_to, `${fp}.interior_adjacent_to`);
    if (int !== CONDITIONED && ext !== CONDITIONED) return;
    const isCeiling = f.floor_or_ceiling ? requireValue(f.floor_or_ceiling, `${fp}.floor_or_ceiling`) === "ceiling" : ATTICS.has(ext);
    if (!isCeiling || int !== CONDITIONED) {
      throw new EngineInputError("unsupported", `floor ${f.id} over "${ext}" needs buffer-space temperatures (not in 0.1.0)`, { path: fp, method: MJ8_ENVELOPE_CONDUCTION.id });
    }
    const area = requireQuantity(f.area, "ft2", `${fp}.area`);
    const r = requireQuantity(f.insulation_assembly_r_value, "h-ft2-F/Btu", `${fp}.insulation_assembly_r_value`);
    let htm;
    if (ATTICS.has(ext)) htm = atticCeilingHtm(r, atticTemps(ext), dc);
    else if (ext === "outside") htm = exteriorCeilingHtm(r, dc);
    else throw new EngineInputError("unsupported", `ceiling ${f.id} under "${ext}" is not in 0.1.0`, { path: fp, method: MJ8_ENVELOPE_CONDUCTION.id });
    methods.add(MJ8_ENVELOPE_CONDUCTION.id);
    components.push({ component_id: f.id, component_kind: "ceiling", method_id: MJ8_ENVELOPE_CONDUCTION.id, heating_sensible: htm.heating * area, cooling_sensible: htm.cooling * area, cooling_latent: 0 });
  });

  // ---------------------------------------------------------------- roofs (cathedral only; attic roofs set the attic temperature)
  e.roofs.forEach((r, i) => {
    const rp = `${P}.enclosure.roofs[${i}]`;
    const int = requireValue(r.interior_adjacent_to, `${rp}.interior_adjacent_to`);
    if (ATTICS.has(int)) return;
    if (int !== CONDITIONED) throw new EngineInputError("unsupported", `roof ${r.id} over "${int}" is not in 0.1.0`, { path: rp, method: MJ8_ENVELOPE_CONDUCTION.id });
    const area = requireQuantity(r.area, "ft2", `${rp}.area`);
    const htm = conditionedRoofHtm(
      {
        assemblyR: requireQuantity(r.insulation_assembly_r_value, "h-ft2-F/Btu", `${rp}.insulation_assembly_r_value`),
        roofType: requireValue(r.roof_type, `${rp}.roof_type`),
        solarAbsorptance: requireQuantity(r.solar_absorptance, "fraction", `${rp}.solar_absorptance`),
      },
      dc,
    );
    methods.add(MJ8_ENVELOPE_CONDUCTION.id);
    components.push({ component_id: r.id, component_kind: "roof", method_id: MJ8_ENVELOPE_CONDUCTION.id, heating_sensible: htm.heating * area, cooling_sensible: htm.cooling * area, cooling_latent: 0 });
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
    components.push({ component_id: s.id, component_kind: "slab", method_id: MJ8_SLAB_PERIMETER.id, heating_sensible: load.heatingLoad, cooling_sensible: 0, cooling_latent: 0 });
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
  components.push({ component_id: ai.id, component_kind: "infiltration", method_id: MJ8_INFILTRATION_BLOWER_DOOR.id, heating_sensible: il.heating, cooling_sensible: il.coolingSensible, cooling_latent: il.coolingLatent });

  // ---------------------------------------------------------------- internal gains
  const gains = internalGains({
    appliancesSensibleBtuh: requireQuantity(mj.internal_loads_sensible, "Btu/h", `${mjP}.internal_loads_sensible`),
    appliancesLatentBtuh: requireQuantity(mj.internal_loads_latent, "Btu/h", `${mjP}.internal_loads_latent`),
    occupants: requireQuantity(mj.number_of_occupants, "count", `${mjP}.number_of_occupants`),
  });
  methods.add(MJ8_INTERNAL_GAINS.id);
  components.push({ component_id: "internal-gains", component_kind: "internal_gain", method_id: MJ8_INTERNAL_GAINS.id, heating_sensible: 0, cooling_sensible: gains.coolingSensible, cooling_latent: gains.coolingLatent });

  // ---------------------------------------------------------------- AED excursion
  const excursion = aedExcursion(sumHourly(hourly));
  methods.add(MJ8_AED.id);
  components.push({ component_id: "aed-excursion", component_kind: "aed_excursion", method_id: MJ8_AED.id, heating_sensible: 0, cooling_sensible: excursion, cooling_latent: 0 });

  const sum = (pick: (c: ComponentLoad) => number) => components.reduce((s, c) => s + pick(c), 0);
  const preDuct: BlockLoad = { heating: sum((c) => c.heating_sensible), coolingSensible: sum((c) => c.cooling_sensible), coolingLatent: sum((c) => c.cooling_latent) };

  // ---------------------------------------------------------------- ducts
  const ducted = hvac.hvac_distributions.filter((d) => d.ducts.length > 0);
  if (ducted.length > 1) throw new EngineInputError("unsupported", "more than one ducted distribution system is not in 0.1.0", { path: `${P}.systems.hvac.hvac_distributions`, method: MJ8_DUCTS.id });
  const dist = ducted[0];
  if (dist) {
    const dp = `${P}.systems.hvac.hvac_distributions[${hvac.hvac_distributions.indexOf(dist)}]`;
    const fractionsCheck = (label: string, total: number) => {
      if (Math.abs(total - 1) > 1e-6) throw new EngineInputError("unsupported", `${label} load served sums to ${total}; 0.1.0 needs one system serving the whole house`, { path: `${P}.systems.hvac`, method: MJ8_DUCTS.id });
    };
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
    if (heatingEquipment) fractionsCheck("heating", heatServed);
    if (coolingEquipment) fractionsCheck("cooling", coolServed);

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
        if (ATTICS.has(location)) {
          const t = atticTemps(location);
          heat = t.heatF;
          cool = t.coolF;
        } else if (location === "outside") {
          heat = dc.heatingDesignTempF;
          cool = dc.coolingDesignTempF;
        } else {
          throw new EngineInputError("unsupported", `duct ${d.id} in "${location}" needs buffer-space design temperatures (not in 0.1.0)`, { path: kp, method: MJ8_DUCTS.id });
        }
        located.push({ area: ductArea, r, heat, cool, regain: ductRegainFactor(location), location });
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

    const dl = ductLoads(
      { supply: side("supply"), return: side("return"), heatingEquipment, coolingEquipment },
      { heating: preDuct.heating, coolingSensible: preDuct.coolingSensible, coolingLatent: preDuct.coolingLatent },
      dc,
      dc.outdoorHumidityRatio!,
    );
    methods.add(MJ8_DUCTS.id);
    if (!dl.converged) warnings.push({ code: "DUCT_LOAD_NOT_CONVERGED", message: "duct delivery-effectiveness iteration did not converge within 5 % after 50 iterations", path: dp });
    components.push({ component_id: dist.id, component_kind: "duct", method_id: MJ8_DUCTS.id, heating_sensible: dl.heating, cooling_sensible: dl.coolingSensible, cooling_latent: dl.coolingLatent });
  }

  const totals: BlockLoad = { heating: sum((c) => c.heating_sensible), coolingSensible: sum((c) => c.cooling_sensible), coolingLatent: sum((c) => c.cooling_latent) };
  if (derived.length > 0) {
    warnings.push({ code: "ENGINE_DERIVED_INPUTS", message: `derived from accepted inputs: ${derived.join("; ")}` });
  }
  return { totals, preDuct, components, methodIds: [...methods].sort(), derived, warnings, designConditions: dc };
}
