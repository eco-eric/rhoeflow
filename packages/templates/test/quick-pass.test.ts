import { describe, expect, it } from "vitest";
import { collectFields, getFieldAtPath, type Assessment } from "@rhoeflow/schema";
import { ENGINE_VERSION, prepareInput, runCalculation } from "@rhoeflow/calc";
import {
  QUICK_PASS_HOUSES,
  QUICK_PASS_QUESTIONS,
  buildQuickPass,
  checkAssessmentGeometry,
  checkQuickPassAnswers,
  emptyQuickPassAnswers,
  getTemplate,
  QuickPassAnswersSchema,
  type QuickPassAnswersInput,
  type QuickPassContext,
} from "../src/index.js";

const A = <T,>(value: T, state: "measured" | "documented" | "assumed" = "assumed", source?: string) => ({ value, state, ...(source ? { source } : {}) });

function ctx(template = "dfw-pre1980-ranch-slab", template_version: string | null = null): QuickPassContext {
  return {
    template: getTemplate(template),
    template_version,
    assessment_id: "0f1e2d3c-4b5a-4968-8777-66554433aa11",
    created_at: "2026-10-25T12:00:00-05:00",
    updated_at: "2026-10-25T12:00:00-05:00",
    workedge: { team_id: "we_team_fixture", project_id: "we_project_1", property_id: "we_property_1" },
  };
}

const minimal: QuickPassAnswersInput = {
  quick_pass_version: "0.1.0",
  year_built: A(1964),
  floor_area: A(1600),
  stories: A(1),
  garage: A({ cars: 0, side: "left" as const }),
  front_azimuth: A(180),
  bedrooms: A(3),
};

function field(a: Assessment, path: string) {
  const f = getFieldAtPath(a, path) as { value: unknown; state: string; source: string; note?: string; unit?: string } | undefined;
  if (!f) throw new Error(`no field at ${path}`);
  return f;
}

async function run(a: Assessment) {
  const p = prepareInput({
    calc_input_version: "0.2.0",
    requested_engine: { name: "@rhoeflow/calc", version: ENGINE_VERSION },
    method_ids: [],
    weather: { library: "openstudio-hpxml-weather", version: "v1.12.0", station_key: "722590" },
    scenario: { id: "baseline", name: "Baseline", overrides: [] },
    assessment: a,
  });
  if (!p.ok) throw new Error(JSON.stringify(p.issues.slice(0, 5)));
  return runCalculation(p.input);
}

describe("quick-pass answers (QST-001, ADR-027)", () => {
  it("lists every answer key once and starts empty", () => {
    const keys = QUICK_PASS_QUESTIONS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(QuickPassAnswersSchema.shape).filter((k) => k !== "quick_pass_version").sort()).toEqual([...keys].sort());
    expect(emptyQuickPassAnswers()).toEqual({ quick_pass_version: "0.1.0" });
  });

  it("refuses a value and an unknown together, a proposed state and an empty source", () => {
    expect(QuickPassAnswersSchema.safeParse({ ...minimal, bedrooms: { value: 3, unknown: "didnt_inspect" } }).success).toBe(false);
    expect(QuickPassAnswersSchema.safeParse({ ...minimal, bedrooms: { value: 3, state: "proposed" } }).success).toBe(false);
    expect(QuickPassAnswersSchema.safeParse({ ...minimal, bedrooms: { value: 3, source: "" } }).success).toBe(false);
  });
});

