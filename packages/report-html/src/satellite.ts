import { Html, html } from "./html.js";

/**
 * Satellite view of the house for the report's Summary, under the address (owner's request,
 * 2026-11-06). The app supplies the picture as images placed in a square centred on the house,
 * north up: one NAIP image, or the Esri tiles that cover the same square (ADR-044). The report
 * doesn't know the source. Every image is embedded as a data URL, so the printed document still
 * requests nothing from outside.
 */

export interface ReportSatellite {
  /** Side of the square the images are placed in; the house's point is its centre. */
  size: number;
  /** The images, embedded, each placed by its top-left corner and drawn `size` square. */
  images: { data_url: string; left: number; top: number; size: number }[];
  credit: string;
}

const DATA_URL = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/u;
const MAX_IMAGE_BYTES = 2_000_000;
/** A real aerial image is tens of kB; a few hundred bytes is a blank or an error image. */
const MIN_IMAGE_BYTES = 1_000;

/** An image as a data URL, or null when it isn't a JPEG or PNG of a plausible size for a picture. */
export function embedImage(bytes: Uint8Array, type: string): string | null {
  const t = type.split(";")[0]!.trim().toLowerCase();
  if (t !== "image/jpeg" && t !== "image/png") return null;
  if (bytes.length < MIN_IMAGE_BYTES || bytes.length > MAX_IMAGE_BYTES) return null;
  return `data:${t};base64,${base64(bytes)}`;
}

/** Fetch one image and embed it; null when it can't be read in time or isn't a picture. Never throws. */
export async function fetchEmbeddedImage(url: string, opts: { fetch?: typeof fetch; timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<string | null> {
  if (!url.startsWith("https://")) return null;
  const f = opts.fetch ?? globalThis.fetch;
  try {
    const res = await f(url, { ...(opts.headers ? { headers: opts.headers } : {}), signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000) });
    if (!res.ok) return null;
    return embedImage(new Uint8Array(await res.arrayBuffer()), res.headers.get("content-type") ?? "");
  } catch {
    return null;
  }
}

/**
 * The picture with a dot on the record's point (the square's centre). If any image isn't an
 * embedded JPEG or PNG, or a number isn't finite, nothing is drawn: no hole, and nothing to fetch.
 */
export function satelliteHtml(s: ReportSatellite): Html {
  const ok =
    Number.isFinite(s.size) &&
    s.size > 0 &&
    s.images.length > 0 &&
    s.images.every((i) => DATA_URL.test(i.data_url) && [i.left, i.top, i.size].every(Number.isFinite) && i.size > 0);
  if (!ok) return html``;
  const n = (v: number) => String(Math.round(v * 100) / 100);
  const mid = s.size / 2;
  return html`<figure class="satellite"><svg viewBox="0 0 ${n(s.size)} ${n(s.size)}" role="img" aria-label="Satellite view of the home">${s.images.map(
    (i) => html`<image href="${i.data_url}" x="${n(i.left)}" y="${n(i.top)}" width="${n(i.size)}" height="${n(i.size)}" preserveAspectRatio="none"/>`,
  )}<circle cx="${n(mid)}" cy="${n(mid)}" r="${n(s.size / 60)}" stroke-width="${n(s.size / 200)}" class="pin"/></svg><figcaption class="muted small">${s.credit}. The dot is the property record's point, which can sit off the house.</figcaption></figure>`;
}

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
