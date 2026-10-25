import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dailyRangeClass, designConditions, designConditionsFromEpw, parseEpwHeader } from "../../src/methods/design-conditions.js";
import { humidityRatioFromRh, saturationPressurePsi, standardPressurePsi, wetBulbFromRh } from "../../src/methods/psychrometrics.js";

const header = readFileSync(resolve(import.meta.dirname, "../../fixtures/weather/USA_TX_Dallas-Fort.Worth.Intl.AP.722590_TMY3.header.txt"), "utf8");

/** Indoor inputs the oracle defaulted for both reference houses (in.xml ManualJInputs). */
const indoor = { heatingSetpointF: 70, coolingSetpointF: 75, humiditySetpoint: 0.5 };

describe("psychrometrics", () => {
  it("saturation pressure and standard pressure match ASHRAE reference points", () => {
    expect(saturationPressurePsi(212)).toBeCloseTo(14.696, 1); // boiling at 1 atm
    expect(saturationPressurePsi(32)).toBeCloseTo(0.08865, 3);
    expect(standardPressurePsi(0)).toBeCloseTo(14.692, 6);
    expect(standardPressurePsi(561)).toBeLessThan(14.692);
  });

  it("wet bulb equals dry bulb at saturation and is below it otherwise", () => {
    const p = standardPressurePsi(0);
    // 0.0015 °F short of saturation: ASHRAE's rounded 0.62198 in the RH path vs 18.02/28.97 in
    // the wet-bulb path, the same pair the oracle uses (floating-point tolerance class).
    expect(wetBulbFromRh(75, 1.0, p)).toBeCloseTo(75, 2);
    const twb = wetBulbFromRh(75, 0.5, p);
    expect(twb).toBeGreaterThan(60);
    expect(twb).toBeLessThan(75);
    expect(humidityRatioFromRh(75, 0.5, p)).toBeCloseTo(0.0093, 3); // psychrometric chart: about 0.0093 lb/lb at 75 °F, 50 % RH, sea level
  });
});

describe("MJ8.design_conditions", () => {
  it("parses the DFW TMY3 header the oracle used", () => {
    const h = parseEpwHeader(header);
    expect(h.wmo).toBe("722590");
    expect(h.state).toBe("TX");
    expect(h.designConditionsTitle).toBe("Climate Design Data 2009 ASHRAE Handbook");
    expect(h.heatingDb99F).toBeCloseTo(25.88, 2);
    expect(h.coolingDb1F).toBeCloseTo(98.42, 2);
    expect(h.coolingMcwb1F).toBeCloseTo(74.66, 2);
    expect(h.dailyRangeF).toBeCloseTo(19.8, 2);
    expect(Math.round(h.elevationFt * 10) / 10).toBe(561.0);
  });

  it("daily range class thresholds", () => {
    expect(dailyRangeClass(15.9)).toBe("low");
    expect(dailyRangeClass(16)).toBe("medium");
    expect(dailyRangeClass(25)).toBe("medium");
    expect(dailyRangeClass(25.1)).toBe("high");
  });

  it("reproduces the oracle's DFW design conditions (in.xml of both R01 houses)", () => {
    const dc = designConditionsFromEpw(parseEpwHeader(header), { ...indoor, soilType: "unknown", moistureType: "mixed" });
    expect(dc.heatingDesignTempF).toBe(25.88);
    expect(dc.coolingDesignTempF).toBe(98.42);
    expect(dc.dailyRange).toBe("medium");
    expect(dc.dailyRangeTempAdjustF).toBe(0);
    expect(dc.htd).toBeCloseTo(44.12, 10);
    expect(dc.ctd).toBeCloseTo(23.42, 10);
    expect(dc.designGrains).toBe(26.2); // HumidityDifference dataSource='software' 26.2
    expect(dc.groundConductivity).toBeCloseTo(0.8, 10); // Conductivity 1.0 in.xml is the input; the MJ value for unknown/mixed soil is 1/1.25
    expect(dc.acf).toBeCloseTo(1 - 0.0000308 * 561, 6);
    expect(dc.coolIndoorWetBulbF).toBeGreaterThan(60);
    expect(dc.coolOutdoorWetBulbF).toBeCloseTo(74.66, 1);
    expect(dc.indoorAirDensityLbPerFt3).toBeGreaterThan(0.07);
    expect(dc.indoorAirDensityLbPerFt3).toBeLessThan(0.076);
    expect(dc.derived).toEqual(["designGrains", "groundConductivity"]);
  });

  it("never lets a temperature difference go negative and rejects bad humidity", () => {
    const dc = designConditions({ heatingDesignTempF: 72, coolingDesignTempF: 70, dailyRange: "low", humidityDifferenceGrains: 10, elevationFt: 0, ...indoor });
    expect(dc.htd).toBe(0);
    expect(dc.ctd).toBe(0);
    expect(dc.derived).toEqual(["groundConductivity"]);
    expect(() => designConditions({ ...indoor, heatingDesignTempF: 20, coolingDesignTempF: 100, dailyRange: "low", elevationFt: 0, humiditySetpoint: 1.2, humidityDifferenceGrains: 1 })).toThrow(/fraction/);
    expect(() => designConditions({ ...indoor, heatingDesignTempF: 20, coolingDesignTempF: 100, dailyRange: "low", elevationFt: 0 })).toThrow(/humidityDifferenceGrains or coolingMcwbF/);
  });
});
