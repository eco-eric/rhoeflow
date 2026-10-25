/**
 * MJ8.units (UNT-001, MTH-002): typed quantities and the conversions the engine uses.
 *
 * IP units throughout. Conversion constants follow the reference engine
 * (OpenStudio-HPXML v1.12.0, `unit_conversions.rb`) so differential tests isolate method
 * differences from constant differences; where the engine's constant departs from the
 * textbook value the departure is noted inline.
 */
import type { Field, Unit } from "@rhoeflow/schema";
import { isAcceptedInput } from "@rhoeflow/schema";
import { EngineInputError } from "./errors.js";

export const MJ8_UNITS = { id: "MJ8.units", version: "0.1.0" } as const;

// Temperature
export const RANKINE_OFFSET = 459.67;
export const fToR = (f: number): number => f + RANKINE_OFFSET;
export const fToC = (f: number): number => ((f - 32) * 5) / 9;
export const cToF = (c: number): number => (c * 9) / 5 + 32;
/** A temperature difference, not a temperature. */
export const deltaCToDeltaF = (d: number): number => (d * 9) / 5;

// Length
export const M_PER_FT = 0.3048;
export const mToFt = (m: number): number => m / M_PER_FT;
export const inToFt = (inches: number): number => inches / 12;

// Pressure and energy
/** Reference engine uses 14.692 psi per atm; ASHRAE standard atmosphere is 14.696. Kept at 14.692 to match the oracle. */
export const PSI_PER_ATM = 14.692;
/** Btu/ft3 per atm, used for air density (reference engine value). */
export const BTU_PER_FT3_PER_ATM = 2.719;
export const J_PER_BTU = 1055.05585262;
export const KG_PER_LBM = 0.45359237;
export const GRAINS_PER_LBM = 7000;

export const humidityRatioToGrains = (w: number): number => w * GRAINS_PER_LBM;
export const grainsToHumidityRatio = (gr: number): number => gr / GRAINS_PER_LBM;
export const btuhToTons = (btuh: number): number => btuh / 12000;
export const tonsToBtuh = (tons: number): number => tons * 12000;

/** U-factor from an R-value; R must be positive. */
export function uFromR(r: number, path?: string): number {
  if (!(r > 0) || !Number.isFinite(r)) {
    throw new EngineInputError("out_of_range", `R-value must be a positive finite number, got ${r}`, { path, method: MJ8_UNITS.id });
  }
  return 1 / r;
}

/**
 * Read a numeric engineering input from a provenance field. Refuses proposed or unknown
 * fields, missing values, and unit mismatches. This is the only door from Assessment data
 * into a method: a method never reads `field.value` directly.
 */
export function requireQuantity<U extends Unit>(field: (Field<number> & { unit?: Unit }) | undefined, unit: U, path: string): number {
  if (field === undefined) {
    throw new EngineInputError("missing_input", `${path} is required`, { path, method: MJ8_UNITS.id });
  }
  if (!isAcceptedInput(field)) {
    const why = field.state === "unknown" ? `unknown (${field.reason})` : `${field.state} (not yet accepted)`;
    throw new EngineInputError("unaccepted_input", `${path} is ${why}`, { path, method: MJ8_UNITS.id });
  }
  if (field.value === null || typeof field.value !== "number" || !Number.isFinite(field.value)) {
    throw new EngineInputError("missing_input", `${path} has no finite numeric value`, { path, method: MJ8_UNITS.id });
  }
  if (field.unit !== unit) {
    throw new EngineInputError("unit_mismatch", `${path} is in ${String(field.unit)}, expected ${unit}`, { path, method: MJ8_UNITS.id });
  }
  return field.value;
}

/** Same door for non-numeric accepted inputs (enums, booleans). */
export function requireValue<T>(field: Field<T> | undefined, path: string): T {
  if (field === undefined) {
    throw new EngineInputError("missing_input", `${path} is required`, { path, method: MJ8_UNITS.id });
  }
  if (!isAcceptedInput(field)) {
    const why = field.state === "unknown" ? `unknown (${field.reason})` : `${field.state} (not yet accepted)`;
    throw new EngineInputError("unaccepted_input", `${path} is ${why}`, { path, method: MJ8_UNITS.id });
  }
  if (field.value === null || field.value === undefined) {
    throw new EngineInputError("missing_input", `${path} has no value`, { path, method: MJ8_UNITS.id });
  }
  return field.value as T;
}
