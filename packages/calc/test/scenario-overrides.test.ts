import { describe, expect, it } from "vitest";
import { minimalAssessment } from "@rhoeflow/schema/testing";
import { setFieldAtPath } from "@rhoeflow/schema";
import { ENGINE_VERSION, ScenarioOverrideSchema, type CalcInputInput } from "../src/contracts.js";
import { prepareInput } from "../src/engine.js";

const PATH = "building.enclosure.windows[0].shgc";
const override = {
  path: PATH,
  field: { value: 0.25, unit: "fraction" as const, state: "assumed" as const, source: "scenario: low-e replacement windows quoted by the homeowner", evidence: [] },
  rationale: "What-if: replace the windows before sizing",
  label: "design" as const,
};

function input(assessment = minimalAssessment(), overrides: (typeof override)[] = []): CalcInputInput {
  return {
    calc_input_version: "0.2.0",
    requested_engine: { name: "@rhoeflow/calc", version: ENGINE_VERSION },
    method_ids: [],
    weather: { library: "fixture-weather", version: "0", station_key: "722590" },
    scenario: { id: "what-if", name: "What-if", overrides },
    assessment,
  };
}

describe("scenario overrides in the frozen input (SCN-001, WO-03 C5)", () => {
  it("the override record requires a path, a sourced field, a rationale and a label", () => {
    expect(ScenarioOverrideSchema.safeParse(override).success).toBe(true);
    expect(ScenarioOverrideSchema.safeParse({ ...override, rationale: "" }).success).toBe(false);
    expect(ScenarioOverrideSchema.safeParse({ ...override, field: { ...override.field, source: "" } }).success).toBe(false);
    expect(ScenarioOverrideSchema.safeParse({ ...override, field: { ...override.field, state: "proposed" } }).success).toBe(false);
    expect(ScenarioOverrideSchema.safeParse({ ...override, label: "energy_savings" }).success).toBe(false);
    expect(ScenarioOverrideSchema.safeParse({ ...override, path: "windows[0]..shgc" }).success).toBe(false);
  });

  it("refuses an input whose assessment does not reflect its overrides", () => {
    const r = prepareInput(input(minimalAssessment(), [override]));
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.message).join("\n")).toMatch(/not applied to the frozen assessment/);
  });

  it("accepts the input once the override is applied field for field", () => {
    const applied = setFieldAtPath(minimalAssessment(), PATH, override.field);
    const r = prepareInput(input(applied, [override]));
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("a matching value with a different source is not the same override", () => {
    const applied = setFieldAtPath(minimalAssessment(), PATH, { ...override.field, source: "somebody else" });
    expect(prepareInput(input(applied, [override])).ok).toBe(false);
  });

  it("refuses an override path that is not a field and a duplicated path", () => {
    const bad = { ...override, path: "building.enclosure.windows[7].shgc" };
    expect(prepareInput(input(minimalAssessment(), [bad])).issues[0]!.message).toMatch(/not a field of the assessment/);
    const applied = setFieldAtPath(minimalAssessment(), PATH, override.field);
    const r = prepareInput(input(applied, [override, override]));
    expect(r.issues.map((i) => i.message).join("\n")).toMatch(/appears twice/);
  });
});
