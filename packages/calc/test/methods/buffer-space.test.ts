import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  crawlspaceDesignTemps,
  crawlspaceDuctRegain,
  crawlspaceWallU,
  floorOverCrawlspaceHtm,
  foundationWallAboveGradeU,
  foundationWallBelowGradeU,
  garageDesignTemps,
  garageFractionUnderConditioned,
} from "../../src/methods/buffer-space.js";
import { designConditionsFromEpw, parseEpwHeader } from "../../src/methods/design-conditions.js";
import { partitionHtm } from "../../src/methods/envelope.js";
import { EngineInputError } from "../../src/methods/errors.js";
import { airDensityLbPerFt3 } from "../../src/methods/psychrometrics.js";

const header = readFileSync(resolve(import.meta.dirname, "../../fixtures/weather/USA_TX_Dallas-Fort.Worth.Intl.AP.722590_TMY3.header.txt"), "utf8");
const dfw = designConditionsFromEpw(parseEpwHeader(header), { heatingSetpointF: 70, coolingSetpointF: 75, humiditySetpoint: 0.5 });

// Oracle HTMs from claude/09-spikes/wo03/runs/<house>/results_design_load_details.json (rounded to 0.01).
describe("MJ8.buffer_space: garages vs oracle", () => {
  it("a garage with nothing conditioned above it sits at outdoor + 0 / + 17 F (medium daily range)", () => {
    const frac = garageFractionUnderConditioned([], [{ area: 420, boundsConditioned: false }]);
    expect(frac).toBe(0);
    const t = garageDesignTemps(frac, dfw);
    expect(t.heatF).toBeCloseTo(25.88, 6);
    expect(t.coolF).toBeCloseTo(115.42, 6);
    // one-story-2018-garage-dfw: wall-garage R-13 -> 3.39 / 3.11, door-garage R-2 -> 22.06 / 20.21
    const wall = partitionHtm(13, t, dfw);
    expect(wall.heating).toBeCloseTo(3.39, 2);
    expect(wall.cooling).toBeCloseTo(3.11, 2);
    const door = partitionHtm(2, t, dfw);
    expect(door.heating).toBeCloseTo(22.06, 2);
    expect(door.cooling).toBeCloseTo(20.21, 2);
  });

  it("a garage entirely under a bonus room sits at outdoor + 5 / + 6 F", () => {
    const frac = garageFractionUnderConditioned([], [{ area: 420, boundsConditioned: true }]);
    expect(frac).toBe(1);
    const t = garageDesignTemps(frac, dfw);
    expect(t.heatF).toBeCloseTo(30.88, 6);
    expect(t.coolF).toBeCloseTo(104.42, 6);
    // two-story-garage-2sys-dfw: floor-over-garage R-15 -> 2.61 / 1.96, wall-garage R-11 -> 3.56 / 2.67
    const floor = partitionHtm(15, t, dfw);
    expect(floor.heating).toBeCloseTo(2.61, 2);
    expect(floor.cooling).toBeCloseTo(1.96, 2);
    const wall = partitionHtm(11, t, dfw);
    expect(wall.heating).toBeCloseTo(3.56, 2);
    expect(wall.cooling).toBeCloseTo(2.67, 2);
  });

  it("weights roofs and floors by area, and uses one half when there is nothing to weigh", () => {
    expect(garageFractionUnderConditioned([300], [{ area: 100, boundsConditioned: true }, { area: 200, boundsConditioned: false }])).toBeCloseTo(100 / 600, 12);
    expect(garageFractionUnderConditioned([], [])).toBe(0.5);
    expect(() => garageDesignTemps(1.2, dfw)).toThrow(EngineInputError);
  });
});

