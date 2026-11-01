import type { ReportModel } from "@rhoeflow/report";
import { fontFaceCss } from "./fonts.js";
import { escapeHtml } from "./html.js";
import { PDF_DOCUMENT_CSS, REPORT_CSS } from "./report-css.js";
import { reportBodyHtml } from "./report-view.js";

/**
 * The PDF source (WO-03 E2, ADR-037): one self-contained HTML document built from the same report
 * model and the same markup as `/r/<run id>`, with the stylesheet inlined and the fonts embedded.
 * It holds no script, no link and no image, so the browser that prints it needs no sign-in and makes
 * no outside request (outside requests are also blocked in the Browser Run call).
 */
export function renderReportHtml(model: ReportModel): string {
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${escapeHtml(reportTitle(model))}</title>`,
    `<style>\n${fontFaceCss()}\n${REPORT_CSS}\n${PDF_DOCUMENT_CSS}\n</style>`,
    "</head><body>",
    reportBodyHtml(model),
    "</body></html>",
  ].join("\n");
}

/** Document title, also the PDF's Title metadata. */
export function reportTitle(model: ReportModel): string {
  return `RhoeFlow Pro load report, run ${model.meta.run_id}`;
}

/** Download file name: the run id keeps every copy traceable to its frozen run. */
export function reportPdfFileName(model: ReportModel): string {
  return `rhoeflow-load-report-${model.meta.run_id}.pdf`;
}
