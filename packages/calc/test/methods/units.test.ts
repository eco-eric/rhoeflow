import { describe, expect, it } from "vitest";
import { EngineInputError } from "../../src/methods/errors.js";
import { cToF, deltaCToDeltaF, fToC, fToR, humidityRatioToGrains, mToFt, requireQuantity, requireValue, uFromR } from "../../src/methods/units.js";

describe("MJ8.units", () => {
  it("converts temperatures and differences separately", () => {
    expect(cToF(-3.4)).toBeCloseTo(25.88, 10);
    expect(cToF(36.9)).toBeCloseTo(98.42, 10);
    expect(fToC(212)).toBe(100);
    expect(fToR(0)).toBe(459.67);
    expect(deltaCToDeltaF(11)).toBeCloseTo(19.8, 10);
    // A difference is not a temperature: 11 °C as a temperature would be 51.8 °F.
    expect(cToF(11)).not.toBeCloseTo(19.8, 1);
  });

  it("converts the DFW elevation like the oracle (171 m -> 561.0 ft)", () => {
    expect(Math.round(mToFt(171) * 10) / 10).toBe(561.0);
  });

  it("grains and U from R", () => {
    expect(humidityRatioToGrains(0.01)).toBe(70);
    expect(uFromR(4)).toBe(0.25);
    expect(() => uFromR(0)).toThrow(EngineInputError);
    expect(() => uFromR(-2)).toThrow(/positive/);
  });

  it("requireQuantity is the only door for inputs: refuses unknown, proposed, missing and mis-united fields", () => {
    const ok = { value: 320, unit: "ft2" as const, state: "measured" as const, source: "tape", evidence: [] };
    expect(requireQuantity(ok, "ft2", "walls[0].area")).toBe(320);
    const unknown = { value: null, unit: "ft2" as const, state: "unknown" as const, reason: "didnt_inspect" as const, evidence: [] };
    expect(() => requireQuantity(unknown, "ft2", "p")).toThrow(/unknown \(didnt_inspect\)/);
    const proposed = { ...ok, state: "proposed" as const };
    expect(() => requireQuantity(proposed, "ft2", "p")).toThrow(/not yet accepted/);
    expect(() => requireQuantity(undefined, "ft2", "p")).toThrow(/required/);
    expect(() => requireQuantity(ok, "ft", "p")).toThrow(/expected ft/);
    try {
      requireQuantity(unknown, "ft2", "walls[0].area");
    } catch (e) {
      expect(e).toBeInstanceOf(EngineInputError);
      expect((e as EngineInputError).code).toBe("unaccepted_input");
      expect((e as EngineInputError).path).toBe("walls[0].area");
    }
  });

  it("requireValue handles enums and booleans", () => {
    expect(requireValue({ value: "outside" as const, state: "documented" as const, source: "plan", evidence: [] }, "p")).toBe("outside");
    expect(requireValue({ value: false, state: "documented" as const, source: "photo", evidence: [] }, "p")).toBe(false);
    expect(() => requireValue({ value: null, state: "unknown" as const, reason: "inspected_cant_tell" as const, evidence: [] }, "p")).toThrow(EngineInputError);
  });
});
