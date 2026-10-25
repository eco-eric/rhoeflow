import { describe, expect, it } from "vitest";
import { minimalAssessment } from "@rhoeflow/schema/testing";
import { countFields, lintValue } from "../src/lint.js";

describe("provenance lint", () => {
  it("passes the schema's minimal assessment", () => {
    expect(lintValue(minimalAssessment())).toEqual([]);
    expect(countFields(minimalAssessment()).fields).toBeGreaterThan(60);
  });

  it("P001: a value without a source fails", () => {
    const a = minimalAssessment();
    (a.building.enclosure.walls[0]!.area as { source?: string }).source = "";
    expect(lintValue(a)).toMatchObject([{ rule: "P001", path: "building.enclosure.walls[0].area" }]);
    const b = minimalAssessment();
    delete (b.building.enclosure.walls[0]!.area as { source?: string }).source;
    expect(lintValue(b)[0]?.rule).toBe("P001");
  });

  it("P002: unknown must be null with a reason", () => {
    expect(lintValue({ x: { value: 0, state: "unknown", reason: "didnt_inspect" } })).toMatchObject([{ rule: "P002" }]);
    expect(lintValue({ x: { value: null, state: "unknown" } })).toMatchObject([{ rule: "P002" }]);
    expect(lintValue({ x: { value: null, state: "unknown", reason: "guess" } })).toMatchObject([{ rule: "P002" }]);
    expect(lintValue({ x: { value: null, state: "unknown", reason: "inspected_cant_tell" } })).toEqual([]);
  });

  it("P003: unknown states fail", () => {
    expect(lintValue({ x: { value: 1, state: "estimated", source: "s" } })).toMatchObject([{ rule: "P003" }]);
  });

  it("P004: evidence must be media ids", () => {
    expect(lintValue({ x: { value: 1, state: "measured", source: "s", evidence: ["https://x/y.jpg"] } })).toMatchObject([{ rule: "P004" }]);
    expect(lintValue({ x: { value: 1, state: "measured", source: "s", evidence: ["C:\\photos\\a.jpg"] } })).toMatchObject([{ rule: "P004" }]);
    expect(lintValue({ x: { value: 1, state: "measured", source: "s", evidence: ["we_media_1", "local:abc"] } })).toEqual([]);
  });

  it("P005: no confidence-style keys anywhere", () => {
    expect(lintValue({ a: { confidence: 0.9 } })).toMatchObject([{ rule: "P005", path: "a.confidence" }]);
    expect(lintValue({ a: { probability_pct: 80 } })).toMatchObject([{ rule: "P005" }]);
    expect(lintValue({ a: { confident_note: "fine" } })).toEqual([]);
  });

  it("P006: template defaults need sources and a basis", () => {
    expect(lintValue({ defaults: { x: { value: 1, unit: "ft", sources: [], basis: "b" } } })).toMatchObject([{ rule: "P006" }]);
    expect(lintValue({ defaults: { x: { value: 1, unit: "ft", sources: ["s"], basis: "" } } })).toMatchObject([{ rule: "P006" }]);
    expect(lintValue({ defaults: { x: { value: 1, unit: "ft", sources: ["s"], basis: "ok" } } })).toEqual([]);
  });

  it("does not look inside a field's value", () => {
    expect(lintValue({ x: { value: { confidence: 1 }, state: "measured", source: "s" } })).toEqual([]);
  });
});
