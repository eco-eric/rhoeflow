import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { designConditionsFromEpw, parseEpwHeader } from "../../src/methods/design-conditions.js";
import { airflowFromLoad, defaultDuctSurfaceArea, ductEffectiveRValue, ductLoads, ductRegainFactor, leavingAirTempF, supplyAirTempF } from "../../src/methods/ducts.js";
import { atticDesignTemps } from "../../src/methods/envelope.js";

const header = readFileSync(resolve(import.meta.dirname, "../../fixtures/weather/USA_TX_Dallas-Fort.Worth.Intl.AP.722590_TMY3.header.txt"), "utf8");
const dfw = designConditionsFromEpw(parseEpwHeader(header), { heatingSetpointF: 70, coolingSetpointF: 75, humiditySetpoint: 0.5, soilType: "unknown", moistureType: "mixed" });
const outdoorW = dfw.outdoorHumidityRatio!;

describe("MJ8.ducts helpers vs oracle in.xml defaults", () => {
  it("surface areas: ranch supply 432 / return 80; two-story 648 / 240", () => {
    expect(defaultDuctSurfaceArea("supply", 1600, 1, 1)).toBe(432);
    expect(defaultDuctSurfaceArea("return", 1600, 1, 1)).toBe(80);
    expect(defaultDuctSurfaceArea("supply", 2400, 1, 2)).toBeCloseTo(648, 9);
    expect(defaultDuctSurfaceArea("return", 2400, 1, 2)).toBeCloseTo(240, 9);
    expect(defaultDuctSurfaceArea("return", 2000, 1, 8)).toBe(500);
  });

  it("effective R: R-4 supply 4.38, R-4 return 5.0, R-6 supply 5.73, R-6 return 7.0, uninsulated 1.7", () => {
    expect(ductEffectiveRValue(4, "supply")).toBe(4.38);
    expect(ductEffectiveRValue(4, "return")).toBe(5.0);
    expect(ductEffectiveRValue(6, "supply")).toBe(5.73);
    expect(ductEffectiveRValue(6, "return")).toBe(7.0);
    expect(ductEffectiveRValue(0, "supply")).toBe(1.7);
  });

  it("airflow, leaving air and supply temperatures", () => {
    expect(airflowFromLoad(60000, 240)).toBe(1200); // HeatingDesignAirflowCFM 1200 for the ranch's 60 kBtu/h
    expect(airflowFromLoad(36000, 360)).toBe(1080); // CoolingDesignAirflowCFM 1080 for 3 tons
    expect(leavingAirTempF(90, 100)).toBe(58);
    expect(leavingAirTempF(70, 100)).toBe(54);
    expect(leavingAirTempF(82.5, 100)).toBeCloseTo(56, 9);
    expect(supplyAirTempF("furnace")).toBe(120);
    expect(supplyAirTempF("heat pump")).toBe(105);
    expect(ductRegainFactor("attic - vented")).toBe(0.1);
    expect(() => ductRegainFactor("crawlspace - vented")).toThrow(/regain/);
  });
});

