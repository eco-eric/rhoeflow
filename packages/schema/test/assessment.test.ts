import { describe, expect, it } from "vitest";
import { validateAssessment } from "../src/validate.js";
import { minimalAssessment, qty } from "../src/testing.js";

describe("validateAssessment", () => {
  it("accepts the minimal fixture", () => {
    const r = validateAssessment(minimalAssessment());
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("requires the WorkEdge anchors (ADR-028)", () => {
    const a = minimalAssessment();
    // @ts-expect-error deliberately removing a required id
    delete a.workedge.property_id;
    const r = validateAssessment(a);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.path === "workedge.property_id")).toBe(true);
  });

  it("rejects a dangling window wall reference (DAT-001)", () => {
    const a = minimalAssessment();
    a.building.enclosure.windows[0]!.attached_to_wall = "wall-missing";
    const r = validateAssessment(a);
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatchObject({ kind: "invariant", path: "building.enclosure.windows[0].attached_to_wall" });
  });

  it("rejects duplicate element ids across element kinds", () => {
    const a = minimalAssessment();
    a.building.enclosure.doors[0]!.id = "wall-1";
    const r = validateAssessment(a);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes('duplicate element id "wall-1"'))).toBe(true);
  });

  it("rejects a system that references a missing distribution or zone (DAT-002)", () => {
    const a = minimalAssessment();
    a.building.systems.hvac.cooling_systems[0]!.distribution_system = "dist-nope";
    a.building.systems.hvac.cooling_systems[0]!.x_served_zone_ids = ["zone-nope"];
    const r = validateAssessment(a);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.path)).toEqual([
      "building.systems.hvac.cooling_systems[0].distribution_system",
      "building.systems.hvac.cooling_systems[0].x_served_zone_ids",
    ]);
  });

  it("rejects load-served fractions that exceed one in total", () => {
    const a = minimalAssessment();
    a.building.systems.hvac.heating_systems.push({
      ...a.building.systems.hvac.heating_systems[0]!,
      id: "heat-2",
      fraction_heat_load_served: qty(0.5, "fraction"),
    });
    const r = validateAssessment(a);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.startsWith("heat load served sums to 1.5"))).toBe(true);
  });

  it("rejects a signed URL used as evidence (ADR-028)", () => {
    const a = minimalAssessment();
    a.building.enclosure.walls[0]!.area.evidence = ["https://supabase.example/storage/v1/object/sign/x?token=abc"];
    const r = validateAssessment(a);
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.message).toContain("not a URL");
  });

  it("requires the sizing policy to be present and sourced (ADR-005, ENG-004)", () => {
    const a = minimalAssessment();
    // @ts-expect-error deliberately removing the required policy
    delete a.building.systems.hvac.hvac_sizing_control.heat_pump_sizing_methodology;
    const r = validateAssessment(a);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.path.endsWith("hvac_sizing_control.heat_pump_sizing_methodology"))).toBe(true);
  });

  it("rejects unknown keys so typos cannot silently drop inputs", () => {
    const a = minimalAssessment() as unknown as Record<string, unknown>;
    a["extra"] = 1;
    expect(validateAssessment(a).ok).toBe(false);
  });
});