describe("MJ8.buffer_space: crawlspaces", () => {
  const skirt = { areaFt2: 100, heightFt: 2.5, depthBelowGradeFt: 0.5, assemblyR: 2.2 };
  const boundary = { foundationWalls: [skirt, skirt, skirt, skirt], walls: [] };

  it("foundation-wall U-factors: above grade 1/R, below grade 1/(R - outside film)", () => {
    expect(foundationWallAboveGradeU(skirt)).toBeCloseTo(1 / 2.2, 12);
    expect(foundationWallBelowGradeU(skirt)).toBeCloseTo(1 / 1.99, 12);
    // 20 ft2 below grade and 80 ft2 above grade per wall
    expect(crawlspaceWallU(boundary)).toBeCloseTo((20 / 1.99 + 80 / 2.2) / 100, 12);
  });

  it("floor over a vented crawlspace matches the oracle: ranch-1950s-crawl-dfw floor-crawl R-4.5 -> 3.85 / 2.04", () => {
    const htm = floorOverCrawlspaceHtm(4.5, "crawlspace - vented", boundary, dfw);
    expect(htm.heating).toBeCloseTo(3.85, 2);
    expect(htm.cooling).toBeCloseTo(2.04, 2);
  });

  it("an unvented crawlspace uses the sealed-tight partition formula", () => {
    const uF = 1 / 4.5;
    const uW = crawlspaceWallU(boundary);
    const htm = floorOverCrawlspaceHtm(4.5, "crawlspace - unvented", boundary, dfw);
    expect(htm.heating).toBeCloseTo((uF * uW * dfw.htd) / (4 * uF + uW), 12);
    expect(htm.cooling).toBeCloseTo((uF * uW * dfw.ctd) / (4 * uF + uW), 12);
  });

  it("refuses a floor over a crawlspace with no walls to set its temperature", () => {
    expect(() => floorOverCrawlspaceHtm(4.5, "crawlspace - vented", { foundationWalls: [], walls: [] }, dfw)).toThrow(/foundation walls/);
  });

  it("crawlspace air temperature is a UA balance of house, outdoors and vent air", () => {
    const input = {
      location: "crawlspace - vented" as const,
      uaToConditioned: 1600 / 4.5,
      foundationWalls: boundary.foundationWalls,
      uaWallsToOutside: 0,
      floor: { areaFt2: 1600, thicknessIn: 0 },
      ventedSla: 0.006667,
      wsf: 0.53,
      annualAvgDrybulbF: 65.72119178082193,
    };
    const t = crawlspaceDesignTemps(input, dfw);
    const uaWalls = 4 * crawlspaceWallU({ foundationWalls: [skirt], walls: [] }) * 100;
    const ach = 1000 * 0.006667 * 0.53;
    const uaVent = (ach / 60) * 1600 * 2.5 * airDensityLbPerFt3(dfw.pressurePsi, 65.72119178082193) * 0.2399 * 60;
    const uaOut = uaWalls + 0.1 * 1600 + uaVent;
    expect(t.heatF).toBeCloseTo((uaOut * dfw.heatingDesignTempF + input.uaToConditioned * 70) / (uaOut + input.uaToConditioned), 9);
    expect(t.coolF).toBeCloseTo((uaOut * dfw.coolingDesignTempF + input.uaToConditioned * 75) / (uaOut + input.uaToConditioned), 9);
    expect(t.heatF).toBeGreaterThan(dfw.heatingDesignTempF);
    expect(t.heatF).toBeLessThan(70);
    expect(() => crawlspaceDesignTemps({ ...input, floor: { areaFt2: 1600, thicknessIn: 4 } }, dfw)).toThrow(/concrete crawlspace floor/);
    const { ventedSla: _drop, ...noSla } = input;
    expect(() => crawlspaceDesignTemps(noSla, dfw)).toThrow(/vented_crawlspace_sla/);
  });

  it("duct regain in a crawlspace depends on whether the floor and walls are insulated", () => {
    expect(crawlspaceDuctRegain("crawlspace - vented", 4.5, 2.2)).toBe(0.12);
    expect(crawlspaceDuctRegain("crawlspace - vented", 3, 2.2)).toBe(0.5);
    expect(crawlspaceDuctRegain("crawlspace - vented", 19, 10)).toBe(0.17);
    expect(crawlspaceDuctRegain("crawlspace - unvented", 3, 10)).toBe(0.76);
  });
});