describe("RHOE.quick_pass.box_geometry (WO-03 D2)", () => {
  it("builds nothing without the required answers, and an unknown cannot stand in for one", () => {
    const r = buildQuickPass({ quick_pass_version: "0.1.0", year_built: { unknown: "didnt_inspect" } }, ctx());
    expect(r.assessment).toBeNull();
    const required = r.issues.filter((i) => i.code === "required").map((i) => i.question);
    expect(required.sort()).toEqual(["bedrooms", "floor_area", "front_azimuth", "garage", "stories", "year_built"]);
    expect(r.issues.find((i) => i.question === "year_built")!.message).toMatch(/unknown cannot stand in/);
    expect(r.status.year_built).toBe("didnt_inspect");
    expect(r.status.floor_area).toBe("not_answered");
  });

  it("the minimum answers give a complete Assessment: no unknown, every value sourced, answers keep their state", () => {
    const r = buildQuickPass(minimal, ctx());
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    const a = r.assessment!;
    const all = collectFields(a);
    expect(all.length).toBeGreaterThan(150);
    for (const { path, field } of all) {
      expect(field.state, path).not.toBe("unknown");
      expect(field.state, path).not.toBe("proposed");
      expect((field as { source: string }).source.length, path).toBeGreaterThan(5);
    }
    expect(field(a, "building.building_construction.year_built")).toMatchObject({ value: 1964, state: "assumed", source: "quick pass Q2 (Year built), answered by the tech" });
    expect(field(a, "building.building_construction.average_ceiling_height")).toMatchObject({ value: 8, state: "defaulted" });
    expect(field(a, "building.building_construction.average_ceiling_height").source).toMatch(/geometry_average_ceiling_height default 8 ft/);
    expect(a.template_id).toBe("dfw-pre1980-ranch-slab");
    expect(a.template_version).toBeUndefined();
  });

  it("the box: aspect ratio 2, walls and slab match the floor area, windows 15 % split equally", () => {
    const a = buildQuickPass(minimal, ctx()).assessment!;
    const e = a.building.enclosure;
    const L = Math.sqrt(2 * 1600);
    const W = 1600 / L;
    expect(e.walls.find((w) => w.id === "wall-front")!.area.value).toBeCloseTo(L * 8, 1);
    expect(e.walls.find((w) => w.id === "wall-left")!.area.value).toBeCloseTo(W * 8, 1);
    expect(e.slabs[0]!.area.value).toBe(1600);
    expect(e.slabs[0]!.exposed_perimeter.value).toBeCloseTo(2 * (L + W), 1);
    const glass = e.windows.reduce((s, w) => s + (w.area.value ?? 0), 0);
    expect(glass).toBeCloseTo(0.15 * 1600, 0);
    expect(new Set(e.windows.map((w) => w.area.value)).size).toBe(1);
    expect(e.windows.map((w) => w.azimuth.value ?? -1).sort((x, y) => x - y)).toEqual([0, 90, 180, 270]);
    expect(e.windows[0]!.area.source).toMatch(/plan v2 §Quick pass: typical glazing/);
    expect(a.building.building_construction.conditioned_building_volume!.value).toBe(12800);
  });

  it("template values fill what was not answered; nominal R becomes a derived assembly R; ResDB gives the ACH50", () => {
    const a = buildQuickPass(minimal, ctx()).assessment!;
    const ceiling = a.building.enclosure.floors.find((f) => f.id === "ceiling-main")!;
    expect(ceiling.insulation_cavity_r_value).toMatchObject({ value: 11, state: "defaulted" });
    expect(ceiling.insulation_cavity_r_value!.source).toMatch(/^template:dfw-pre1980-ranch-slab/);
    expect(ceiling.insulation_assembly_r_value).toMatchObject({ state: "derived" });
    expect(ceiling.insulation_assembly_r_value.source).toMatch(/MJ8\.construction\.assembly_r/);
    const wall = a.building.enclosure.walls.find((w) => w.id === "wall-front")!;
    expect(wall.insulation_cavity_r_value!.value).toBe(0);
    // Uninsulated 2x4 brick-veneer wall: the oracle-verified value (assembly-r.json, first case).
    expect(wall.insulation_assembly_r_value.value).toBeCloseTo(4.15, 2);
    const leak = a.building.enclosure.air_infiltration.air_leakage;
    expect(leak).toMatchObject({ state: "derived", unit: "ACH50" });
    expect(leak.source).toMatch(/RHOE\.infiltration\.resdb_ach50 .*"average" multiplier \(Q11 not answered, average used\)/);
    expect(leak.value).toBeGreaterThan(5);
  });

  it("leakiness choices order the ACH50 tight < average < leaky", () => {
    const ach = (t: "tight" | "average" | "leaky") => buildQuickPass({ ...minimal, tightness: A(t) }, ctx()).assessment!.building.enclosure.air_infiltration.air_leakage.value!;
    expect(ach("tight")).toBeLessThan(ach("average"));
    expect(ach("average")).toBeLessThan(ach("leaky"));
    expect(ach("leaky") / ach("average")).toBeCloseTo(1.549, 2);
  });

  it("expert entries stay measured or documented with their own source (usability task 7)", () => {
    const r = buildQuickPass(
      {
        ...minimal,
        tightness: A({ ach50: 9.4 }, "measured", "blower door 2026-10-25"),
        window_type: A({ ufactor: 0.35, shgc: 0.3 }, "documented", "NFRC label"),
        window_amount: A({ total_area_ft2: 200 }, "measured", "window takeoff"),
        attic_insulation: A({ depth_in: 10, material: "cellulose" as const }, "measured", "tape in frame"),
      },
      ctx(),
    );
    const a = r.assessment!;
    expect(field(a, "building.enclosure.air_infiltration.air_leakage")).toMatchObject({ value: 9.4, state: "measured", source: "blower door 2026-10-25", unit: "ACH50" });
    expect(field(a, "building.enclosure.windows[0].ufactor")).toMatchObject({ value: 0.35, state: "documented", source: "NFRC label" });
    expect(field(a, "building.enclosure.windows[0].area")).toMatchObject({ value: 50, state: "measured" });
    const ceiling = field(a, "building.enclosure.floors[0].insulation_cavity_r_value");
    expect(ceiling).toMatchObject({ value: 35, state: "derived" });
    expect(ceiling.source).toMatch(/measured depth 10 in \(tape in frame, measured\) x R-3.5 per inch/);
  });

  it("choices map to the cited tables", () => {
    const a = buildQuickPass({ ...minimal, window_type: A("single_clear_metal" as const), attic_insulation: A("modern" as const) }, ctx()).assessment!;
    expect(field(a, "building.enclosure.windows[0].ufactor")).toMatchObject({ value: 1.27, state: "assumed" });
    expect(field(a, "building.enclosure.windows[0].shgc").value).toBe(0.75);
    expect(field(a, "building.enclosure.windows[0].ufactor").source).toMatch(/defaults\.rb 6468/);
    expect(field(a, "building.enclosure.floors[0].insulation_cavity_r_value")).toMatchObject({ value: 30, state: "assumed" });
    expect(field(a, "building.enclosure.floors[0].insulation_assembly_r_value").source).toMatch(/R-19 between the joists and R-11 above/);
  });

  it("unknown answers fall back to the template with the ADR-027 wording", () => {
    const a = buildQuickPass({ ...minimal, attic_insulation: { unknown: "inspected_cant_tell" }, window_type: { unknown: "didnt_inspect" } }, ctx()).assessment!;
    expect(field(a, "building.enclosure.floors[0].insulation_cavity_r_value")).toMatchObject({ value: 11, state: "defaulted", note: "inspected, could not determine" });
    expect(field(a, "building.enclosure.windows[0].ufactor")).toMatchObject({ state: "defaulted", note: "not inspected" });
  });

  it("pier and beam is the default before 1960; ducts can then run in the crawlspace", () => {
    const r = buildQuickPass({ ...minimal, year_built: A(1955), duct_location: A("crawlspace" as const) }, ctx());
    const a = r.assessment!;
    expect(field(a, "building.enclosure.foundations[0].foundation_type")).toMatchObject({ value: "vented crawlspace", state: "defaulted" });
    expect(a.building.enclosure.floors.some((f) => f.id === "floor-crawl")).toBe(true);
    expect(a.building.enclosure.foundation_walls).toHaveLength(4);
    expect(a.building.systems.hvac.hvac_distributions[0]!.ducts[0]!.duct_location.value).toBe("crawlspace - vented");
  });

  it("garage and room over it: shared walls, bonus walls carry windows, floor over the garage", () => {
    const a = buildQuickPass(QUICK_PASS_HOUSES[2]!.answers, ctx("dfw-2001-2011-two-story-iecc2000")).assessment!;
    const e = a.building.enclosure;
    expect(e.walls.find((w) => w.id === "wall-garage")!.exterior_adjacent_to.value).toBe("garage");
    expect(e.walls.filter((w) => w.interior_adjacent_to.value === "garage")).toHaveLength(3);
    expect(e.floors.find((f) => f.id === "floor-over-garage")!.area.value).toBe(420);
    expect(e.windows.some((w) => w.attached_to_wall === "bonus-wall-side")).toBe(true);
    const glass = e.windows.reduce((s, w) => s + (w.area.value ?? 0), 0);
    expect(glass).toBeCloseTo(0.15 * 2820, 0);
    const cfa = a.building.building_construction.conditioned_floor_area.value!;
    const ceilings = e.floors.filter((f) => f.floor_or_ceiling?.value === "ceiling" && f.interior_adjacent_to.value === "conditioned space").reduce((s, f) => s + f.area.value!, 0);
    expect(ceilings * 2 - 420).toBeCloseTo(cfa, 0);
    // Sealed ducts: IECC 4 cfm25 per 100 ft2, split 2/3 and 1/3.
    const m = a.building.systems.hvac.hvac_distributions[0]!.duct_leakage_measurements;
    expect(m[0]!.value).toMatchObject({ unit: "cfm25", state: "derived" });
    expect(m[0]!.value.value! + m[1]!.value.value!).toBeCloseTo((4 * 2820) / 100, 2);
  });

  it("a stored template version is carried on the Assessment (C7)", () => {
    const a = buildQuickPass(minimal, ctx("dfw-pre1980-ranch-slab", "v3")).assessment!;
    expect(a.template_version).toBe("v3");
    expect(field(a, "building.enclosure.floors[0].insulation_cavity_r_value").source).toMatch(/^template:dfw-pre1980-ranch-slab/);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(buildQuickPass(minimal, ctx()).assessment)).toBe(JSON.stringify(buildQuickPass(minimal, ctx()).assessment));
  });

  it("refuses a station outside the pinned library (WO-03 §7)", () => {
    const r = buildQuickPass({ ...minimal, station_key: A("722430") }, ctx());
    expect(r.assessment).toBeNull();
    expect(r.issues[0]).toMatchObject({ question: "station_key", code: "unsupported_station" });
  });

  it("every quick-pass reference house runs in the engine", async () => {
    for (const h of QUICK_PASS_HOUSES) {
      const r = buildQuickPass(h.answers, { ...ctx(h.template), assessment_id: h.assessment_id });
      expect(r.assessment, h.name).not.toBeNull();
      const out = await run(r.assessment!);
      expect(out.status, h.name).toBe("ok");
    }
  });
});

