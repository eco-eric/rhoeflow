import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { designConditionsFromEpw, parseEpwHeader } from "../../src/methods/design-conditions.js";
import { blowerDoorInfiltration, defaultInfiltrationHeightFt, infiltrationLoads, slaFromAch50, tightnessClassInfiltration } from "../../src/methods/infiltration.js";
import { defaultOccupants, internalGains } from "../../src/methods/internal-gains.js";

const header = readFileSync(resolve(import.meta.dirname, "../../fixtures/weather/USA_TX_Dallas-Fort.Worth.Intl.AP.722590_TMY3.header.txt"), "utf8");
const dfw = designConditionsFromEpw(parseEpwHeader(header), { heatingSetpointF: 70, coolingSetpointF: 75, humiditySetpoint: 0.5 });

describe("MJ8.infiltration.blower_door vs oracle", () => {
  it("ranch: 12 ACH50, 1,600 ft2, 12,800 ft3, 1 story, class 4 -> 173 / 106 cfm; loads 8,274 / 2,678 / 1,852", () => {
    const d = blowerDoorInfiltration(
      { airLeakage: 12, unit: "ACH50", housePressurePa: 50, conditionedFloorAreaFt2: 1600, infiltrationVolumeFt3: 12800, storiesAboveGrade: 1, shieldingClass: 4, facilityType: "single-family detached" },
      dfw,
    );
    expect(Math.round(d.heatingCfm)).toBe(173);
    expect(Math.round(d.coolingCfm)).toBe(106);
    const l = infiltrationLoads(d, dfw);
    expect(Math.round(l.heating)).toBe(8274);
    expect(Math.round(l.coolingSensible)).toBe(2678);
    expect(Math.round(l.coolingLatent)).toBe(1852);
  });

  it("two-story: 7 ACH50, 2,400 ft2, 20,400 ft3, 2 stories -> 205 / 130 cfm; loads 9,775 / 3,285 / 2,272", () => {
    const d = blowerDoorInfiltration(
      { airLeakage: 7, unit: "ACH50", housePressurePa: 50, conditionedFloorAreaFt2: 2400, infiltrationVolumeFt3: 20400, storiesAboveGrade: 2, shieldingClass: 4, facilityType: "single-family detached" },
      dfw,
    );
    expect(Math.round(d.heatingCfm)).toBe(205);
    expect(Math.round(d.coolingCfm)).toBe(130);
    const l = infiltrationLoads(d, dfw);
    expect(Math.round(l.heating)).toBe(9775);
    expect(Math.round(l.coolingSensible)).toBe(3285);
    expect(Math.round(l.coolingLatent)).toBe(2272);
  });

  it("CFM50 input converts through ACH at the test pressure; a fireplace adds 20 cfm heating", () => {
    const base = { housePressurePa: 50, conditionedFloorAreaFt2: 1600, infiltrationVolumeFt3: 12800, storiesAboveGrade: 1, shieldingClass: 4 as const, facilityType: "single-family detached" };
    const ach = blowerDoorInfiltration({ ...base, airLeakage: 12, unit: "ACH50" }, dfw);
    const cfm = blowerDoorInfiltration({ ...base, airLeakage: (12 * 12800) / 60, unit: "cfm50" }, dfw);
    expect(cfm.heatingCfm).toBeCloseTo(ach.heatingCfm, 6);
    const fire = blowerDoorInfiltration({ ...base, airLeakage: 12, unit: "ACH50", hasFireplace: true }, dfw);
    expect(fire.heatingCfm - ach.heatingCfm).toBeCloseTo(20, 9);
  });

  it("helpers: SLA formula and default infiltration height (ranch 8.0, two-story 17.5)", () => {
    expect(slaFromAch50(12, 8)).toBeCloseTo(6.096e-4, 6);
    expect(defaultInfiltrationHeightFt(8, 1)).toBe(8);
    expect(defaultInfiltrationHeightFt(8.5, 2)).toBe(17.5);
  });

  it("refuses attached and multifamily units in 0.1.0", () => {
    expect(() => blowerDoorInfiltration({ airLeakage: 5, unit: "ACH50", housePressurePa: 50, conditionedFloorAreaFt2: 1000, infiltrationVolumeFt3: 8000, storiesAboveGrade: 1, shieldingClass: 4, facilityType: "apartment unit" }, dfw)).toThrow(/unsupported|not in 0.1.0/);
  });
});

describe("MJ8.infiltration.tightness_class (no-test path)", () => {
  it("looks up Table 5A by leakiness, stories and floor-area bin", () => {
    const r = tightnessClassInfiltration({ leakiness: "average", conditionedFloorAreaFt2: 1600, aboveGradeVolumeFt3: 12800, storiesAboveGrade: 1, facilityType: "single-family detached" });
    expect(r.achHeating).toBe(0.38);
    expect(r.achCooling).toBe(0.2);
    expect(r.heatingCfm).toBeCloseTo((0.38 * 12800) / 60, 9);
    const two = tightnessClassInfiltration({ leakiness: "leaky", conditionedFloorAreaFt2: 2400, aboveGradeVolumeFt3: 20400, storiesAboveGrade: 2, facilityType: "single-family detached" });
    expect(two.achHeating).toBe(0.63);
    expect(two.achCooling).toBe(0.33);
  });
});

describe("MJ8.internal_gains vs oracle", () => {
  it("ranch: 2,400 + 230 x 4 = 3,320 sensible; 0 + 200 x 4 = 800 latent", () => {
    expect(internalGains({ appliancesSensibleBtuh: 2400, appliancesLatentBtuh: 0, occupants: defaultOccupants(3) })).toEqual({ coolingSensible: 3320, coolingLatent: 800 });
  });
  it("two-story: 5 occupants -> 3,550 / 1,000", () => {
    expect(internalGains({ appliancesSensibleBtuh: 2400, appliancesLatentBtuh: 0, occupants: defaultOccupants(4) })).toEqual({ coolingSensible: 3550, coolingLatent: 1000 });
  });
  it("rejects negative inputs", () => {
    expect(() => internalGains({ appliancesSensibleBtuh: -1, appliancesLatentBtuh: 0, occupants: 2 })).toThrow(/non-negative/);
  });
});
