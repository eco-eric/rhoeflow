/**
 * The name a downloaded report PDF is saved under, as the owner asked (2026-11-06):
 * "Load Calculation Report - <customer name> - <address>.pdf".
 *
 * The name has to save cleanly on Windows, macOS, iOS and Android, so it drops the characters
 * those file systems refuse (\ / : * ? " < > | and control characters), collapses spaces, and
 * keeps under a length every file system takes. A part that is missing is left out; with neither,
 * the short run id stands in so the file still says which run it is.
 */
export interface ReportDownloadParts {
  customer_name: string | null | undefined;
  address: string | null | undefined;
  run_id: string;
}

const PREFIX = "Load Calculation Report";
/** Characters before ".pdf"; well under the 255-byte limit even when every character is multi-byte. */
const MAX_STEM = 120;

export function reportDownloadName(p: ReportDownloadParts): string {
  const parts = [clean(p.customer_name), clean(p.address)].filter((s) => s !== "");
  if (parts.length === 0) parts.push(`run ${p.run_id.slice(0, 8)}`);
  let stem = [PREFIX, ...parts].join(" - ");
  if (stem.length > MAX_STEM) stem = Array.from(stem).slice(0, MAX_STEM).join("");
  return `${stem.replace(/[\s.,-]+$/u, "")}.pdf`;
}

/**
 * The Content-Disposition header for the download: the UTF-8 name in `filename*` (RFC 6266/5987)
 * and a plain-ASCII copy in `filename` for clients that don't read `filename*`.
 */
export function reportDownloadDisposition(p: ReportDownloadParts): string {
  const name = reportDownloadName(p);
  return `attachment; filename="${asciiName(name)}"; filename*=UTF-8''${encodeRfc5987(name)}`;
}

function clean(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .replace(/[\\/:*?"<>|]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/gu, "");
}

/** Accents folded (é → e), anything else outside printable ASCII dropped. */
function asciiName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\x20-\x7e]/gu, "")
    .replace(/["\\]/gu, "")
    .replace(/\s+/gu, " ");
}

function encodeRfc5987(s: string): string {
  return encodeURIComponent(s).replace(/['()*]/gu, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
