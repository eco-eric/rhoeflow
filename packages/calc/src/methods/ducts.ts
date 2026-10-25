/**
 * MJ8.ducts: duct conduction and leakage loads by the ASHRAE Standard 152 delivery
 * effectiveness method, iterated with the system airflow because leakage fractions and the
 * heat-exchanger temperature rise depend on it.
 *
 * Structure follows OpenStudio-HPXML v1.12.0 `hvac_sizing.rb` 1653 to 1690 (supply and
 * leaving air temperatures), 1765 to 1830 (regain), 1846 to 2010 (iteration), 3825 to 3887
 * (airflow from load), 3951 to 4219 (delivery effectiveness), and `defaults.rb` 6046 to 6075
 * and 6598 to 6645 (effective R and surface-area defaults).
 *
 * Supported in 0.1.0: one ducted system with supply and return in attics, conditioned space,
 * garages or outside, leakage to outside as a fraction or CFM25/CFM50, furnace or heat-pump
 * heating, central AC or heat-pump cooling. Not supported: Manual J Table 7 duct factors,
 * basement and crawlspace ducts (regain needs insulation state), evaporative coolers,
 * user-specified design airflows.
 */
import { DUCTS, DUCT_REGAIN_FACTOR } from "./coefficients.js";
import type { DesignConditions } from "./design-conditions.js";
import { EngineInputError } from "./errors.js";
import { enthalpyBtuPerLb, AIR } from "./psychrometrics.js";
import { flowAtPressure } from "./infiltration.js";
import { latentLoadFromCfm } from "./latent.js";

export const MJ8_DUCTS = { id: "MJ8.ducts", version: "0.1.0" } as const;
const M = MJ8_DUCTS.id;

/** Default duct surface area (ft2) from floor area served, as the oracle fills `DuctSurfaceArea` (defaults.rb 6598 to 6614). */
export function defaultDuctSurfaceArea(side: "supply" | "return", cfaServed: number, fractionDuctArea: number, returnRegisters: number): number {
  if (side === "supply") return DUCTS.supplyAreaPerCfa * cfaServed * fractionDuctArea;
  const bR = returnRegisters < 6 ? DUCTS.returnAreaPerCfaPerRegister * returnRegisters : DUCTS.returnAreaPerCfaMax;
  return bR * cfaServed * fractionDuctArea;
}

/** Effective R including air films and round-duct geometry, rounded to 0.01 (defaults.rb 6046 to 6075). */
export function ductEffectiveRValue(rNominal: number, side: "supply" | "return", fractionRectangular?: number): number {
  if (rNominal <= 0) return DUCTS.uninsulatedEffectiveR;
  const fRect = fractionRectangular ?? (side === "supply" ? DUCTS.defaultFractionRectangularSupply : DUCTS.defaultFractionRectangularReturn);
  const d = side === "supply" ? DUCTS.supplyDiameterIn : DUCTS.returnDiameterIn;
  const fRound = 1 - fRect;
  const rIntRound = 0.3429 * Math.pow(d, 0.1974);
  const t = rNominal / DUCTS.insulationRPerInch;
  const rActual = (rNominal / t) * (d / 2) * Math.log(1 + (2 * t) / d);
  const rRect = DUCTS.interiorFilmRectR + rNominal + DUCTS.exteriorFilmR;
  const rRound = rIntRound + rActual + DUCTS.exteriorFilmR * (d / (d + 2 * t));
  const rEff = 1 / (fRect / rRect + fRound / rRound);
  return Math.round(rEff * 100) / 100;
}

export function ductRegainFactor(location: string): number {
  const f = DUCT_REGAIN_FACTOR[location];
  if (f === undefined) throw new EngineInputError("unsupported", `duct location "${location}" needs the basement/crawlspace regain rules (not in 0.1.0)`, { method: M });
  return f;
}

/** Leaving air temperature for cooling from the sensible heat ratio (lines 1664 to 1675). */
export function leavingAirTempF(coolingSensible: number, coolingTotal: number): number {
  const shr = Math.min(coolingSensible / coolingTotal, 1);
  if (shr < DUCTS.shrLow) return DUCTS.leavingAirTempLowShrF;
  if (shr < DUCTS.shrHigh) {
    return ((DUCTS.leavingAirTempHighShrF - DUCTS.leavingAirTempLowShrF) / (DUCTS.shrHigh - DUCTS.shrLow)) * (shr - DUCTS.shrLow) + DUCTS.leavingAirTempLowShrF;
  }
  return DUCTS.leavingAirTempHighShrF;
}

