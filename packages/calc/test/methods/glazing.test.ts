import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { designConditionsFromEpw, parseEpwHeader } from "../../src/methods/design-conditions.js";
import { aedExcursion, interiorShadingCoefficient, interpolateByLatitude, orientationIndex, sumHourly, windowLoad, windowTypeFromRatings } from "../../src/methods/glazing.js";

const header = readFileSync(resolve(import.meta.dirname, "../../fixtures/weather/USA_TX_Dallas-Fort.Worth.Intl.AP.722590_TMY3.header.txt"), "utf8");
const epw = parseEpwHeader(header);
const dfw = designConditionsFromEpw(epw, { heatingSetpointF: 70, coolingSetpointF: 75, humiditySetpoint: 0.5 });
const lat = epw.latitude; // 32.9

const ranchWindows = [
  { id: "N", area: 50, azimuthDeg: 0 },
  { id: "E", area: 30, azimuthDeg: 90 },
  { id: "S", area: 60, azimuthDeg: 180 },
  { id: "W", area: 30, azimuthDeg: 270 },
].map((w) => ({ ...w, ufactor: 1.0, shgc: 0.8, interiorShading: "medium curtains" as const, interiorShadingSummerCoverage: 0.5 }));

describe("MJ8.glazing vs oracle", () => {
  it("orientation index: N=4, E=6, S=0, W=2, NE=5, SW=1", () => {
    expect([0, 90, 180, 270, 45, 225].map(orientationIndex)).toEqual([4, 6, 0, 2, 5, 1]);
    expect(orientationIndex(359)).toBe(4);
  });

  it("window type and interior shading coefficient: single clear with medium curtains at 50 % -> 0.80; 2P low-e option 3 -> 0.89", () => {
    expect(windowTypeFromRatings(1.0, 0.8)).toBe("1P Clear");
    expect(interiorShadingCoefficient(1.0, 0.8, "medium curtains", 0.5)).toBe(0.8);
    expect(windowTypeFromRatings(0.4, 0.35)).toBe("2P Low-e Option 3");
    expect(interiorShadingCoefficient(0.4, 0.35, "medium curtains", 0.5)).toBe(0.89);
    expect(interiorShadingCoefficient(0.4, 0.35, "none", 0.5)).toBe(1.0);
  });

  it("latitude interpolation extrapolates past the table ends like the oracle", () => {
    expect(interpolateByLatitude([28, 34], [38, 37], 32.9)).toBeCloseTo(37.1833, 4);
    expect(interpolateByLatitude([28, 34], [38, 37], 20)).toBeCloseTo(39.3333, 4);
    expect(interpolateByLatitude([28, 34], [38, 37], 40)).toBeCloseTo(36, 4);
  });

  it("ranch windows: heating 44.12; cooling N 31.35 / E 75.02 / S 38.71 / W 75.02; totals 7,500 / 8,391", () => {
    const loads = ranchWindows.map((w) => windowLoad(w, lat, dfw));
    const byId = Object.fromEntries(ranchWindows.map((w, i) => [w.id, loads[i]!]));
    expect(byId["N"]!.heatingHtm).toBeCloseTo(44.12, 2);
    expect(byId["N"]!.coolingHtm).toBeCloseTo(31.35, 2);
    expect(byId["E"]!.coolingHtm).toBeCloseTo(75.02, 2);
    expect(byId["S"]!.coolingHtm).toBeCloseTo(38.71, 2);
    expect(byId["W"]!.coolingHtm).toBeCloseTo(75.02, 2);
    expect(Math.round(loads.reduce((s, l) => s + l.heatingLoad, 0))).toBe(7500);
    expect(Math.round(loads.reduce((s, l) => s + l.coolingSensibleLoad, 0))).toBe(8391);
  });

  it("two-story windows: U 0.40 / SHGC 0.35 -> N 13.23 / E 34.48 / S 16.81 / W 34.48; totals 6,353 / 8,344", () => {
    const ws = [
      { area: 100, azimuthDeg: 0 },
      { area: 90, azimuthDeg: 90 },
      { area: 110, azimuthDeg: 180 },
      { area: 60, azimuthDeg: 270 },
    ].map((w) => ({ ...w, ufactor: 0.4, shgc: 0.35, interiorShading: "medium curtains" as const, interiorShadingSummerCoverage: 0.5 }));
    const loads = ws.map((w) => windowLoad(w, lat, dfw));
    expect(loads.map((l) => Math.round(l.coolingHtm * 100) / 100)).toEqual([13.23, 34.48, 16.81, 34.48]);
    expect(Math.round(loads.reduce((s, l) => s + l.heatingLoad, 0))).toBe(6353);
    expect(Math.round(loads.reduce((s, l) => s + l.coolingSensibleLoad, 0))).toBe(8344);
  });

  it("AED curve for the ranch matches the oracle's hourly values and its excursion is zero", () => {
    const run = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../claude/09-spikes/r01/runs/ranch-1960s-dfw/results_design_load_details.json"), "utf8")) as Record<string, Record<string, Record<string, number>>>;
    const curve = Object.entries(run).find(([k]) => /AED Curve/.test(k))![1]!["Ranch1960sDFW"]!;
    const expected = Array.from({ length: 12 }, (_, i) => curve[`Hr ${8 + i} (Btuh)`]!);
    const hourly = sumHourly(ranchWindows.map((w) => windowLoad(w, lat, dfw).hourlyCoolingLoads));
    hourly.forEach((v, i) => expect(Math.round(v), `hour ${8 + i}`).toBe(expected[i]));
    expect(aedExcursion(hourly)).toBe(0);
  });

  it("AED excursion appears when glazing all faces one way", () => {
    const west = windowLoad({ area: 300, azimuthDeg: 270, ufactor: 0.4, shgc: 0.35, interiorShading: "none", interiorShadingSummerCoverage: 0 }, lat, dfw);
    expect(aedExcursion(west.hourlyCoolingLoads)).toBeGreaterThan(0);
    expect(aedExcursion([])).toBe(0);
  });

  it("an overhang reduces a south window's cooling HTM toward the shaded (north) value", () => {
    const open = windowLoad({ area: 20, azimuthDeg: 180, ufactor: 0.4, shgc: 0.35, interiorShading: "medium curtains", interiorShadingSummerCoverage: 0.5 }, lat, dfw);
    const deep = windowLoad({ area: 20, azimuthDeg: 180, ufactor: 0.4, shgc: 0.35, interiorShading: "medium curtains", interiorShadingSummerCoverage: 0.5, overhang: { depthFt: 4, distanceToTopOfWindowFt: 0.5, distanceToBottomOfWindowFt: 5.5 } }, lat, dfw);
    const north = windowLoad({ area: 20, azimuthDeg: 0, ufactor: 0.4, shgc: 0.35, interiorShading: "medium curtains", interiorShadingSummerCoverage: 0.5 }, lat, dfw);
    expect(deep.coolingHtm).toBeLessThan(open.coolingHtm);
    expect(deep.coolingHtm).toBeGreaterThanOrEqual(north.coolingHtm - 1e-9);
  });
});
