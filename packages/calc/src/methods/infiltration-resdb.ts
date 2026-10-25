/**
 * RHOE.infiltration.resdb_ach50: ACH50 from a qualitative leakiness answer (very tight / tight /
 * average / leaky / very leaky) for houses with no blower-door test (WO-03 B8, quick-pass Q11).
 *
 * The average-house leakage comes from the LBNL ResDB regression (normalized leakage from floor
 * area, height, vintage, IECC zone, foundation type and duct location), as implemented by the
 * reference engine, OpenStudio-HPXML v1.12.0 `defaults.rb` 5912 to 6031; the leakiness multiplier
 * then scales it. SLA to ACH50 per ANSI/RESNET/ICC 301-2022 Addendum C eq 15 (`airflow.rb` 2832 to
 * 2834). Coefficients in coefficients.ts (`RESDB_INFILTRATION`), same provenance policy as the
 * other transcribed tables.
 *
 * This is a RhoeFlow method, not a Manual J one: it produces an input (a `derived` ACH50 with this
 * method as its source), which MJ8.infiltration.blower_door then consumes.
 */
import { RESDB_INFILTRATION, type LeakinessDescription } from "./coefficients.js";
import type { Assessment } from "@rhoeflow/schema";
import { EngineInputError } from "./errors.js";
import { requireQuantity, requireValue } from "./units.js";

export const RHOE_INFILTRATION_RESDB = { id: "RHOE.infiltration.resdb_ach50", version: "0.1.0" } as const;
const M = RHOE_INFILTRATION_RESDB.id;

/** HPXML foundation types the regression distinguishes. */
export type ResdbFoundationType =
  | "slab-on-grade"
  | "vented crawlspace"
  | "unvented crawlspace"
  | "conditioned crawlspace"
  | "conditioned basement"
  | "unconditioned basement"
  | "ambient";

export interface ResdbInput {
  conditionedFloorAreaFt2: number;
  storiesAboveGrade: number;
  yearBuilt: number;
  averageCeilingHeightFt: number;
  infiltrationVolumeFt3: number;
  ieccClimateZone: string;
  /** Fractions of foundation area by type; must sum to 1 (or be empty for no foundation). */
  foundationFractions: Partial<Record<ResdbFoundationType, number>>;
  /**
   * Fractions of duct area by HPXML location, weighted by the share of load each ducted system
   * serves. Whatever is not ducted (ductless systems) counts as ducts in conditioned space, the
   * way the oracle does it (defaults.rb 1214 to 1222).
   */
  ductLocationFractions: Record<string, number>;
  leakiness: LeakinessDescription;
  /** Professionally air sealed (a Home Energy Score input). */
  airSealed?: boolean;
}

function vintageCoefficient(year: number): number {
  for (const [upTo, c] of RESDB_INFILTRATION.vintage) if (year <= upTo) return c;
  return RESDB_INFILTRATION.vintageFrom2000;
}

const C_CONDITIONED = new Set(["conditioned space", "basement - conditioned", "crawlspace - conditioned", "outside"]);
const C_UNVENTED_BUFFER = new Set(["attic - unvented", "basement - unconditioned", "garage", "crawlspace - unvented"]);
const C_VENTED = new Set(["attic - vented", "crawlspace - vented"]);

export function resdbAch50(x: ResdbInput): number {
  for (const [k, v] of Object.entries(x)) {
    if (typeof v === "number" && !(Number.isFinite(v) && v >= 0)) throw new EngineInputError("out_of_range", `${k} must be a non-negative number`, { method: M, path: k });
  }
  if (!(x.conditionedFloorAreaFt2 > 0 && x.storiesAboveGrade >= 1 && x.infiltrationVolumeFt3 > 0)) {
    throw new EngineInputError("out_of_range", "floor area, stories and volume must be positive", { method: M });
  }
  const c = RESDB_INFILTRATION;
  const cIecc = c.ieccZone[x.ieccClimateZone];
  if (cIecc === undefined) throw new EngineInputError("unsupported", `IECC zone ${x.ieccClimateZone} has no ResDB coefficient`, { method: M, path: "ieccClimateZone" });

  let cFoundation = 0;
  for (const [type, frac] of Object.entries(x.foundationFractions)) {
    const k = c.foundation[type as ResdbFoundationType];
    if (k === undefined) throw new EngineInputError("unsupported", `foundation type "${type}" has no ResDB coefficient`, { method: M });
    cFoundation += k * (frac ?? 0);
  }

  const ducts = { ...x.ductLocationFractions };
  const ductSum = Object.values(ducts).reduce((s, v) => s + v, 0);
  if (ductSum > 1.0001) throw new EngineInputError("out_of_range", `duct location fractions sum to ${ductSum}`, { method: M });
  if (ductSum < 1) ducts["conditioned space"] = (ducts["conditioned space"] ?? 0) + (1 - ductSum);
  let cDuct = 0;
  for (const [location, frac] of Object.entries(ducts)) {
    if (C_CONDITIONED.has(location)) cDuct += c.duct.conditioned * frac;
    else if (C_UNVENTED_BUFFER.has(location)) cDuct += c.duct.unventedBuffer * frac;
    else if (C_VENTED.has(location)) cDuct += c.duct.vented * frac;
    else throw new EngineInputError("unsupported", `duct location "${location}" has no ResDB coefficient`, { method: M });
  }

  const floorAreaM2 = x.conditionedFloorAreaFt2 * 0.09290304;
  const heightM = x.storiesAboveGrade * x.averageCeilingHeightFt * 0.3048 + 0.5;
  const nl =
    Math.exp(floorAreaM2 * c.floorArea + heightM * c.height + (x.airSealed ? c.sealed : 0) + vintageCoefficient(x.yearBuilt) + cIecc + cFoundation + cDuct) *
    c.leakinessMultiplier[x.leakiness];
  const sla = nl / (1000 * x.storiesAboveGrade ** 0.3);
  const n = c.pressureExponent;
  const avgCeil = x.infiltrationVolumeFt3 / x.conditionedFloorAreaFt2;
  return (sla / (0.283316 * 4 ** n)) * ((50 ** n * 60 * 144) / avgCeil);
}