export type HeatingEquipment = "furnace" | "heat pump";
export type CoolingEquipment = "central air conditioner" | "heat pump";

export function supplyAirTempF(equipment: HeatingEquipment): number {
  return equipment === "heat pump" ? DUCTS.supplyAirTempHeatPumpF : DUCTS.supplyAirTempFurnaceF;
}

/** System airflow from a load: cfm/ton (rounded) × tons, rounded to a whole cfm (lines 3825 to 3887). */
export function airflowFromLoad(loadBtuh: number, cfmPerTon: number): number {
  return Math.round(Math.round(cfmPerTon) * (loadBtuh / 12000));
}

export interface DuctLeakage {
  kind: "fraction" | "cfm25" | "cfm50";
  value: number;
}

export interface DuctSide {
  surfaceAreaFt2: number;
  effectiveR: number;
  location: string;
  /** Area-weighted regain when the side spans several locations; overrides the lookup by `location`. */
  regainFactor?: number;
  ambientHeatingF: number;
  ambientCoolingF: number;
  leakageToOutside: DuctLeakage;
}

export interface DuctSystemInput {
  supply: DuctSide;
  return: DuctSide;
  heatingEquipment: HeatingEquipment | null;
  coolingEquipment: CoolingEquipment | null;
}

export interface PreDuctLoads {
  heating: number;
  coolingSensible: number;
  coolingLatent: number;
}

export interface DuctLoads {
  method: typeof MJ8_DUCTS;
  heating: number;
  coolingSensible: number;
  coolingLatent: number;
  heatingCfm: number | null;
  coolingCfm: number | null;
  deliveryEffectivenessHeating: number | null;
  deliveryEffectivenessCooling: number | null;
  iterationsHeating: number;
  iterationsCooling: number;
  converged: boolean;
}

function leakageCfm(l: DuctLeakage, systemCfm: number): number {
  switch (l.kind) {
    case "fraction":
      return l.value * systemCfm;
    case "cfm25":
      return l.value;
    case "cfm50":
      return flowAtPressure(l.value, 50, 25);
  }
}

function conductionFractions(aS: number, aR: number, rS: number, rR: number, cfm: number, rho: number) {
  const bS = Math.exp(-aS / (60 * cfm * rho * AIR.cp * rS));
  const bR = Math.exp(-aR / (60 * cfm * rho * AIR.cp * rR));
  return { bS, bR };
}

function deCorrected(de: number, fS: number, fR: number, bR: number, aR: number, dtR: number, dtE: number): number {
  const corr = de + fS * (1 - de) - ((fS - fR - bR * (aR * fS - fR)) * dtR) / dtE;
  return Math.min(Math.max(corr, DUCTS.deFloor), DUCTS.deCeiling);
}

/**
 * Duct loads added to the pre-duct zone loads. `outdoorHumidityRatio` is the cooling design
 * humidity ratio of outdoor air, used for the return-duct ambient enthalpy.
 */
