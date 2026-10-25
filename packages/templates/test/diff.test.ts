import { describe, expect, it } from "vitest";
import { TEMPLATES, diffTemplates, getTemplate, suggestFrom, suggestTemplates } from "../src/index.js";

describe("template diff (D9)", () => {
  it("lists exactly the changed leaves, with stable paths", () => {
    const a = getTemplate("dfw-pre1980-ranch-slab");
    const b = structuredClone(a);
    b.defaults.window_shgc!.value = 0.7;
    b.sanity_band = { ft2_per_ton: { low: 400, high: 500 }, sources: ["owner-field-data"], basis: "refined" };
    const changes = diffTemplates(a, b);
    expect(changes.map((c) => c.path)).toEqual(["defaults.window_shgc.value", "sanity_band.basis", "sanity_band.ft2_per_ton.high", "sanity_band.ft2_per_ton.low"]);
    expect(changes[0]).toEqual({ path: "defaults.window_shgc.value", from: 0.8, to: 0.7 });
    expect(diffTemplates(a, structuredClone(a))).toEqual([]);
  });

  it("treats sources as keyed by id, so a reorder is not a change but an edit is", () => {
    const a = getTemplate("dfw-pre1980-ranch-slab");
    const b = structuredClone(a);
    b.sources.reverse();
    expect(diffTemplates(a, b)).toEqual([]);
    b.sources[0]!.citation = "edited";
    expect(diffTemplates(a, b)).toHaveLength(1);
    expect(diffTemplates(a, b)[0]!.path).toMatch(/^sources\[/);
  });

  it("against nothing, a new template lists every value", () => {
    expect(diffTemplates(null, getTemplate("dfw-pre1980-ranch-slab")).length).toBeGreaterThan(20);
  });
});

describe("suggestFrom (D2)", () => {
  it("matches suggestTemplates on the repo set and ranks the story match first", () => {
    expect(suggestFrom(TEMPLATES, 2005, 2).map((t) => t.template_id)).toEqual(suggestTemplates(2005, 2).map((t) => t.template_id));
    expect(suggestFrom(TEMPLATES, 2005, 2)[0]!.style.stories).toBe(2);
    expect(suggestFrom([], 2005)).toEqual([]);
  });
});
