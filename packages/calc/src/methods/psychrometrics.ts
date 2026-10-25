/**
 * Moist-air psychrometrics for design conditions. Equations are ASHRAE Handbook
 * Fundamentals 2009 chapter 1 (Hyland-Wexler saturation pressure, humidity ratio,
 * wet-bulb relation, enthalpy). Property constants match the reference engine
 * (OpenStudio-HPXML v1.12.0 `materials.rb`, "Source: EES") so differential tests
 * isolate method differences.
 *
 * Wet-bulb and saturation temperatures are solved by bisection here; the reference
 * engine uses a secant/quadratic iteration (`math.rb` Iterate) to a 1e-5 relative
 * tolerance. Any difference is in the floating-point tolerance class (ADR-015).
 */
import { PSI_PER_ATM, fToR } from "./units.js";

export const AIR = { cp: 0.2399, molecularWeight: 28.97, rBtuPerLbmR: 1.9858 / 28.97 } as const;
export const WATER_VAPOR = { cp: 0.4495, molecularWeight: 18.02 } as const;
export const LIQUID_WATER = { cp: 0.9991, hfg: 1055, freezeF: 32.0 } as const;
/** Molecular weight ratio water vapor : air (0.62202 from these weights; 0.62198 is the ASHRAE rounded value). */
export const PSYCH_MASS_RATIO = WATER_VAPOR.molecularWeight / AIR.molecularWeight;

/** Saturation pressure of water vapor (psia) at a dry-bulb temperature (°F). ASHRAE 2009 ch. 1 eqs 5 and 6. */
export function saturationPressurePsi(tdbF: number): number {
  const t = fToR(tdbF);
  const tFreeze = fToR(LIQUID_WATER.freezeF);
  if (t < tFreeze) {
    const c1 = -1.0214165e4, c2 = -4.8932428, c3 = -5.3765794e-3, c4 = 1.9202377e-7, c5 = 3.5575832e-10, c6 = -9.0344688e-14, c7 = 4.1635019;
    return Math.exp(c1 / t + c2 + t * (c3 + t * (c4 + t * (c5 + c6 * t))) + c7 * Math.log(t));
  }
  const c8 = -1.0440397e4, c9 = -1.129465e1, c10 = -2.7022355e-2, c11 = 1.289036e-5, c12 = -2.4780681e-9, c13 = 6.5459673;
  return Math.exp(c8 / t + c9 + t * (c10 + t * (c11 + c12 * t)) + c13 * Math.log(t));
}

/** Standard barometric pressure (psia) at an altitude (ft). ASHRAE 2009 ch. 1 eq 3. */
export function standardPressurePsi(altitudeFt: number): number {
  return Math.pow(1 - 6.8754e-6 * altitudeFt, 5.2559) * PSI_PER_ATM;
}

/** Humidity ratio (lbm/lbm) from vapor pressure and total pressure (psia). */
export function humidityRatioFromVaporPressure(pPsi: number, pwPsi: number): number {
  return (PSYCH_MASS_RATIO * pwPsi) / (pPsi - pwPsi);
}

/** Humidity ratio (lbm/lbm) from dry bulb (°F), relative humidity (fraction) and pressure (psia). Uses ASHRAE's 0.62198. */
export function humidityRatioFromRh(tdbF: number, rh: number, pPsi: number): number {
  const pw = rh * saturationPressurePsi(tdbF);
  return (0.62198 * pw) / (pPsi - pw);
}

/** Humidity ratio (lbm/lbm) from dry bulb and wet bulb (°F) at pressure (psia). ASHRAE 2009 ch. 1 eq 35. */
export function humidityRatioFromWetBulb(tdbF: number, twbF: number, pPsi: number): number {
  const wStar = humidityRatioFromVaporPressure(pPsi, saturationPressurePsi(twbF));
  const { hfg, cp: cpL } = LIQUID_WATER;
  const cpV = WATER_VAPOR.cp;
  return ((hfg - (cpL - cpV) * twbF) * wStar - AIR.cp * (tdbF - twbF)) / (hfg + cpV * tdbF - cpL * twbF);
}

/** Wet-bulb temperature (°F) for a dry bulb (°F), humidity ratio and pressure; bisection on eq 35. */
export function wetBulbFromHumidityRatio(tdbF: number, w: number, pPsi: number): number {
  let lo = tdbF - 150;
  let hi = tdbF;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const f = humidityRatioFromWetBulb(tdbF, mid, pPsi) - w;
    if (f > 0) hi = mid;
    else lo = mid;
    if (hi - lo < 1e-9) break;
  }
  return Math.min(hi, tdbF);
}

export function wetBulbFromRh(tdbF: number, rh: number, pPsi: number): number {
  return wetBulbFromHumidityRatio(tdbF, humidityRatioFromRh(tdbF, rh, pPsi), pPsi);
}

/** Moist-air enthalpy (Btu/lb) from dry bulb (°F) and humidity ratio. ASHRAE 2009 ch. 1 eq 32 (SI) converted. */
export function enthalpyBtuPerLb(tdbF: number, w: number): number {
  const tC = ((tdbF - 32) * 5) / 9;
  const hJPerKg = 1000 * (1.006 * tC + w * (2501 + 1.86 * tC));
  return hJPerKg * (3412.141633127942 / 1000 / 3600) * 0.45359237;
}

/** Dry-air density (lb/ft3) at pressure (psia) and temperature (°F), ideal gas with the engine's constants. */
export function airDensityLbPerFt3(pPsi: number, tF: number): number {
  const pAtm = pPsi / PSI_PER_ATM;
  const pBtuPerFt3 = pAtm * 2.719;
  return pBtuPerFt3 / (AIR.rBtuPerLbmR * fToR(tF));
}