describe("MJ8.ducts delivery-effectiveness iteration vs oracle", () => {
  const ranchAttic = atticDesignTemps(
    { vented: true, roofs: [{ area: 1690, assemblyR: 2.3, roofType: "asphalt or fiberglass shingles", solarAbsorptance: 0.9, radiantBarrier: false }], ceilings: [{ area: 1600, assemblyR: 12 }] },
    dfw,
  );

  it("ranch (fractions 0.1333 / 0.0667, R-4 attic ducts, furnace + AC): ducts 17,792 / 18,248 / 1,632", () => {
    // Pre-duct loads = oracle totals minus oracle duct components (claude/09-spikes/r01/runs/ranch-1960s-dfw).
    const pre = { heating: 61532 - 17792, coolingSensible: 47910 - 18248, coolingLatent: 4284 - 1632 };
    const r = ductLoads(
      {
        supply: { surfaceAreaFt2: 432, effectiveR: 4.38, location: "attic - vented", ambientHeatingF: ranchAttic.heatF, ambientCoolingF: ranchAttic.coolF, leakageToOutside: { kind: "fraction", value: 0.1333 } },
        return: { surfaceAreaFt2: 80, effectiveR: 5.0, location: "attic - vented", ambientHeatingF: ranchAttic.heatF, ambientCoolingF: ranchAttic.coolF, leakageToOutside: { kind: "fraction", value: 0.0667 } },
        heatingEquipment: "furnace",
        coolingEquipment: "central air conditioner",
      },
      pre,
      dfw,
      outdoorW,
    );
    expect(r.converged).toBe(true);
    expect(Math.abs(r.heating - 17792)).toBeLessThanOrEqual(2);
    expect(Math.abs(r.coolingSensible - 18248)).toBeLessThanOrEqual(2);
    expect(Math.abs(r.coolingLatent - 1632)).toBeLessThanOrEqual(2);
  });

  it("two-story (160 / 80 CFM25, R-6 attic ducts, furnace + AC): ducts 18,588 / 15,879 / 2,465", () => {
    const attic = atticDesignTemps(
      { vented: true, roofs: [{ area: 1342, assemblyR: 2.3, roofType: "asphalt or fiberglass shingles", solarAbsorptance: 0.9, radiantBarrier: false }], ceilings: [{ area: 1200, assemblyR: 32 }] },
      dfw,
    );
    const pre = { heating: 52429 - 18588, coolingSensible: 36959 - 15879, coolingLatent: 5737 - 2465 };
    const r = ductLoads(
      {
        supply: { surfaceAreaFt2: 648, effectiveR: 5.73, location: "attic - vented", ambientHeatingF: attic.heatF, ambientCoolingF: attic.coolF, leakageToOutside: { kind: "cfm25", value: 160 } },
        return: { surfaceAreaFt2: 240, effectiveR: 7.0, location: "attic - vented", ambientHeatingF: attic.heatF, ambientCoolingF: attic.coolF, leakageToOutside: { kind: "cfm25", value: 80 } },
        heatingEquipment: "furnace",
        coolingEquipment: "central air conditioner",
      },
      pre,
      dfw,
      outdoorW,
    );
    expect(r.converged).toBe(true);
    expect(Math.abs(r.heating - 18588)).toBeLessThanOrEqual(2);
    expect(Math.abs(r.coolingSensible - 15879)).toBeLessThanOrEqual(2);
    expect(Math.abs(r.coolingLatent - 2465)).toBeLessThanOrEqual(2);
  });

  it("heat pump heating (105 °F supply) gives a lower duct heating load than a furnace on the same house: 15,654 vs 18,588", () => {
    const attic = atticDesignTemps(
      { vented: true, roofs: [{ area: 1342, assemblyR: 2.3, roofType: "asphalt or fiberglass shingles", solarAbsorptance: 0.9, radiantBarrier: false }], ceilings: [{ area: 1200, assemblyR: 32 }] },
      dfw,
    );
    const system = {
      supply: { surfaceAreaFt2: 648, effectiveR: 5.73, location: "attic - vented", ambientHeatingF: attic.heatF, ambientCoolingF: attic.coolF, leakageToOutside: { kind: "cfm25" as const, value: 160 } },
      return: { surfaceAreaFt2: 240, effectiveR: 7.0, location: "attic - vented", ambientHeatingF: attic.heatF, ambientCoolingF: attic.coolF, leakageToOutside: { kind: "cfm25" as const, value: 80 } },
      heatingEquipment: "heat pump" as const,
      coolingEquipment: "heat pump" as const,
    };
    const pre = { heating: 49495 - 15654, coolingSensible: 36959 - 15879, coolingLatent: 5737 - 2465 };
    const r = ductLoads(system, pre, dfw, outdoorW);
    expect(Math.abs(r.heating - 15654)).toBeLessThanOrEqual(2);
  });

  it("conditioned-space ducts add no load", () => {
    const r = ductLoads(
      {
        supply: { surfaceAreaFt2: 400, effectiveR: 4.38, location: "conditioned space", ambientHeatingF: 70, ambientCoolingF: 75, leakageToOutside: { kind: "fraction", value: 0 } },
        return: { surfaceAreaFt2: 80, effectiveR: 5, location: "conditioned space", ambientHeatingF: 70, ambientCoolingF: 75, leakageToOutside: { kind: "fraction", value: 0 } },
        heatingEquipment: "furnace",
        coolingEquipment: "central air conditioner",
      },
      { heating: 40000, coolingSensible: 30000, coolingLatent: 3000 },
      dfw,
      outdoorW,
    );
    expect(Math.abs(r.heating)).toBeLessThan(1);
    expect(Math.abs(r.coolingSensible)).toBeLessThan(1);
  });
});
