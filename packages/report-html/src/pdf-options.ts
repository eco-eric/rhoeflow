import type { ReportModel } from "@rhoeflow/report";
import { escapeHtml } from "./html.js";

/**
 * Page setup for the PDF (ADR-037). These are Puppeteer's PDF options, which Browser Run's `pdf`
 * Quick Action takes as `pdfOptions`; the Worker and the CI check pass the same object, so the CI
 * PDF is laid out like the issued one. US Letter, with a footer naming the run and the page.
 */
export interface ReportPdfOptions {
  format: "letter";
  printBackground: true;
  preferCSSPageSize: false;
  displayHeaderFooter: true;
  headerTemplate: string;
  footerTemplate: string;
  margin: { top: string; bottom: string; left: string; right: string };
}

export function reportPdfOptions(model: ReportModel): ReportPdfOptions {
  return {
    format: "letter",
    printBackground: true,
    preferCSSPageSize: false,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `<div style="width:100%;font-size:8px;color:#5a6d76;padding:0 0.5in;display:flex;justify-content:space-between;font-family:sans-serif"><span>${escapeHtml(reportFooterLabel(model))}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    margin: { top: "0.5in", bottom: "0.6in", left: "0.5in", right: "0.5in" },
  };
}

/** The footer's fixed text (the page numbers follow it). */
export function reportFooterLabel(model: ReportModel): string {
  return `RhoeFlow Pro · run ${model.meta.run_id}`;
}