describe("D7 checks before a run (GEO-002)", () => {
  const issues = (answers: QuickPassAnswersInput) => checkQuickPassAnswers(QuickPassAnswersSchema.parse(answers), new Date("2026-10-25T00:00:00Z"));

  it("impossible values are errors", () => {
    expect(issues({ ...minimal, year_built: A(1700) })[0]).toMatchObject({ code: "impossible_year", severity: "error" });
    expect(issues({ ...minimal, year_built: A(2028) })[0]).toMatchObject({ code: "impossible_year" });
    expect(issues({ ...minimal, floor_area: A(200) })[0]).toMatchObject({ code: "impossible_floor_area" });
    expect(issues({ ...minimal, ceiling_height: A(4) })[0]).toMatchObject({ code: "impossible_ceiling_height" });
    expect(issues({ ...minimal, window_amount: A({ total_area_ft2: 900 }) })[0]).toMatchObject({ code: "window_area_impossible" });
    expect(issues({ ...minimal, window_type: A({ ufactor: 3, shgc: 0.5 }) })[0]).toMatchObject({ code: "impossible_ufactor" });
    expect(issues({ ...minimal, attic_insulation: A({ nominal_r: 120 }) })[0]).toMatchObject({ code: "impossible_attic_r" });
  });

  it("inconsistent answers are errors that block the build", () => {
    expect(issues({ ...minimal, room_over_garage: A(true) }).map((i) => i.code)).toEqual(["room_over_garage_one_story", "room_over_no_garage"]);
    const r = buildQuickPass({ ...minimal, duct_location: A("garage" as const) }, ctx());
    expect(r.assessment).toBeNull();
    expect(r.issues[0]).toMatchObject({ code: "ducts_in_missing_garage" });
    const r2 = buildQuickPass({ ...minimal, foundation: A("slab" as const), duct_location: A("crawlspace" as const) }, ctx());
    expect(r2.issues[0]).toMatchObject({ code: "ducts_in_missing_crawlspace" });
  });

  it("unusual values are warnings, and a plausible house has none", () => {
    expect(issues({ ...minimal, tightness: A({ ach50: 80 }) })[0]).toMatchObject({ code: "unusual_ach50", severity: "warning" });
    expect(issues({ ...minimal, window_amount: A({ total_area_ft2: 30 }) })[0]).toMatchObject({ code: "window_area_low", severity: "warning" });
    expect(issues(minimal)).toEqual([]);
  });

  it("windows against wall area: more glass than wall is an error", () => {
    const a = structuredClone(buildQuickPass(minimal, ctx()).assessment!);
    a.building.enclosure.windows[0]!.area = { ...a.building.enclosure.windows[0]!.area, value: 5000 } as typeof a.building.enclosure.windows[0]["area"];
    expect(checkAssessmentGeometry(a).find((i) => i.code === "openings_exceed_wall")).toBeTruthy();
    expect(checkAssessmentGeometry(buildQuickPass(minimal, ctx()).assessment!)).toEqual([]);
  });
});

