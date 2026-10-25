import { describe, expect, it } from "vitest";
import { minimalAssessment } from "@rhoeflow/schema/testing";
import { CalcOutputSchema, ENGINE_VERSION, type CalcInputInput } from "../src/contracts.js";
import { prepareInput, runCalculation } from "../src/engine.js";
import { canonicalJson, contentHash } from "../src/canonical.js";

function minimalInput(): CalcInputInput {
  return {
    calc_input_version: "0.1.0",
    requested_engine: { name: "@rhoeflow/calc", version: ENGINE_VERSION },
    method_ids: [],
    weather: { library: "fixture-weather", version: "0", station_key: "722590" },
    scenario: { id: "baseline", name: "Baseline", overrides: [] },
    assessment: minimalAssessment(),
  };
}

describe("prepareInput", () => {
  it("accepts a fully accepted assessment", () => {
    const r = prepareInput(minimalInput());
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("refuses proposed fields: AI output is not an engine input until accepted (ADR-003)", () => {
    const i = minimalInput();
    i.assessment.building.enclosure.walls[0]!.area.state = "proposed";
    const r = prepareInput(i);
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatchObject({ path: "assessment.building.enclosure.walls[0].area" });
    expect(r.issues[0]!.message).toContain("proposed");
  });

  it("refuses unknown fields instead of treating them as zero (ADR-027)", () => {
    const i = minimalInput();
    i.assessment.building.enclosure.air_infiltration.air_leakage = {
      value: null,
      unit: "ACH50",
      state: "unknown",
      reason: "didnt_inspect",
      evidence: [],
    };
    const r = prepareInput(i);
    expect(r.ok).toBe(false);
    expect(r.issues.map((x) => x.message).join()).toContain("unknown (didnt_inspect)");
  });

  it("rejects an unrecognised method id", () => {
    const i = minimalInput();
    i.method_ids = ["ManualJ.wall"];
    expect(prepareInput(i).ok).toBe(false);
    i.method_ids = ["MJ8.infiltration.lbl", "MS2023.cooling_band.variable", "MD3.friction_rate"];
    expect(prepareInput(i).ok).toBe(true);
  });
});

describe("runCalculation (WO-01 contract-only engine)", () => {
  it("returns not_implemented with no fabricated numbers and echoes the frozen input", async () => {
    const prepared = prepareInput(minimalInput());
    if (!prepared.ok) throw new Error("fixture should prepare");
    const out = await runCalculation(prepared.input, {
      run_id: "11111111-2222-4333-8444-555555555555",
      now: () => new Date("2026-10-24T12:00:00Z"),
    });
    expect(out.status).toBe("not_implemented");
    expect(out.results.building).toBeNull();
    expect(out.results.components).toEqual([]);
    expect(out.warnings[0]?.code).toBe("ENGINE_NOT_IMPLEMENTED");
    expect(canonicalJson(out.frozen_input)).toBe(canonicalJson(prepared.input));
    expect(CalcOutputSchema.safeParse(JSON.parse(JSON.stringify(out))).success).toBe(true);
  });

  it("produces a deterministic input hash and a changing one when an input changes", async () => {
    const a = prepareInput(minimalInput());
    const b = prepareInput(minimalInput());
    if (!a.ok || !b.ok) throw new Error("fixture should prepare");
    const ha = (await runCalculation(a.input)).manifest.input_hash;
    const hb = (await runCalculation(b.input)).manifest.input_hash;
    expect(ha).toBe(hb);
    expect(ha).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(ha).toBe(await contentHash(a.input));

    const c = minimalInput();
    c.assessment.building.enclosure.walls[0]!.area.value = 1241;
    const pc = prepareInput(c);
    if (!pc.ok) throw new Error("fixture should prepare");
    expect((await runCalculation(pc.input)).manifest.input_hash).not.toBe(ha);
  });
});

describe("canonicalJson", () => {
  it("is key-order independent and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }], e: undefined })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
  });
});