export function ductLoads(system: DuctSystemInput, loads: PreDuctLoads, dc: DesignConditions, outdoorHumidityRatio: number): DuctLoads {
  const rho = dc.indoorAirDensityLbPerFt3;
  const aS = system.supply.surfaceAreaFt2;
  const aR = system.return.surfaceAreaFt2;
  const fS = system.supply.regainFactor ?? ductRegainFactor(system.supply.location);
  const fR = system.return.regainFactor ?? ductRegainFactor(system.return.location);
  let converged = true;

  // Heating
  let heating = 0;
  let heatingCfm: number | null = null;
  let deHeat: number | null = null;
  let itH = 0;
  if (system.heatingEquipment && loads.heating > 0) {
    const tSupplyAmb = system.supply.ambientHeatingF;
    const tReturnAmb = system.return.ambientHeatingF;
    const cfmPerTon = system.heatingEquipment === "furnace" ? DUCTS.cfmPerTonFurnace : DUCTS.cfmPerTonDx;
    let delta = 1;
    let de: number | null = null;
    let next = loads.heating;
    for (itH = 1; itH <= DUCTS.maxIterations; itH++) {
      if (Math.abs(delta) <= DUCTS.convergenceDelta) break;
      heatingCfm = airflowFromLoad(next, cfmPerTon);
      const qS = leakageCfm(system.supply.leakageToOutside, heatingCfm);
      const qR = leakageCfm(system.return.leakageToOutside, heatingCfm);
      const { bS, bR } = conductionFractions(aS, aR, system.supply.effectiveR, system.return.effectiveR, heatingCfm, rho);
      const alphaS = (heatingCfm - qS) / heatingCfm;
      const alphaR = (heatingCfm - qR) / heatingCfm;
      const dtE = next / (60 * heatingCfm * rho * AIR.cp);
      const dtS = dc.heatingSetpointF - tSupplyAmb;
      const dtR = dc.heatingSetpointF - tReturnAmb;
      const deRaw = alphaS * bS - alphaS * bS * (1 - alphaR * bR) * (dtR / dtE) - alphaS * (1 - bS) * (dtS / dtE);
      let deNow = deCorrected(deRaw, fS, fR, bR, alphaR, dtR, dtE);
      if (de !== null) deNow = (deNow + de) / 2;
      de = deNow;
      const prev = next;
      next = loads.heating / de;
      delta = (next - prev) / prev;
      if (itH === DUCTS.maxIterations && Math.abs(delta) > 0.05) converged = false;
    }
    heating = next - loads.heating;
    deHeat = de;
  }

  // Cooling
  let coolingSensible = 0;
  let coolingLatent = 0;
  let coolingCfm: number | null = null;
  let deCool: number | null = null;
  let itC = 0;
  if (system.coolingEquipment && loads.coolingSensible > 0) {
    const initSens = loads.coolingSensible;
    const initLat = loads.coolingLatent;
    const lat = leavingAirTempF(initSens, initSens + initLat);
    const tSupplyAmb = system.supply.ambientCoolingF;
    const tReturnAmb = system.return.ambientCoolingF;
    const hR = enthalpyBtuPerLb(tReturnAmb, outdoorHumidityRatio);
    const hIn = dc.coolIndoorEnthalpyBtuPerLb;
    let delta = 1;
    let de: number | null = null;
    let totNext = initSens + initLat;
    coolingCfm = airflowFromLoad(totNext, DUCTS.cfmPerTonDx);
    let qR = leakageCfm(system.return.leakageToOutside, coolingCfm);
    let sensNext = initSens;
    let latNext = initLat;
    for (itC = 1; itC <= DUCTS.maxIterations; itC++) {
      if (Math.abs(delta) <= DUCTS.convergenceDelta) break;
      // Latent from return leakage, then sensible as the remainder (lines 4132 to 4140).
      const latNow = initLat + Math.max(0, latentLoadFromCfm(qR, dc));
      const sensNow = totNext - latNow;
      const totNow = latNow + sensNow;
      coolingCfm = airflowFromLoad(totNow, DUCTS.cfmPerTonDx);
      const qS = leakageCfm(system.supply.leakageToOutside, coolingCfm);
      qR = leakageCfm(system.return.leakageToOutside, coolingCfm);
      const { bS, bR } = conductionFractions(aS, aR, system.supply.effectiveR, system.return.effectiveR, coolingCfm, rho);
      const alphaS = (coolingCfm - qS) / coolingCfm;
      const alphaR = (coolingCfm - qR) / coolingCfm;
      const dtE = sensNow / (60 * coolingCfm * rho * AIR.cp);
      const dtR = dc.coolingSetpointF - tReturnAmb;
      const deRaw =
        ((alphaS * 60 * coolingCfm * rho) / -totNow) *
        (-totNow / (60 * coolingCfm * rho) + (1 - alphaR) * (hR - hIn) + alphaR * AIR.cp * (bR - 1) * dtR + AIR.cp * (bS - 1) * (lat - tSupplyAmb));
      let deNow = deCorrected(deRaw, fS, fR, bR, alphaR, dtR, -dtE);
      if (de !== null) deNow = (deNow + de) / 2;
      de = deNow;
      const prev = totNext;
      sensNext = initSens / de;
      latNext = initLat / de;
      totNext = sensNext + latNext;
      delta = (totNext - prev) / prev;
      if (itC === DUCTS.maxIterations && Math.abs(delta) > 0.05) converged = false;
    }
    coolingSensible = sensNext - initSens;
    coolingLatent = latNext - initLat;
    deCool = de;
  }

  return {
    method: MJ8_DUCTS,
    heating,
    coolingSensible,
    coolingLatent,
    heatingCfm,
    coolingCfm,
    deliveryEffectivenessHeating: deHeat,
    deliveryEffectivenessCooling: deCool,
    iterationsHeating: itH,
    iterationsCooling: itC,
    converged,
  };
}
