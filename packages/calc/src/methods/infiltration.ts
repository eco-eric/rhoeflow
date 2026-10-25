/**
 * MJ8.infiltration.blower_door and MJ8.infiltration.tightness_class.
 *
 * Blower door: ACH50 or CFM50 → SLA (ANSI/RESNET/ICC 301-2022 Appendix C eq 16) → effective
 * leakage area → design cfm from stack and wind coefficients by stories and shielding class
 * with 15 mph heating / 7.5 mph cooling winds (hvac_sizing.rb 1461 to 1500; airflow.rb
 * 132 to 190, 2820 to 2850). Tightness class: Manual J Table 5A default ACH by leakiness,
 * stories and floor area × above-grade volume (hvac_sizing.rb 1501 to 1505, 4720 to 4793).
 *
 * Supported in 0.1.0: detached single-family (exposure factor 1.0, no height scaling), no
 * mechanical ventilation. Attached and multifamily units, and ventilation systems, throw
 * `unsupported`.
 */
import { DEFAULT_ACH_FLOOR_AREA_BINS, DEFAULT_ACH_SFD_COOLING, DEFAULT_ACH_SFD_HEATING, INFILTRATION, type LeakinessClass } from "./coefficients.js";
import type { DesignConditions } from "./design-conditions.js";
import { EngineInputError } from "./errors.js";
import { outdoorAirLoads, type AirflowLoads } from "./latent.js";

export const MJ8_INFILTRATION_BLOWER_DOOR = { id: "MJ8.infiltration.blower_door", version: "0.1.0" } as const;
export const MJ8_INFILTRATION_TIGHTNESS_CLASS = { id: "MJ8.infiltration.tightness_class", version: "0.1.0" } as const;

/** Flow at a different test pressure: q × (p_new / p_old)^n (airflow.rb 2843 to 2845). */
export function flowAtPressure(q: number, pOld: number, pNew: number, n = INFILTRATION.pressureExponent): number {
  return q * Math.pow(pNew / pOld, n);
}

/** Specific leakage area from ACH50 and average ceiling height (ft) (airflow.rb 2820 to 2822). */
export function slaFromAch50(ach50: number, avgCeilingHeightFt: number, n = INFILTRATION.pressureExponent): number {
  return (ach50 * 0.283316 * Math.pow(4, n)) / ((Math.pow(50, n) * 60 * 144) / avgCeilingHeightFt);
}

/** Default infiltration height: ceiling height × stories plus a rim joist per story boundary (defaults.rb 5800 to 5804). */
export function defaultInfiltrationHeightFt(avgCeilingHeightFt: number, storiesAboveGrade: number): number {
  return avgCeilingHeightFt * storiesAboveGrade + Math.max(storiesAboveGrade - 1, 0) * INFILTRATION.rimJoistFt;
}

export interface BlowerDoorInput {
  /** Measured leakage and its unit; house pressure is the test pressure (Pa). */
  airLeakage: number;
  unit: "ACH50" | "cfm50";
  housePressurePa: number;
  conditionedFloorAreaFt2: number;
  infiltrationVolumeFt3: number;
  storiesAboveGrade: number;
  /** Manual J shielding class 1 (exposed) to 5 (well shielded); the oracle defaults "normal" to 4. */
  shieldingClass: 1 | 2 | 3 | 4 | 5;
  facilityType: string;
  hasFireplace?: boolean;
}

export interface InfiltrationDesign {
  method: { id: string; version: string };
  ach50: number;
  sla: number;
  elaIn2: number;
  stackCoefficient: number;
  windCoefficient: number;
  heatingCfm: number;
  coolingCfm: number;
}

