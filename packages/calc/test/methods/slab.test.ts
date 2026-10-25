import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { designConditionsFromEpw, parseEpwHeader } from "../../src/methods/design-conditions.js";
import { slabFValue, slabPerimeterLoad } from "../../src/methods/slab.js";

const header = readFileSync(resolve(import.meta.dirname, "../../fixtures/weather/USA_TX_Dallas-Fort.Worth.Intl.AP.722590_TMY3.header.txt"), "utf8");
const dfw = designConditionsFromEpw(parseEpwHeader(header), { heatingSetpointF: 70, coolingSetpointF: 75, humiditySetpoint: 0.5, soilType: "unknown", moistureType: "mixed" });

const uninsulated4in = {
  thicknessIn: 4,
  perimeterInsulationR: 0,
  perimeterInsulationDepthFt: 0,
  underSlabInsulationR: 0,
  underSlabInsulationWidthFt: 0,
  underSlabInsulationSpansEntireSlab: false,
};

describe("MJ8.slab.perimeter vs oracle", () => {
  it("ranch slab: 4 in uninsulated, 160 ft perimeter -> HTM 59.66 per ft, load 9,545", () => {
    const load = slabPerimeterLoad({ ...uninsulated4in, exposedPerimeterFt: 160 }, dfw);
    expect(load.heatingHtmPerFt).toBeCloseTo(59.66, 2);
    expect(Math.round(load.heatingLoad)).toBe(9545);
    expect(load.coolingSensibleLoad).toBe(0);
    expect(load.fValue).toBeCloseTo(59.66 / 44.12, 3);
  });

  it("two-story slab: same section, 140 ft perimeter -> 8,352", () => {
    const load = slabPerimeterLoad({ ...uninsulated4in, exposedPerimeterFt: 140 }, dfw);
    expect(load.heatingHtmPerFt).toBeCloseTo(59.66, 2);
    expect(Math.round(load.heatingLoad)).toBe(8352);
  });

  it("insulation lowers the F-value; radiant floors raise the HTD by 25", () => {
    const f0 = slabFValue({ ...uninsulated4in, exposedPerimeterFt: 100 }, dfw.groundConductivity);
    const fEdge = slabFValue({ ...uninsulated4in, exposedPerimeterFt: 100, perimeterInsulationR: 10, perimeterInsulationDepthFt: 2 }, dfw.groundConductivity);
    const fUnder = slabFValue({ ...uninsulated4in, exposedPerimeterFt: 100, underSlabInsulationR: 5, underSlabInsulationSpansEntireSlab: true }, dfw.groundConductivity);
    expect(fEdge).toBeLessThan(f0);
    expect(fUnder).toBeLessThan(f0);
    const radiant = slabPerimeterLoad({ ...uninsulated4in, exposedPerimeterFt: 100, radiantFloor: true }, dfw);
    expect(radiant.heatingHtmPerFt).toBeCloseTo(f0 * (44.12 + 25), 6);
  });

  it("rejects a non-positive thickness", () => {
    expect(() => slabFValue({ ...uninsulated4in, thicknessIn: 0, exposedPerimeterFt: 100 }, 0.8)).toThrow(/thickness/);
  });
});
