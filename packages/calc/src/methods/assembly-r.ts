/**
 * MJ8.construction.assembly_r: whole-assembly R-value of a wood-framed wall or attic ceiling
 * from its nominal layers, by the parallel-path method: 1/R = f / R_framing_path +
 * (1 − f) / R_cavity_path, each path the series sum of films, finishes, sheathing,
 * continuous insulation and either the stud or the cavity fill.
 *
 * This is the forward form of the oracle's own construction model (OpenStudio-HPXML v1.12.0
 * `constructions.rb` apply_wood_stud_wall 346 to 410, apply_wood_frame_floor_ceiling
 * 2742 to 2790, Construction#assembly_rvalue 3158 to 3180), with installation grade 1 (no
 * gap path). Verified against values the oracle's classes compute, and against the
 * oracle's inverse (pick_wood_stud_construction_set), in packages/calc/fixtures/oracle/assembly-r.json.
 *
 * The method takes every layer as an input. It does not choose a stud size, framing factor
 * or the split between between-joist and over-joist ceiling insulation: those are Assessment
 * inputs with provenance (WOOD_FRAMING_SETS lists the oracle's reference sets).
 *
 * Supported in 0.1.0: wood stud walls and wood-joist ceilings with gypsum or no interior
 * finish. Not supported: steel, CMU, SIP, ICF, double stud, cathedral roofs, radiant barriers.
 */
import { FRAMED, SIDING_R, STUD_ACTUAL_DEPTH_IN } from "./coefficients.js";
import { EngineInputError } from "./errors.js";

export const MJ8_ASSEMBLY_R = { id: "MJ8.construction.assembly_r", version: "0.1.0" } as const;
const M = MJ8_ASSEMBLY_R.id;

export interface FramedWallInput {
  studNominalIn: number;
  framingFactor: number;
  /** Nominal cavity insulation R; 0 means an empty, closed stud bay. */
  cavityR: number;
  /** Continuous insulation outboard of the studs (rigid foam). */
  continuousR: number;
  siding: string;
  interiorFinish: "gypsum board" | "none";
  /** OSB/plywood sheathing; the oracle's wall sets use 0.5 in. */
  sheathingThicknessIn: number;
}

export interface FramedCeilingInput {
  joistNominalIn: number;
  framingFactor: number;
  /** Insulation between the joists; 0 means an open, empty joist bay. */
  cavityR: number;
  /** Insulation over the joists (loose fill above the joist tops). Ignored when cavityR is 0, as in the oracle. */
  aboveJoistR: number;
  interiorFinish: "gypsum board" | "none";
}

export interface AssemblyR {
  method: typeof MJ8_ASSEMBLY_R;
  assemblyR: number;
  framingPathR: number;
  cavityPathR: number;
  nonCavityR: number;
}

function check(cond: boolean, message: string, path: string): void {
  if (!cond) throw new EngineInputError("out_of_range", message, { method: M, path });
}

function depth(nominal: number, path: string): number {
  const d = STUD_ACTUAL_DEPTH_IN[nominal];
  if (d === undefined) throw new EngineInputError("unsupported", `no actual depth for nominal 2x${nominal}`, { method: M, path });
  return d;
}

function interiorFinishR(finish: "gypsum board" | "none"): number {
  return finish === "gypsum board" ? FRAMED.interiorFinishThicknessIn / FRAMED.gypsumKIn : 0;
}

function parallel(framingFactor: number, framingPathR: number, cavityPathR: number): number {
  return 1 / (framingFactor / framingPathR + (1 - framingFactor) / cavityPathR);
}

export function framedWallAssemblyR(w: FramedWallInput): AssemblyR {
  check(w.framingFactor > 0 && w.framingFactor < 1, "framing factor must be in (0, 1)", "framingFactor");
  check(w.cavityR >= 0 && w.continuousR >= 0 && w.sheathingThicknessIn >= 0, "R-values and sheathing thickness must be non-negative", "cavityR");
  const sidingR = SIDING_R[w.siding];
  if (sidingR === undefined) throw new EngineInputError("unsupported", `siding "${w.siding}" has no exterior finish R`, { method: M, path: "siding" });
  const d = depth(w.studNominalIn, "studNominalIn");
  const nonCavityR =
    FRAMED.filmOutsideR + sidingR + w.continuousR + w.sheathingThicknessIn / FRAMED.woodKIn + interiorFinishR(w.interiorFinish) + FRAMED.filmIndoorWallR;
  const framingPathR = nonCavityR + d / FRAMED.woodKIn;
  const cavityPathR = nonCavityR + (w.cavityR > 0 ? w.cavityR : FRAMED.closedAirCavityR);
  return { method: MJ8_ASSEMBLY_R, assemblyR: parallel(w.framingFactor, framingPathR, cavityPathR), framingPathR, cavityPathR, nonCavityR };
}

export function framedCeilingAssemblyR(c: FramedCeilingInput): AssemblyR {
  check(c.framingFactor > 0 && c.framingFactor < 1, "framing factor must be in (0, 1)", "framingFactor");
  check(c.cavityR >= 0 && c.aboveJoistR >= 0, "R-values must be non-negative", "cavityR");
  const h = depth(c.joistNominalIn, "joistNominalIn");
  const above = c.cavityR > 0 ? c.aboveJoistR : 0;
  const nonCavityR = 2 * FRAMED.filmFloorAverageR + above + interiorFinishR(c.interiorFinish);
  const framingPathR = nonCavityR + h / FRAMED.woodKIn;
  const cavityPathR = nonCavityR + (c.cavityR > 0 ? c.cavityR : h / FRAMED.openAirCavityKIn);
  return { method: MJ8_ASSEMBLY_R, assemblyR: parallel(c.framingFactor, framingPathR, cavityPathR), framingPathR, cavityPathR, nonCavityR };
}
