import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { printed, type RoundingRuleId } from "@rhoeflow/report";
import { FONT_FILES } from "../src/fonts.generated.js";
import { renderReportHtml, reportBodyHtml, reportPdfOptions } from "../src/index.js";
import { FIXTURES, markupNumbers, modelFor, printedNumbers } from "./helpers.js";

const key = (raw: number, rule: string, text: string) => `${raw}|${rule}|${text}`;

describe("report markup prints the model's numbers under their rules (RPT-001)", () => {
  for (const file of FIXTURES) {
    it(`${file}: every number in the markup is its raw value under its rule, and every model number is printed`, async () => {
      const { model } = await modelFor(file);
      const markup = reportBodyHtml(model);
      const nums = markupNumbers(markup);
      // Every <span class="num"> was parsed (none slipped past the pattern).
      expect(nums.length).toBe((markup.match(/<span class="num"/g) ?? []).length);
      expect(nums.length).toBeGreaterThan(50);
      for (const n of nums) {
        expect(Number.isFinite(n.raw), JSON.stringify(n)).toBe(true);
        expect(n.text, JSON.stringify(n)).toBe(printed(n.raw, n.rule as RoundingRuleId).text);
      }
      // Coverage: each printed number of the model appears in the markup with its raw value, rule and text.
      const shown = new Set(nums.map((n) => key(n.raw, n.rule, n.text)));
      const missing = [...printedNumbers(model)].filter(({ n }) => !shown.has(key(n.raw, n.rule, n.text))).map(({ path }) => path);
      expect(missing).toEqual([]);
    });
  }
});

describe("the PDF document (ADR-037)", () => {
  it("is the page's markup inside a self-contained document: no script, link, image or outside URL", async () => {
    const { model } = await modelFor("qp-ranch-1964-slab.fixture.json");
    const doc = renderReportHtml(model);
    expect(doc).toContain(reportBodyHtml(model));
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    for (const banned of [/<script/i, /<link/i, /<img/i, /<iframe/i, /\ssrc=/i, /\shref=/i, /@import/i]) expect(doc).not.toMatch(banned);
    const urls = [...doc.matchAll(/url\(([^)]{0,40})/g)].map((m) => m[1]!);
    expect(urls.length).toBe(4);
    for (const u of urls) expect(u.startsWith("data:font/woff2;base64,")).toBe(true);
  });

  it("escapes every text it prints (a WorkEdge address cannot inject markup)", async () => {
    const { model } = await modelFor("qp-ranch-1964-slab.fixture.json", { property_label: { text: `12 "Oak" & Elm <img src=x onerror=alert(1)>`, source: "WorkEdge property we_property_x" } });
    const markup = reportBodyHtml(model);
    expect(markup).not.toContain("<img");
    expect(markup).toContain("12 &quot;Oak&quot; &amp; Elm &lt;img src=x onerror=alert(1)&gt;");
  });

  it("uses US Letter with a footer that names the run and numbers the pages", async () => {
    const { model } = await modelFor("qp-ranch-1964-slab.fixture.json");
    const o = reportPdfOptions(model);
    expect(o.format).toBe("letter");
    expect(o.displayHeaderFooter).toBe(true);
    expect(o.footerTemplate).toContain(model.meta.run_id);
    expect(o.footerTemplate).toContain('class="pageNumber"');
    expect(o.footerTemplate).toContain('class="totalPages"');
  });

  it("embeds the committed font files byte for byte (regenerate with the package's fonts script)", () => {
    const dir = resolve(import.meta.dirname, "../fonts");
    expect(existsSync(resolve(dir, "OFL.txt"))).toBe(true);
    expect(Object.keys(FONT_FILES).sort()).toEqual(["geist-latin-ext.woff2", "geist-latin.woff2", "geist-mono-latin-ext.woff2", "geist-mono-latin.woff2"]);
    for (const [name, f] of Object.entries(FONT_FILES)) {
      const bytes = readFileSync(resolve(dir, name));
      expect(createHash("sha256").update(bytes).digest("hex"), name).toBe(f.sha256);
      expect(Buffer.from(f.base64, "base64").equals(bytes), name).toBe(true);
    }
  });
});
