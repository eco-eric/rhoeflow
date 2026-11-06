import { getCloudflareContext } from "@opennextjs/cloudflare";
import { reportDownloadDisposition, renderReportPdf, type BrowserRunBinding } from "@rhoeflow/report-html";
import { StoreError } from "@rhoeflow/store";
import { handler, type Params } from "../../../../lib/http";
import { loadReport } from "../../../../lib/report";

export const dynamic = "force-dynamic";

/**
 * GET /r/:runId/pdf: the report for one frozen run as a PDF (WO-03 E2, ADR-037). The Worker builds
 * the same report model and markup as `/r/<run id>` and hands the HTML to Cloudflare Browser Run's
 * `pdf` Quick Action through the `BROWSER` binding; nothing is stored here. Saving the PDF and its
 * hash with the run when a report is issued, and the write-back to WorkEdge, are E3 (ADR-030).
 * A stale run is refused, like issuing (REV-002). The response carries the PDF's SHA-256. The file
 * downloads as "Load Calculation Report - <customer> - <address>.pdf" (owner's request, 2026-11-06).
 */
export const GET = handler(async (_req: Request, { params }: Params<"runId">) => {
  const { runId } = await params;
  const { model, customer_name, address, satellite } = await loadReport(runId);
  if (model.meta.stale) {
    throw new StoreError("stale", `run ${model.meta.run_id} is out of date${model.meta.stale_reason ? ` (${model.meta.stale_reason})` : ""}; run the assessment again before printing a report`);
  }
  const browser = browserBinding();
  let pdf;
  try {
    pdf = await renderReportPdf(browser, model, Date.now, { satellite });
  } catch (e) {
    throw new StoreError("unavailable", e instanceof Error ? e.message : "Browser Run could not print the report");
  }
  return new Response(pdf.bytes.slice(), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": reportDownloadDisposition({ customer_name, address, run_id: model.meta.run_id }),
      "cache-control": "private, no-store",
      "x-content-sha256": pdf.sha256,
      "x-render-ms": String(pdf.render_ms),
    },
  });
});

/** The Worker's `browser` binding (apps/web/wrangler.jsonc). Quick Actions do not run in local `next dev`. */
function browserBinding(): BrowserRunBinding {
  let env: Record<string, unknown> | undefined;
  try {
    env = getCloudflareContext().env as unknown as Record<string, unknown>;
  } catch {
    env = undefined;
  }
  const b = env?.["BROWSER"] as Partial<BrowserRunBinding> | undefined;
  if (!b || typeof b.quickAction !== "function") {
    throw new StoreError("unavailable", "PDF printing needs Cloudflare Browser Run (the BROWSER binding), which this server does not have. Use the deployed app or `wrangler dev --remote`.");
  }
  return b as BrowserRunBinding;
}
