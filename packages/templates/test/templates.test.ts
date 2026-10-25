import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { collectFields, validateAssessment } from "@rhoeflow/schema";
import { minimalAssessment } from "@rhoeflow/schema/testing";
import { DFW_WEATHER_REF, TEMPLATES, TemplateSchema, applyTemplate, getTemplate, ranchBaseAssessment, suggestTemplates, twoStoryBaseAssessment } from "../src/index.js";

describe("the templates (ADR-024)", () => {
  it("load, validate and have unique ids covering the eras in order", () => {
    expect(TEMPLATES.map((t) => t.template_id)).toEqual([
      "dfw-pre1980-ranch-slab",
      "dfw-1980-2000-two-story",
      "dfw-2001-2011-one-story-iecc2000",
      "dfw-2001-2011-two-story-iecc2000",
      "dfw-2012-2016-two-story-irc2009",
      "dfw-2016-2020-iecc2015",
      "dfw-2021-iecc2021",
    ]);
    for (const t of TEMPLATES) expect(TemplateSchema.safeParse(t).success).toBe(true);
    // Eras are contiguous; a code-change year (2016: 2015 IECC effective September) may belong
    // to two, and one era may have several style variants (same year range).
    for (let i = 1; i < TEMPLATES.length; i++) {
      const prev = TEMPLATES[i - 1]!.era;
      const cur = TEMPLATES[i]!.era;
      if (cur.year_from === prev.year_from && cur.year_to === prev.year_to) continue; // style sibling
      const prevEnd = prev.year_to ?? 0;
      expect(cur.year_from).toBeGreaterThanOrEqual(prevEnd);
      expect(cur.year_from).toBeLessThanOrEqual(prevEnd + 1);
    }
    expect(suggestTemplates(2016).map((t) => t.template_id).sort()).toEqual(["dfw-2012-2016-two-story-irc2009", "dfw-2016-2020-iecc2015"]);
  });

  it("the 2001 to 2011 siblings differ only in style and identity", () => {
    const one = getTemplate("dfw-2001-2011-one-story-iecc2000");
    const two = getTemplate("dfw-2001-2011-two-story-iecc2000");
    expect(two.style.stories).toBe(2);
    expect(two.era).toEqual(one.era);
    expect(two.defaults).toEqual(one.defaults);
    expect(suggestTemplates(2010, 2)[0]!.template_id).toBe("dfw-2001-2011-two-story-iecc2000");
  });

  it("every default cites at least one source and sits inside its range", () => {
    for (const t of TEMPLATES) {
      for (const [slot, v] of Object.entries(t.defaults)) {
        expect(v, `${t.template_id}.${slot}`).toBeDefined();
        expect(v!.sources.length).toBeGreaterThan(0);
        expect(v!.basis.length).toBeGreaterThan(10);
      }
    }
  });

  it("rejects a template whose default cites an unknown source or breaks its range", () => {
    const t = structuredClone(getTemplate("dfw-pre1980-ranch-slab")) as unknown as { defaults: Record<string, { sources: string[]; value: number }> };
    t.defaults["window_shgc"]!.sources = ["nope"];
    expect(TemplateSchema.safeParse(t).success).toBe(false);
    const t2 = structuredClone(getTemplate("dfw-pre1980-ranch-slab")) as unknown as { defaults: Record<string, { value: number }> };
    t2.defaults["air_leakage"]!.value = 99;
    expect(TemplateSchema.safeParse(t2).success).toBe(false);
  });

  it("suggests by year and prefers the matching story count; never applies", () => {
    expect(suggestTemplates(1964).map((t) => t.template_id)).toEqual(["dfw-pre1980-ranch-slab"]);
    expect(suggestTemplates(2010, 1)[0]!.template_id).toBe("dfw-2001-2011-one-story-iecc2000");
    expect(suggestTemplates(2030)[0]!.template_id).toBe("dfw-2021-iecc2021");
  });
});

