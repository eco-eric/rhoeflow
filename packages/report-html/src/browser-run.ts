import type { ReportModel } from "@rhoeflow/report";
import { renderReportHtml } from "./document.js";
import { reportPdfOptions } from "./pdf-options.js";

/**
 * The slice of Cloudflare's `browser` binding this package uses (ADR-037). Declared here so the
 * package does not depend on generated Worker types; `env.BROWSER` satisfies it.
 */
export interface BrowserRunBinding {
  quickAction(action: "pdf", options: Record<string, unknown>): Promise<Response>;
}

/**
 * Resource types the browser refuses while printing. The document holds no link, script or image,
 * so nothing should be requested; this is a second fence. Fonts are not listed because the
 * embedded fonts are data URLs. (Browser Run's hostname guardrails apply only to Browser Sessions,
 * not Quick Actions.)
 */
export const BROWSER_RUN_BLOCK_OUTSIDE = ["image", "media", "stylesheet", "script", "xhr", "fetch", "websocket", "eventsource", "manifest", "texttrack", "other"] as const;

export interface RenderedPdf {
  bytes: Uint8Array;
  sha256: string;
  /** Wall time of the Browser Run call, for the browser-time budget (spike: "E2 measures it"). */
  render_ms: number;
}

/**
 * Print the report through Browser Run's `pdf` Quick Action (ADR-037). The browser is handed HTML,
 * never a URL, so it needs no sign-in and never reads the live assessment.
 */
export async function renderReportPdf(browser: BrowserRunBinding, model: ReportModel, now: () => number = Date.now): Promise<RenderedPdf> {
  const started = now();
  const res = await browser.quickAction("pdf", {
    html: renderReportHtml(model),
    pdfOptions: reportPdfOptions(model),
    rejectResourceTypes: [...BROWSER_RUN_BLOCK_OUTSIDE],
    gotoOptions: { waitUntil: "load", timeout: 30_000 },
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`Browser Run could not print the report (HTTP ${res.status}): ${detail}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!isPdf(bytes)) throw new Error("Browser Run returned something that is not a PDF");
  return { bytes, sha256: await sha256Hex(bytes), render_ms: now() - started };
}

export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // "%PDF"
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await globalThis.crypto.subtle.digest("SHA-256", bytes.slice());
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
