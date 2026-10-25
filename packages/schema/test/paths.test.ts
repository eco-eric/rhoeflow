import { describe, expect, it } from "vitest";
import { minimalAssessment } from "../src/testing.js";
import { getAtPath, getFieldAtPath, parseFieldPath, setFieldAtPath } from "../src/paths.js";
import { collectFields } from "../src/walk.js";

describe("field paths (SCN-001)", () => {
  it("parses keys and indexes the way walkFields prints them", () => {
    expect(parseFieldPath("building.enclosure.walls[0].area")).toEqual(["building", "enclosure", "walls", 0, "area"]);
    expect(() => parseFieldPath("building..walls")).toThrow(/invalid field path/);
    expect(() => parseFieldPath("building.walls[a]")).toThrow(/invalid field path/);
    expect(() => parseFieldPath("__proto__.x")).not.toThrow();
  });

  it("round-trips every path the walker yields", () => {
    const a = minimalAssessment();
    const visits = collectFields(a);
    expect(visits.length).toBeGreaterThan(10);
    for (const v of visits) expect(getFieldAtPath(a, v.path)).toBe(v.field);
  });

  it("returns undefined for a missing position and a non-field", () => {
    const a = minimalAssessment();
    expect(getAtPath(a, "building.enclosure.walls[99].area")).toBeUndefined();
    expect(getFieldAtPath(a, "building.enclosure.walls")).toBeUndefined();
  });

  it("replaces a field on a copy and refuses to create a new position", () => {
    const a = minimalAssessment();
    const next = setFieldAtPath(a, "building.enclosure.walls[0].area", { value: 999, unit: "ft2", state: "assumed", source: "scenario", evidence: [] });
    expect((getFieldAtPath(next, "building.enclosure.walls[0].area") as { value: unknown }).value).toBe(999);
    expect((getFieldAtPath(a, "building.enclosure.walls[0].area") as { value: unknown }).value).not.toBe(999);
    expect(() => setFieldAtPath(a, "building.enclosure.walls[0].nope", { value: 1, state: "assumed", source: "x", evidence: [] })).toThrow(/no field at/);
    expect(() => setFieldAtPath(a, "building.enclosure.walls", { value: 1, state: "assumed", source: "x", evidence: [] })).toThrow(/no field at/);
  });
});