describe("applyTemplate", () => {
  it("fills the ranch's unknown fields as defaulted with the template citation, and nothing else", () => {
    const base = validateAssessment(ranchBaseAssessment());
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const unknownBefore = collectFields(base.assessment).filter((f) => f.field.state === "unknown").map((f) => f.path);
    expect(unknownBefore.length).toBe(13); // 4 windows x 2, air leakage, 2 duct R, 2 duct leakage

    const { assessment, applied, skipped } = applyTemplate(base.assessment, getTemplate("dfw-pre1980-ranch-slab"));
    expect(assessment.template_id).toBe("dfw-pre1980-ranch-slab");
    expect(collectFields(assessment).filter((f) => f.field.state === "unknown")).toEqual([]);
    expect(applied.map((a) => a.slot).sort()).toEqual(
      [
        "air_leakage",
        "ceiling_insulation_cavity_r",
        "duct_insulation_r", "duct_insulation_r",
        "duct_leakage_to_outside", "duct_leakage_to_outside",
        "wall_insulation_cavity_r", "wall_insulation_cavity_r", "wall_insulation_cavity_r", "wall_insulation_cavity_r",
        "window_shgc", "window_shgc", "window_shgc", "window_shgc",
        "window_ufactor", "window_ufactor", "window_ufactor", "window_ufactor",
      ].sort(),
    );
    expect(skipped).toEqual([]);

    const ach = assessment.building.enclosure.air_infiltration.air_leakage;
    expect(ach).toMatchObject({ value: 12, unit: "ACH50", state: "defaulted", note: "template default replaced unknown (didnt_inspect)" });
    expect(ach.source).toContain("template:dfw-pre1980-ranch-slab");
    expect(ach.source).toContain("RhoeFlow plan v2");
    expect(ach.source).toContain("Middle of the pre-1980 range");
    expect(assessment.building.enclosure.walls[0]!.insulation_cavity_r_value?.source).toContain("SECO");
    expect(assessment.building.enclosure.walls[0]!.insulation_cavity_r_value).toMatchObject({ value: 0, state: "defaulted" });
    // Duct leakage: template total 0.20 split 2/3 supply, 1/3 return (WO-02 A2).
    const leaks = assessment.building.systems.hvac.hvac_distributions[0]!.duct_leakage_measurements;
    expect(leaks[0]!.value).toMatchObject({ value: 0.1333, unit: "fraction", state: "defaulted" });
    expect(leaks[1]!.value).toMatchObject({ value: 0.0667, unit: "fraction", state: "defaulted" });
    expect(leaks[0]!.value.value! + leaks[1]!.value.value!).toBeCloseTo(0.2, 10);
    expect(leaks[0]!.value.source).toContain("supply share 2/3 of the template total");
    // Known values untouched.
    expect(assessment.building.enclosure.walls[0]!.insulation_assembly_r_value.state).toBe("assumed");
    expect(assessment.building.enclosure.roofs[0]!.radiant_barrier).toMatchObject({ value: false, state: "documented" });
    // Still a valid assessment.
    expect(validateAssessment(assessment).ok).toBe(true);
    // Input not mutated.
    expect(collectFields(base.assessment).filter((f) => f.field.state === "unknown").length).toBe(13);
  });

  it("never overwrites measured, documented or assumed values", () => {
    const base = validateAssessment(minimalAssessment());
    if (!base.ok) throw new Error("fixture invalid");
    const { assessment, applied, skipped } = applyTemplate(base.assessment, getTemplate("dfw-2021-iecc2021"));
    expect(applied.filter((a) => a.slot === "window_ufactor")).toEqual([]);
    expect(skipped.find((s) => s.slot === "window_ufactor")?.reason).toBe("kept documented value");
    expect(assessment.building.enclosure.windows[0]!.ufactor.value).toBe(1.0);
    // Absent optional fields (cavity R) are filled.
    expect(assessment.building.enclosure.walls[0]!.insulation_cavity_r_value).toMatchObject({ value: 20, state: "defaulted" });
    // Boolean slot applied over the documented radiant barrier? No: documented wins.
    expect(skipped.find((s) => s.slot === "roof_radiant_barrier")?.reason).toBe("kept documented value");
  });

  it("skips a slot whose unit the target cannot take instead of converting", () => {
    const base = validateAssessment(ranchBaseAssessment());
    if (!base.ok) throw new Error("fixture invalid");
    const { skipped } = applyTemplate(base.assessment, getTemplate("dfw-2016-2020-iecc2015"));
    const leak = skipped.filter((s) => s.slot === "duct_leakage_to_outside");
    expect(leak.length).toBe(2);
    expect(leak[0]!.reason).toContain("cfm25/100ft2");
    expect(leak[0]!.reason).toContain("WO-02");
  });
});

describe("committed calc fixtures", () => {
  const houses = [
    { name: "ranch-1960s-dfw", base: ranchBaseAssessment, template: "dfw-pre1980-ranch-slab" },
    { name: "two-story-2010-dfw", base: twoStoryBaseAssessment, template: "dfw-2001-2011-two-story-iecc2000" },
  ];
  for (const h of houses) {
    it(`${h.name} matches what the generator produces from its base + template (no silent drift)`, () => {
      const file = resolve(import.meta.dirname, `../../calc/fixtures/${h.name}.fixture.json`);
      const committed = JSON.parse(readFileSync(file, "utf8")) as { input: { assessment: unknown; weather: unknown } };
      const base = validateAssessment(h.base());
      if (!base.ok) throw new Error(`${h.name} base invalid: ${JSON.stringify(base.issues)}`);
      const { assessment } = applyTemplate(base.assessment, getTemplate(h.template));
      expect(committed.input.assessment).toEqual(JSON.parse(JSON.stringify(assessment)));
      expect(committed.input.weather).toEqual(DFW_WEATHER_REF);
    });
  }

  it("two-story: the template fills every unknown and keeps the derived duct leakage", () => {
    const base = validateAssessment(twoStoryBaseAssessment());
    if (!base.ok) throw new Error("invalid");
    expect(collectFields(base.assessment).filter((f) => f.field.state === "unknown").length).toBe(11); // 4 windows x 2, air leakage, 2 duct R
    const { assessment, skipped } = applyTemplate(base.assessment, getTemplate("dfw-2001-2011-two-story-iecc2000"));
    expect(collectFields(assessment).filter((f) => f.field.state === "unknown")).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(["kept derived value", "kept derived value"]);
    expect(assessment.building.enclosure.windows[0]!.ufactor).toMatchObject({ value: 0.4, state: "defaulted" });
    expect(assessment.building.enclosure.air_infiltration.air_leakage).toMatchObject({ value: 7, unit: "ACH50", state: "defaulted" });
  });
});
