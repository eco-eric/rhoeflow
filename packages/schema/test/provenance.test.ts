import { describe, expect, it } from "vitest";
import { z } from "zod";
import { field, isAcceptedInput, isField, quantityOf } from "../src/provenance.js";

const Num = field(z.number());
const Area = quantityOf("ft2");

describe("provenance field", () => {
  it("accepts a known value with a non-empty source", () => {
    const r = Num.safeParse({ value: 3, state: "measured", source: "tape, 2026-10-24" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.evidence).toEqual([]);
  });

  it("rejects a known value with no source (PRV-001)", () => {
    expect(Num.safeParse({ value: 3, state: "measured" }).success).toBe(false);
    expect(Num.safeParse({ value: 3, state: "defaulted", source: "" }).success).toBe(false);
    expect(Num.safeParse({ value: 3, state: "assumed", source: "   " }).success).toBe(false);
  });

  it("rejects unknown without a reason and unknown with a value (ADR-027)", () => {
    expect(Num.safeParse({ value: null, state: "unknown" }).success).toBe(false);
    expect(Num.safeParse({ value: 0, state: "unknown", reason: "didnt_inspect" }).success).toBe(false);
    expect(Num.safeParse({ value: null, state: "unknown", reason: "inspected_cant_tell" }).success).toBe(true);
  });

  it("never lets unknown be read as zero", () => {
    const r = Num.parse({ value: null, state: "unknown", reason: "didnt_inspect" });
    expect(r.value).toBeNull();
    expect(r.value).not.toBe(0);
  });

  it("rejects an unknown provenance state and extra keys", () => {
    expect(Num.safeParse({ value: 3, state: "guessed", source: "x" }).success).toBe(false);
    expect(Num.safeParse({ value: 3, state: "assumed", source: "x", confidence: 0.9 }).success).toBe(false);
  });

  it("allows proposed as a state but not as an accepted engine input (ADR-003)", () => {
    const proposed = Num.parse({ value: 3, state: "proposed", source: "claude vision run 42" });
    expect(isAcceptedInput(proposed)).toBe(false);
    const accepted = Num.parse({ value: 3, state: "measured", source: "tape" });
    expect(isAcceptedInput(accepted)).toBe(true);
    const unknown = Num.parse({ value: null, state: "unknown", reason: "didnt_inspect" });
    expect(isAcceptedInput(unknown)).toBe(false);
  });

  it("quantity requires the declared unit", () => {
    expect(Area.safeParse({ value: 100, unit: "ft2", state: "measured", source: "tape" }).success).toBe(true);
    expect(Area.safeParse({ value: 100, unit: "ft", state: "measured", source: "tape" }).success).toBe(false);
    expect(Area.safeParse({ value: 100, state: "measured", source: "tape" }).success).toBe(false);
    expect(Area.safeParse({ value: Number.NaN, unit: "ft2", state: "measured", source: "tape" }).success).toBe(false);
  });

  it("isField is structural and ignores look-alikes", () => {
    expect(isField({ value: 1, state: "measured", source: "x" })).toBe(true);
    expect(isField({ value: null, state: "unknown", reason: "didnt_inspect" })).toBe(true);
    expect(isField({ state: "measured" })).toBe(false);
    expect(isField({ value: 1, state: "nope" })).toBe(false);
    expect(isField([{ value: 1, state: "measured" }])).toBe(false);
    expect(isField(null)).toBe(false);
  });
});