export function blowerDoorInfiltration(input: BlowerDoorInput, dc: DesignConditions): InfiltrationDesign {
  const M = MJ8_INFILTRATION_BLOWER_DOOR.id;
  if (input.facilityType !== "single-family detached" && input.facilityType !== "manufactured home") {
    throw new EngineInputError("unsupported", `facility type "${input.facilityType}" needs the exterior-exposure and height scaling not in 0.1.0`, { method: M });
  }
  if (!(input.airLeakage > 0) || !(input.conditionedFloorAreaFt2 > 0) || !(input.infiltrationVolumeFt3 > 0) || !(input.storiesAboveGrade >= 1)) {
    throw new EngineInputError("out_of_range", "air leakage, floor area, volume and stories must be positive", { method: M });
  }
  const avgCeilingHeight = input.infiltrationVolumeFt3 / input.conditionedFloorAreaFt2;
  let ach50: number;
  if (input.unit === "ACH50") {
    ach50 = flowAtPressure(input.airLeakage, input.housePressurePa, 50);
  } else {
    const achAtTest = (input.airLeakage * 60) / input.infiltrationVolumeFt3;
    ach50 = flowAtPressure(achAtTest, input.housePressurePa, 50);
  }
  const sla = slaFromAch50(ach50, avgCeilingHeight);
  const elaIn2 = sla * input.conditionedFloorAreaFt2 * 1.0 * 144; // a_ext = 1.0 for detached
  const n = input.storiesAboveGrade;
  const stackCoefficient = INFILTRATION.stackCoefficientPerStory * n;
  const windCoefficient = (INFILTRATION.windCoefficientBase - INFILTRATION.windCoefficientPerClass * (input.shieldingClass - 3)) * Math.pow(n, INFILTRATION.windCoefficientStoriesExponent);
  const coolingCfm = elaIn2 * Math.sqrt(stackCoefficient * dc.ctd + windCoefficient * INFILTRATION.windSpeedCoolingMph ** 2);
  let heatingCfm = elaIn2 * Math.sqrt(stackCoefficient * dc.htd + windCoefficient * INFILTRATION.windSpeedHeatingMph ** 2);
  if (input.hasFireplace) heatingCfm += INFILTRATION.fireplaceHeatingCfm;
  return { method: MJ8_INFILTRATION_BLOWER_DOOR, ach50, sla, elaIn2, stackCoefficient, windCoefficient, heatingCfm, coolingCfm };
}

export interface TightnessClassInput {
  leakiness: LeakinessClass;
  conditionedFloorAreaFt2: number;
  aboveGradeVolumeFt3: number;
  storiesAboveGrade: number;
  facilityType: string;
  hasFireplace?: boolean;
}

/** The manual, no-test path: Table 5A ACH for detached houses by leakiness, stories and area. */
export function tightnessClassInfiltration(input: TightnessClassInput): Pick<InfiltrationDesign, "method" | "heatingCfm" | "coolingCfm"> & { achHeating: number; achCooling: number } {
  const M = MJ8_INFILTRATION_TIGHTNESS_CLASS.id;
  if (input.facilityType !== "single-family detached") {
    throw new EngineInputError("unsupported", `Table 5B (attached and multifamily) is not in 0.1.0`, { method: M });
  }
  const bin = DEFAULT_ACH_FLOOR_AREA_BINS.findIndex((max) => input.conditionedFloorAreaFt2 <= max);
  const stories = input.storiesAboveGrade < 2 ? 0 : 1;
  const achHeating = DEFAULT_ACH_SFD_HEATING[stories]![input.leakiness][bin]!;
  const achCooling = DEFAULT_ACH_SFD_COOLING[stories]![input.leakiness][bin]!;
  let heatingCfm = (achHeating * input.aboveGradeVolumeFt3) / 60;
  const coolingCfm = (achCooling * input.aboveGradeVolumeFt3) / 60;
  if (input.hasFireplace) heatingCfm += INFILTRATION.fireplaceHeatingCfm;
  return { method: MJ8_INFILTRATION_TIGHTNESS_CLASS, achHeating, achCooling, heatingCfm, coolingCfm };
}

/** Infiltration loads from the design cfm (no mechanical ventilation: net cfm = infiltration cfm). */
export function infiltrationLoads(design: Pick<InfiltrationDesign, "heatingCfm" | "coolingCfm">, dc: DesignConditions): AirflowLoads {
  return outdoorAirLoads(design.heatingCfm, design.coolingCfm, dc);
}
