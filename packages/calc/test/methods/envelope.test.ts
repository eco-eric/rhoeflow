import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { designConditionsFromEpw, parseEpwHeader } from "../../src/methods/design-conditions.js";
import {
  ashraeWallGroup,
  atticCeilingHtm,
  atticDesignTemps,
  averageRValue,
  conditionedRoofHtm,
  exteriorCeilingHtm,
  exteriorDoorHtm,
  exteriorWallHtm,
  netArea,
  surfaceLoad,
} from "../../src/methods/envelope.js";
import { EngineInputError } from "../../src/methods/errors.js";

const header = readFileSync(resolve(import.meta.dirname, "../../fixtures/weather/USA_TX_Dallas-Fort.Worth.Intl.AP.722590_TMY3.header.txt"), "utf8");
const dfw = designConditionsFromEpw(parseEpwHeader(header), { heatingSetpointF: 70, coolingSetpointF: 75, humiditySetpoint: 0.5 });

// Oracle values from claude/09-spikes/r01/runs/<house>/results_design_load_details.json (HTM rounded to 0.01).
describe("MJ8.envelope.conduction vs oracle", () => {
  it("ranch walls: R-4 brick veneer wood stud, absorptance 0.75 -> 11.03 / 6.46", () => {
    const wall = { wallType: "wood stud", siding: "brick veneer", assemblyR: 4, solarAbsorptance: 0.75 };
    expect(ashraeWallGroup(wall)).toBe("E");
    const htm = exteriorWallHtm(wall, dfw);
    expect(htm.heating).toBeCloseTo(11.03, 2);
    expect(htm.cooling).toBeCloseTo(6.46, 2);
    // Oracle totals: 4 walls x 320 gross, 170 ft2 windows, 40 ft2 doors -> net 1070; heating 11,802; cooling 6,910.
    const net = netArea(1280, [50, 30, 60, 30, 20, 20]);
    expect(net).toBe(1070);
    const load = surfaceLoad(htm, net);
    expect(Math.round(load.heatingLoad)).toBe(11802);
    expect(Math.round(load.coolingSensibleLoad)).toBe(6910);
  });

  it("two-story walls: R-12 brick veneer -> 3.68 / 1.70", () => {
    const wall = { wallType: "wood stud", siding: "brick veneer", assemblyR: 12, solarAbsorptance: 0.75 };
    expect(ashraeWallGroup(wall)).toBe("C");
    const htm = exteriorWallHtm(wall, dfw);
    expect(htm.heating).toBeCloseTo(3.68, 2);
    expect(htm.cooling).toBeCloseTo(1.7, 2);
    // gross 2380, windows 360, doors 44 -> net 1976; oracle 7,265 / 3,365
    const load = surfaceLoad(htm, netArea(2380, [100, 90, 110, 60, 24, 20]));
    expect(Math.round(load.heatingLoad)).toBe(7265);
    expect(Math.round(load.coolingSensibleLoad)).toBe(3365);
  });

  it("doors: R-3 -> 14.71 / 11.47; R-2 -> 22.06 / 17.21; R-4.4 -> 10.03 / 7.82", () => {
    expect(exteriorDoorHtm(3, dfw).heating).toBeCloseTo(14.71, 2);
    expect(exteriorDoorHtm(3, dfw).cooling).toBeCloseTo(11.47, 2);
    expect(exteriorDoorHtm(2, dfw).heating).toBeCloseTo(22.06, 2);
    expect(exteriorDoorHtm(2, dfw).cooling).toBeCloseTo(17.21, 2);
    expect(exteriorDoorHtm(4.4, dfw).heating).toBeCloseTo(10.03, 2);
    expect(exteriorDoorHtm(4.4, dfw).cooling).toBeCloseTo(7.82, 2);
    // ranch doors total: 20 x 14.71 + 20 x 22.06 = 735 heating; 20 x 11.47 + 20 x 17.21 = 574 cooling
    const h = surfaceLoad(exteriorDoorHtm(3, dfw), 20).heatingLoad + surfaceLoad(exteriorDoorHtm(2, dfw), 20).heatingLoad;
    const c = surfaceLoad(exteriorDoorHtm(3, dfw), 20).coolingSensibleLoad + surfaceLoad(exteriorDoorHtm(2, dfw), 20).coolingSensibleLoad;
    expect(Math.round(h)).toBe(735);
    expect(Math.round(c)).toBe(574);
  });

  it("ranch vented attic: dark shingles, no barrier, floor R-12 under roof R-2.3 -> attic 133.42 °F cooling, outdoor heating", () => {
    const attic = atticDesignTemps(
      {
        vented: true,
        roofs: [{ area: 1690, assemblyR: 2.3, roofType: "asphalt or fiberglass shingles", solarAbsorptance: 0.9, radiantBarrier: false }],
        ceilings: [{ area: 1600, assemblyR: 12 }],
      },
      dfw,
    );
    expect(attic.encapsulated).toBe(false);
    expect(attic.roofColor).toEqual(["medium dark"]); // in.xml RoofColor dataSource='software' medium dark
    expect(attic.coolF).toBeCloseTo(130 + 3.42, 10);
    expect(attic.heatF).toBe(25.88);
    const htm = atticCeilingHtm(12, attic, dfw);
    expect(htm.heating).toBeCloseTo(3.68, 2);
    expect(htm.cooling).toBeCloseTo(4.87, 2);
    const load = surfaceLoad(htm, 1600);
    expect(Math.round(load.heatingLoad)).toBe(5883);
    expect(Math.round(load.coolingSensibleLoad)).toBe(7789);
  });

  it("two-story ceiling R-32 under the same attic -> 1.38 / 1.83; loads 1,655 / 2,191", () => {
    const attic = atticDesignTemps(
      {
        vented: true,
        roofs: [{ area: 1342, assemblyR: 2.3, roofType: "asphalt or fiberglass shingles", solarAbsorptance: 0.9, radiantBarrier: false }],
        ceilings: [{ area: 1200, assemblyR: 32 }],
      },
      dfw,
    );
    const htm = atticCeilingHtm(32, attic, dfw);
    expect(htm.heating).toBeCloseTo(1.38, 2);
    expect(htm.cooling).toBeCloseTo(1.83, 2);
    expect(Math.round(surfaceLoad(htm, 1200).heatingLoad)).toBe(1655);
    expect(Math.round(surfaceLoad(htm, 1200).coolingSensibleLoad)).toBe(2191);
  });

  it("radiant barrier and roof color change the attic temperature; encapsulated vented attic uses outdoor + 40", () => {
    const base = { vented: true, ceilings: [{ area: 1000, assemblyR: 30 }] };
    const dark = atticDesignTemps({ ...base, roofs: [{ area: 1100, assemblyR: 2.3, roofType: "asphalt or fiberglass shingles", solarAbsorptance: 0.9, radiantBarrier: false }] }, dfw);
    const barrier = atticDesignTemps({ ...base, roofs: [{ area: 1100, assemblyR: 2.3, roofType: "asphalt or fiberglass shingles", solarAbsorptance: 0.9, radiantBarrier: true }] }, dfw);
    const light = atticDesignTemps({ ...base, roofs: [{ area: 1100, assemblyR: 2.3, roofType: "asphalt or fiberglass shingles", solarAbsorptance: 0.75, radiantBarrier: false }] }, dfw);
    expect(dark.coolF - barrier.coolF).toBeCloseTo(10, 10);
    expect(dark.coolF - light.coolF).toBeCloseTo(10, 10);
    const encapsulated = atticDesignTemps({ ...base, roofs: [{ area: 1100, assemblyR: 38, roofType: "asphalt or fiberglass shingles", solarAbsorptance: 0.9, radiantBarrier: false }] }, dfw);
    expect(encapsulated.encapsulated).toBe(true);
    expect(encapsulated.coolF).toBeCloseTo(98.42 + 40, 10);
    expect(() => atticDesignTemps({ ...base, vented: false, roofs: [{ area: 1100, assemblyR: 38, roofType: "asphalt or fiberglass shingles", solarAbsorptance: 0.9, radiantBarrier: false }] }, dfw)).toThrow(EngineInputError);
  });

  it("exterior ceiling and conditioned roof follow their CLTD rules", () => {
    const ceiling = exteriorCeilingHtm(30, dfw);
    expect(ceiling.cooling).toBeCloseTo((23.42 - 5) / 30, 10);
    const roof = conditionedRoofHtm({ assemblyR: 30, roofType: "asphalt or fiberglass shingles", solarAbsorptance: 0.9 }, dfw);
    // base 30 for R<=30, dark shingles multiplier 1.0, + (98.42-95) + 0
    expect(roof.cooling).toBeCloseTo((30 + 3.42) / 30, 10);
    expect(roof.heating).toBeCloseTo(44.12 / 30, 10);
  });

  it("wall groups across types and claddings; unsupported types throw", () => {
    expect(ashraeWallGroup({ wallType: "wood stud", siding: "vinyl siding", assemblyR: 20 })).toBe("C"); // U 0.050 -> I
    expect(ashraeWallGroup({ wallType: "wood stud", siding: "vinyl siding", assemblyR: 21 })).toBe("B-C"); // U 0.0476 -> J
    expect(ashraeWallGroup({ wallType: "wood stud", siding: "vinyl siding", assemblyR: 4 })).toBe("G"); // U 0.25 -> A
    expect(ashraeWallGroup({ wallType: "concrete masonry unit", siding: "stucco", assemblyR: 5 })).toBe("E");
    expect(ashraeWallGroup({ wallType: "insulated concrete forms", siding: "stucco", assemblyR: 20 })).toBe("B");
    expect(() => ashraeWallGroup({ wallType: "straw bale", siding: "stucco", assemblyR: 20 })).toThrow(/wall-group rule/);
  });

  it("helpers: averageRValue is UA-weighted; netArea refuses openings larger than the wall", () => {
    expect(averageRValue([{ area: 100, assemblyR: 10 }, { area: 100, assemblyR: 30 }])).toBeCloseTo(15, 10);
    expect(() => netArea(100, [60, 50])).toThrow(/exceed/);
  });
});
