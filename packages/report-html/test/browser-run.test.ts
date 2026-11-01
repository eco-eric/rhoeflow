import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BROWSER_RUN_BLOCK_OUTSIDE, renderReportHtml, renderReportPdf, reportPdfOptions, type BrowserRunBinding } from "../src/index.js";
import { modelFor } from "./helpers.js";

function fakeBrowser(res: () => Response) {
  const calls: { action: string; options: Record<string, unknown> }[] = [];
  const b: BrowserRunBinding = {
    async quickAction(action, options) {
      calls.push({ action, options });
      return res();
    },
  };
  return { b, calls };
}

describe("Browser Run call (ADR-037)", () => {
  it("sends the report document and page setup to the pdf Quick Action and hashes what comes back", async () => {
    const { model } = await modelFor("qp-ranch-1964-slab.fixture.json");
    const bytes = new TextEncoder().encode("%PDF-1.7\n% fake\n%%EOF\n");
    const { b, calls } = fakeBrowser(() => new Response(bytes, { status: 200, headers: { "content-type": "application/pdf" } }));
    let t = 1000;
    const pdf = await renderReportPdf(b, model, () => (t += 250));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.action).toBe("pdf");
    expect(calls[0]!.options["html"]).toBe(renderReportHtml(model));
    expect(calls[0]!.options["pdfOptions"]).toEqual(reportPdfOptions(model));
    expect(calls[0]!.options["url"]).toBeUndefined();
    expect(calls[0]!.options["rejectResourceTypes"]).toEqual([...BROWSER_RUN_BLOCK_OUTSIDE]);
    expect(BROWSER_RUN_BLOCK_OUTSIDE).not.toContain("font");
    expect(BROWSER_RUN_BLOCK_OUTSIDE).not.toContain("document");
    expect(pdf.bytes).toEqual(bytes);
    expect(pdf.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(pdf.render_ms).toBe(250);
  });

  it("fails with the service's status when Browser Run refuses, and refuses a body that is not a PDF", async () => {
    const { model } = await modelFor("qp-ranch-1964-slab.fixture.json");
    await expect(renderReportPdf(fakeBrowser(() => new Response("rate limited", { status: 429 })).b, model)).rejects.toThrow(/HTTP 429.*rate limited/);
    await expect(renderReportPdf(fakeBrowser(() => new Response("<html>oops</html>", { status: 200 })).b, model)).rejects.toThrow(/not a PDF/);
  });
});
