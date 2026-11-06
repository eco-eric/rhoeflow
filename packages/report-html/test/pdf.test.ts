import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ReportModel } from "@rhoeflow/report";
import { fetchEmbeddedImage, renderReportHtml, reportBodyHtml, reportDownloadName, reportFooterLabel, reportPdfFileName, reportPdfOptions, type ReportExtras } from "../src/index.js";
import { comparable, fakeSatellite, FIXTURES, markupNumbers, modelFor } from "./helpers.js";

/**
 * Printed equals run, in the PDF itself (WO-03 E2, ADR-037, RPT-001).
 *
 * Browser Run can't be called from CI, so this prints the same document with the same page setup
 * in a local headless Chromium (Puppeteer), reads the PDF's text back with pdf.js, and checks:
 *  - the PDF's text is the report's text, character for character (whitespace and list bullets
 *    aside), once each page's footer is taken off; nothing dropped, reordered or re-rounded;
 *  - every number span, in order, appears in the PDF exactly as printed, unit included; the
 *    markup test already ties each span to its raw value under its rounding rule, and the report
 *    tests tie each raw value to the stored run;
 *  - the page used the embedded Geist fonts, not a fallback.
 *
 * Needs a Chromium: `pnpm --filter @rhoeflow/report-html browser` installs Puppeteer's headless
 * shell, or set PUPPETEER_EXECUTABLE_PATH. Without one the check is skipped locally and fails in CI.
 * Set REPORT_PDF_OUT to a folder to keep the PDFs.
 */

let browser: Browser | null = null;
let why = "";

beforeAll(async () => {
  try {
    const puppeteer = (await import("puppeteer")).default;
    browser = await puppeteer.launch({ headless: "shell", args: process.env["CI"] ? ["--no-sandbox"] : [] });
  } catch (e) {
    why = e instanceof Error ? e.message.split("\n")[0]! : String(e);
    if (process.env["CI"]) throw new Error(`The PDF check needs a browser in CI: ${why}`);
    console.warn(`Skipping the PDF check, no browser: ${why}`);
  }
});

afterAll(async () => {
  await browser?.close();
});

async function pdfPageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(""));
  }
  await task.destroy();
  return pages;
}

/**
 * Print one report and check it; returns how many images the PDF draws. `outName` is the file it is
 * kept under when REPORT_PDF_OUT is set.
 */