describe("conflicting values are kept, not overwritten (D3; PRV-002, PRV-003)", () => {
  const plan = { value: 1650, state: "documented" as const, source: "plan sheet A1", evidence: [] };

  it("a conflict without a reason blocks the build and names every value", () => {
    const r = buildQuickPass({ ...minimal, floor_area: { value: 1600, state: "measured", source: "tape", alternatives: [plan] } }, ctx());
    expect(r.assessment).toBeNull();
    expect(r.issues[0]).toMatchObject({ question: "floor_area", severity: "error", code: "conflict_needs_rationale" });
    expect(r.issues[0]!.message).toMatch(/2 different values \(1600, 1650\)/);
  });

  it("with a reason, the value in use carries a note naming the kept conflict and the reason", () => {
    const r = buildQuickPass({ ...minimal, floor_area: { value: 1600, state: "measured", source: "tape", alternatives: [plan], rationale: "plan includes the enclosed porch" } }, ctx());
    const f = field(r.assessment!, "building.building_construction.conditioned_floor_area");
    expect(f).toMatchObject({ value: 1600, state: "measured", source: "tape" });
    expect(f.note).toBe("conflicting value kept: 1650 (documented, plan sheet A1); chose 1600 because plan includes the enclosed porch");
  });

  it("an alternative with the same value corroborates and needs no reason", () => {
    const r = buildQuickPass({ ...minimal, floor_area: { value: 1600, state: "measured", source: "tape", alternatives: [{ ...plan, value: 1600 }] } }, ctx());
    expect(r.assessment).not.toBeNull();
    expect(field(r.assessment!, "building.building_construction.conditioned_floor_area").note).toBeUndefined();
  });

  it("works for object answers too, e.g. a blower door against the tightness guess", () => {
    const r = buildQuickPass(
      { ...minimal, tightness: { value: { ach50: 9.4 }, state: "measured", source: "blower door", alternatives: [{ value: "leaky", state: "assumed", source: "walkthrough" }], rationale: "tested beats a guess" } },
      ctx(),
    );
    expect(field(r.assessment!, "building.enclosure.air_infiltration.air_leakage").note).toMatch(/kept: leaky \(assumed, walkthrough\); chose \{"ach50":9.4\} because tested beats a guess/);
  });
});
