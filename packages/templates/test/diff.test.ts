import { describe, expect, it } from "vitest";
import { TEMPLATES, diffTemplates, getTemplate, rankFrom, rankTemplates, suggestFrom, suggestTemplates, templateMismatches } from "../src/index.js";

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

describe("rankFrom (owner 2026-11-07: every template on a job, suggested first)", () => {
  const ids = (r: { template: { template_id: string } }[]) => r.map((x) => x.template.template_id);

  it("lists every template, best fit first and the only one marked", () => {
    const r = rankTemplates({ year_built: 1946, stories: 1, foundation: "crawlspace" });
    expect(r).toHaveLength(TEMPLATES.length);
    expect(ids(r).slice(0, 2)).toEqual(["dfw-pre1950-pier-beam", "dfw-1950s-pier-beam"]);
    expect(r.filter((x) => x.suggested).map((x) => x.template.template_id)).toEqual(["dfw-pre1950-pier-beam"]);
    expect(new Set(ids(r)).size).toBe(TEMPLATES.length);
  });

  it("a slab house of the same era gets the ranch on slab", () => {
    expect(rankTemplates({ year_built: 1964, stories: 1, foundation: "slab" })[0]!.template.template_id).toBe("dfw-pre1980-ranch-slab");
    expect(rankTemplates({ year_built: 1964, stories: 1, foundation: "crawlspace" })[0]!.template.template_id).toBe("dfw-1960s-pier-beam");
    expect(rankTemplates({ year_built: 1955, stories: 1, foundation: "slab" })[0]!.template.template_id).toBe("dfw-1950s-slab");
    expect(rankTemplates({ year_built: 1975, stories: 1 })[0]!.template.template_id).toBe("dfw-1970s-ranch-slab");
  });

  it("fills the gaps: 1986 and 2014 one-story houses have their own templates", () => {
    expect(rankTemplates({ year_built: 1986, stories: 1 })[0]!.template.template_id).toBe("dfw-1980-2000-one-story");
    expect(rankTemplates({ year_built: 1986, stories: 2 })[0]!.template.template_id).toBe("dfw-1980-2000-two-story");
    expect(rankTemplates({ year_built: 2014, stories: 1 })[0]!.template.template_id).toBe("dfw-2012-2016-one-story-irc2009");
  });

  it("after the era matches, the nearest era comes next", () => {
    const r = rankTemplates({ year_built: 1985, stories: 1 });
    const firstOutside = r.find((x) => !x.era_match)!;
    expect(firstOutside.template.template_id).toBe("dfw-1970s-ranch-slab");
    expect(r.at(-1)!.template.template_id).toBe("dfw-2021-iecc2021");
  });

  it("suggests nothing without a year, or when every era match contradicts the answers", () => {
    expect(rankTemplates({}).some((x) => x.suggested)).toBe(false);
    expect(ids(rankTemplates({}))).toEqual(TEMPLATES.map((t) => t.template_id));
    // Only one-story, slab templates cover 1990 in this tiny set; a three-story answer contradicts it.
    const r = rankFrom([getTemplate("dfw-1980-2000-one-story")], { year_built: 1990, stories: 3 });
    expect(r[0]!.era_match).toBe(true);
    expect(r[0]!.suggested).toBe(false);
  });

  it("explains a mismatch in plain words, and says nothing when it fits", () => {
    const t = getTemplate("dfw-1980-2000-two-story");
    expect(templateMismatches(t, { year_built: 1946, stories: 1, foundation: "crawlspace" })).toEqual([
      "the house was built in 1946 and this template covers 1980 to 2000",
      "the house has 1 story and this template has 2",
      "the house is on pier and beam and this template is on a slab",
    ]);
    expect(templateMismatches(getTemplate("dfw-pre1950-pier-beam"), { year_built: 1946, stories: 1, foundation: "crawlspace" })).toEqual([]);
    expect(templateMismatches(getTemplate("dfw-pre1950-pier-beam"), { year_built: 1990 })).toEqual(["the house was built in 1990 and this template covers 1949 and earlier"]);
    expect(templateMismatches(getTemplate("dfw-pre1980-ranch-slab"), { year_built: 1946 })).toEqual(["the house was built in 1946 and this template covers 1960 to 1969"]);
    expect(templateMismatches(t, {})).toEqual([]);
  });
});
