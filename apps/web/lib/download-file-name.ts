/** Naming the report PDF when the Android app saves it (ADR-046). Pure, so it is unit-tested. */

/** The file name a response asks for in Content-Disposition (RFC 6266 filename* first), or the fallback. */
export function fileNameFrom(disposition: string | null, fallback: string): string {
  if (disposition) {
    const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(disposition);
    if (star?.[1]) {
      try {
        return safeFileName(decodeURIComponent(star[1].trim()));
      } catch {
        // fall through to the plain filename
      }
    }
    const plain = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/.exec(disposition);
    const name = plain?.[1] ?? plain?.[2];
    if (name) return safeFileName(name.trim());
  }
  return safeFileName(fallback);
}

/** A name the phone's file system accepts: no path separators or control characters. */
export function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\u0000-\u001f/\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return "RhoeFlow report.pdf";
  if (cleaned.length <= 180) return cleaned;
  // Long customer names or addresses: shorten the middle, keep the extension.
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 6 ? cleaned.slice(dot) : "";
  return `${cleaned.slice(0, 180 - ext.length).trimEnd()}${ext}`;
}