async function checkPdf(b: Browser, model: ReportModel, extras: ReportExtras, outName: string): Promise<number> {
  const page = await b.newPage();
  try {
    await page.setContent(renderReportHtml(model, extras), { waitUntil: "load" });
    await page.emulateMediaType("print");
    await page.evaluate(() => document.fonts.ready.then(() => undefined));

    // The fonts that drew the page are the embedded ones.
    const families = await page.evaluate(() => {
      const loaded: string[] = [];
      document.fonts.forEach((f) => {
        if (f.status === "loaded") loaded.push(f.family.replace(/["']/g, ""));
      });
      return loaded;
    });
    expect(families).toContain("Geist");
    expect(families).toContain("Geist Mono");

    // The page shows the same spans the markup test checked.
    const spans = await page.$$eval("span.num", (els) => els.map((e) => ({ raw: e.getAttribute("data-raw"), rule: e.getAttribute("data-rule"), shown: e.textContent ?? "" })));
    const marked = markupNumbers(reportBodyHtml(model, extras));
    expect(spans.map((s) => [Number(s.raw), s.rule])).toEqual(marked.map((m) => [m.raw, m.rule]));
    spans.forEach((s, i) => expect(s.shown).toBe(marked[i]!.unit === null ? marked[i]!.text : `${marked[i]!.text} ${marked[i]!.unit}`));
    const bodyText = await page.evaluate(() => document.body.innerText);

    const bytes = await page.pdf(reportPdfOptions(model));
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    if (process.env["REPORT_PDF_OUT"]) {
      mkdirSync(process.env["REPORT_PDF_OUT"], { recursive: true });
      writeFileSync(resolve(process.env["REPORT_PDF_OUT"], outName), bytes);
    }

    const images = await pdfImageCount(bytes);

    // Each page carries the footer; take it off, then the PDF's text is the page's text.
    const pages = await pdfPageTexts(bytes);
    expect(pages.length).toBeGreaterThan(0);
    const label = comparable(reportFooterLabel(model));
    const content = pages
      .map((t, i) => {
        let c = comparable(t);
        const pageNo = `Page${i + 1}of${pages.length}`;
        expect(c, `page ${i + 1} footer label`).toContain(label);
        expect(c, `page ${i + 1} page number`).toContain(pageNo);
        c = c.replace(label, "").replace(pageNo, "");
        return c;
      })
      .join("");
    expect(content).toBe(comparable(bodyText));

    // Every number, in order, exactly as printed.
    let at = 0;
    for (const s of spans) {
      const want = comparable(s.shown);
      const found = content.indexOf(want, at);
      expect(found, `number "${s.shown}" (${s.rule}, raw ${s.raw}) not found in the PDF after position ${at}`).toBeGreaterThanOrEqual(0);
      at = found + want.length;
    }
    return images;
  } finally {
    await page.close();
  }
}

/** How many images the PDF draws, across all pages. */
async function pdfImageCount(bytes: Uint8Array): Promise<number> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  let n = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    const ops = await (await doc.getPage(i)).getOperatorList();
    n += ops.fnArray.filter((f) => f === pdfjs.OPS.paintImageXObject || f === pdfjs.OPS.paintInlineImageXObject).length;
  }
  await task.destroy();
  return n;
}

describe("the PDF prints exactly what the run says (RPT-001, ADR-037)", () => {
  for (const file of FIXTURES) {
    it(`${file}`, async (ctx) => {
      if (!browser) return ctx.skip();
      const { model } = await modelFor(file);
      const images = await checkPdf(browser, model, {}, `${file.replace(".fixture.json", "")}-${reportPdfFileName(model)}`);
      expect(images).toBe(0);
    });
  }
});

describe("the PDF with the satellite view of the home under the address", () => {
  const property_label = { text: "1100 Congress Ave, Austin, TX 78701", source: "sample address, a public building" };

  it("draws the picture and still prints exactly what the run says", async (ctx) => {
    if (!browser) return ctx.skip();
    const { model } = await modelFor("qp-ranch-1964-slab.fixture.json", { property_label });
    const satellite = fakeSatellite();
    const images = await checkPdf(browser, model, { satellite }, "satellite-stand-in-image.pdf");
    expect(images).toBeGreaterThanOrEqual(1);
  });

  // A real sample for the owner to look at, kept with the CI run: the NAIP picture of a public
  // building (the Texas Capitol), never a customer's home. USGS is outside our control, so if it
  // can't be reached this case says so and skips rather than failing the build.
  it("prints a sample with real NAIP imagery when USGS can be reached", async (ctx) => {
    if (!browser || !process.env["REPORT_PDF_OUT"]) return ctx.skip();
    const image = await fetchEmbeddedImage(naipUrl(30.27467, -97.74035), { timeoutMs: 20_000 });
    console.info(image ? `NAIP sample image: ${Math.round((image.length * 3) / 4 / 1024)} kB` : "no NAIP image");
    if (!image) {
      console.warn("NAIP imagery could not be read; no sample PDF with a real satellite view this run");
      return ctx.skip();
    }
    const satellite = { size: 640, images: [{ data_url: image, left: 0, top: 0, size: 640 }], credit: "Imagery: USDA NAIP through USGS The National Map" };
    const { model } = await modelFor("qp-ranch-1964-slab.fixture.json", { property_label });
    const name = reportDownloadName({ customer_name: "Sample Customer", address: property_label.text, run_id: model.meta.run_id });
    const images = await checkPdf(browser, model, { satellite }, `sample with satellite - ${name}`);
    expect(images).toBeGreaterThanOrEqual(1);
  });
});

/**
 * The NAIP image of a square 120 m across centred on the point, north up: the same request the
 * app makes (apps/web/lib/imagery.ts, satelliteImageUrl), repeated here for the CI sample only.
 */
function naipUrl(lat: number, lon: number): string {
  const R = 6378137;
  const r = (lat * Math.PI) / 180;
  const x = (R * lon * Math.PI) / 180;
  const y = R * Math.log(Math.tan(Math.PI / 4 + r / 2));
  const h = 60 / Math.cos(r);
  const u = new URL("https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage");
  u.searchParams.set("bbox", [x - h, y - h, x + h, y + h].map((v) => v.toFixed(1)).join(","));
  u.searchParams.set("bboxSR", "3857");
  u.searchParams.set("imageSR", "3857");
  u.searchParams.set("size", "640,640");
  u.searchParams.set("format", "jpgpng");
  u.searchParams.set("f", "image");
  return u.toString();
}
