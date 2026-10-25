/**
 * MJ8.latent: the sensible and latent airflow load relations shared by infiltration,
 * ventilation and duct leakage: sensible = 1.1 × ACF × cfm × ΔT, latent = 0.68 × ACF × cfm ×
 * grains (hvac_sizing.rb 1546 to 1548, 4132 to 4140). Altitude is carried by the ACF.
 */
import { INFILTRATION } from "./coefficients.js";
import type { DesignConditions } from "./design-conditions.js";

export const MJ8_LATENT = { id: "MJ8.latent", version: "0.1.0" } as const;

export function sensibleLoadFromCfm(cfm: number, deltaTF: number, dc: DesignConditions): number {
  return INFILTRATION.sensibleFactor * dc.acf * cfm * deltaTF;
}

export function latentLoadFromCfm(cfm: number, dc: DesignConditions): number {
  return INFILTRATION.latentFactor * dc.acf * cfm * dc.designGrains;
}

export interface AirflowLoads {
  heating: number;
  coolingSensible: number;
  coolingLatent: number;
}

/** Loads for an air exchange with outdoors at the heating and cooling design cfm. */
export function outdoorAirLoads(heatingCfm: number, coolingCfm: number, dc: DesignConditions): AirflowLoads {
  return {
    heating: sensibleLoadFromCfm(heatingCfm, dc.htd, dc),
    coolingSensible: sensibleLoadFromCfm(coolingCfm, dc.ctd, dc),
    coolingLatent: latentLoadFromCfm(coolingCfm, dc),
  };
}
