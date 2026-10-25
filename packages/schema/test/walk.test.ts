import { describe, expect, it } from "vitest";
import { collectFields } from "../src/walk.js";
import { minimalAssessment } from "../src/testing.js";
import { validateAssessment } from "../src/validate.js";

describe("walkFields", () => {
  it("finds every provenance field with a stable path", () => {
    const visits = collectFields(minimalAssessment());
    expect(visits.length).toBeGreaterThan(60);
    const paths = visits.map((v) => v.path);
    expect(paths).toContain("building.building_construction.conditioned_floor_area");
    expect(paths).toContain("building.enclosure.walls[0].area");
    expect(paths).toContain("building.systems.hvac.hvac_sizing_control.heat_pump_sizing_methodology");
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("does not descend into a field's own value", () => {
    const visits = collectFields({ a: { value: { nested: { value: 1, state: "measured", source: "x" } }, state: "measured", source: "x" } });
    expect(visits.map((v) => v.path)).toEqual(["a"]);
  });

  it("every field in the validated fixture has a state and either a source or a reason", () => {
    const r = validateAssessment(minimalAssessment());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const { field } of collectFields(r.assessment)) {
      if (field.state === "unknown") {
        expect(field.reason).toBeDefined();
        expect(field.value).toBeNull();
      } else {
        expect(field.source.length).toBeGreaterThan(0);
      }
    }
  });
});