/**
 * Regression inputs from an Assessment, gathered the way the oracle gathers them
 * (defaults.rb 1175 to 1233): foundation fractions from the floor and slab area inside each
 * foundation, duct fractions from each ducted system's duct areas weighted by the load it serves.
 */
export function resdbInputFromAssessment(a: Assessment, leakiness: LeakinessDescription): ResdbInput {
  const b = a.building;
  const P = "building";
  const bc = b.building_construction;
  const cfa = requireQuantity(bc.conditioned_floor_area, "ft2", `${P}.building_construction.conditioned_floor_area`);
  const height = requireQuantity(bc.average_ceiling_height, "ft", `${P}.building_construction.average_ceiling_height`);
  const volume = bc.conditioned_building_volume ? requireQuantity(bc.conditioned_building_volume, "ft3", `${P}.building_construction.conditioned_building_volume`) : cfa * height;

  const FOUNDATION_LOCATION: Record<string, string> = {
    "slab-on-grade": "conditioned space",
    ambient: "outside",
    "conditioned basement": "basement - conditioned",
    "unconditioned basement": "basement - unconditioned",
    "unvented crawlspace": "crawlspace - unvented",
    "vented crawlspace": "crawlspace - vented",
    "conditioned crawlspace": "crawlspace - conditioned",
  };
  const fnd: Partial<Record<ResdbFoundationType, number>> = {};
  b.enclosure.foundations.forEach((f, i) => {
    const t = requireValue(f.foundation_type, `${P}.enclosure.foundations[${i}].foundation_type`) as ResdbFoundationType;
    const loc = FOUNDATION_LOCATION[t];
    let area = 0;
    for (const s of [...b.enclosure.floors, ...b.enclosure.slabs]) if (s.interior_adjacent_to.value === loc && s.area.value !== null) area += s.area.value;
    fnd[t] = (fnd[t] ?? 0) + area;
  });
  const fndSum = Object.values(fnd).reduce((s, v) => s + (v ?? 0), 0);
  if (fndSum > 0) for (const k of Object.keys(fnd) as ResdbFoundationType[]) fnd[k] = fnd[k]! / fndSum;

  const hvac = b.systems.hvac;
  const ducts: Record<string, number> = {};
  for (const d of hvac.hvac_distributions) {
    if (d.ducts.length === 0) continue;
    let heat = 0;
    let cool = 0;
    for (const h of hvac.heat_pumps) if (h.distribution_system === d.id) {
      heat += h.fraction_heat_load_served.value ?? 0;
      cool += h.fraction_cool_load_served.value ?? 0;
    }
    for (const h of hvac.heating_systems) if (h.distribution_system === d.id) heat += h.fraction_heat_load_served.value ?? 0;
    for (const c of hvac.cooling_systems) if (c.distribution_system === d.id) cool += c.fraction_cool_load_served.value ?? 0;
    const hvacFrac = (heat + cool) / 2;
    const fracOf = (x: (typeof d.ducts)[number]) => requireQuantity(x.duct_fraction_area, "fraction", `${P}.systems.hvac.hvac_distributions[].ducts[].duct_fraction_area`);
    const total = d.ducts.reduce((s, x) => s + fracOf(x), 0);
    const supply = d.ducts.filter((x) => x.duct_type.value === "supply").reduce((s, x) => s + fracOf(x), 0) / total;
    const ret = d.ducts.filter((x) => x.duct_type.value === "return").reduce((s, x) => s + fracOf(x), 0) / total;
    for (const x of d.ducts) {
      const loc = requireValue(x.duct_location, `${P}.systems.hvac.hvac_distributions[].ducts[].duct_location`);
      ducts[loc] = (ducts[loc] ?? 0) + fracOf(x) * (x.duct_type.value === "supply" ? supply : ret) * hvacFrac;
    }
  }

  return {
    conditionedFloorAreaFt2: cfa,
    storiesAboveGrade: requireQuantity(bc.number_of_conditioned_floors_above_grade, "count", `${P}.building_construction.number_of_conditioned_floors_above_grade`),
    yearBuilt: requireQuantity(bc.year_built, "year", `${P}.building_construction.year_built`),
    averageCeilingHeightFt: height,
    infiltrationVolumeFt3: volume,
    ieccClimateZone: requireValue(b.climate_and_risk_zones.iecc_climate_zone, `${P}.climate_and_risk_zones.iecc_climate_zone`),
    foundationFractions: fnd,
    ductLocationFractions: ducts,
    leakiness,
  };
}
