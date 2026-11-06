import { Html, html } from "./html.js";

/**
 * Satellite view of the house for the report's Summary, under the address (owner's request,
 * 2026-11-06). One north-up image centred on the house, read by the server and embedded as a data
 * URL, so the printed document still requests nothing from outside.
 *
 * The report takes the image's address and credit as a `SatelliteSource`, so the app can pass the
 * same source as the job page's satellite map (ADR-043/044) and a sharper one can be swapped in
 * without touching the report. `naipSource` is the free default: USDA NAIP orthoimagery from USGS
 * The National Map's NAIP ImageServer (public domain, no key), drawn at NAIP's own resolution.
 * (The tiled "USGS Imagery Only" basemap is only cached to zoom 16, too coarse to see a house.)
 */

/** Where the picture comes from: an image of a square centred on the house, north up, and its credit. */
export interface SatelliteSource {
  url: string;
  credit: string;
}

export interface ReportSatellite {
  /** The image, embedded. */
  data_url: string;
  credit: string;
}

export const NAIP = {
  service: "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage",
  credit: "Imagery: USDA NAIP through USGS The National Map",
};

/** Ground shown each side of the house in the report's picture, metres: the lot, the street and the neighbours. */
export const REPORT_SATELLITE_HALF_METERS = 50;
const REPORT_SATELLITE_PX = 640;
const R = 6378137; // Web Mercator sphere radius, metres

/**
 * The NAIP image of a square around the point, north up. Web Mercator stretches ground distance
 * by 1 / cos(latitude), so the box is widened by that much to show `halfMeters` of real ground.
 * Null for a point that isn't a real latitude and longitude.
 */
export function naipSource(lat: number, lon: number, halfMeters = REPORT_SATELLITE_HALF_METERS, px = REPORT_SATELLITE_PX): SatelliteSource | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return null;
  const r = (lat * Math.PI) / 180;
  const cx = (R * lon * Math.PI) / 180;
  const cy = R * Math.log(Math.tan(Math.PI / 4 + r / 2));
  const h = halfMeters / Math.cos(r);
  const u = new URL(NAIP.service);
  u.searchParams.set("bbox", [cx - h, cy - h, cx + h, cy + h].map((v) => v.toFixed(1)).join(","));
  u.searchParams.set("bboxSR", "3857");
  u.searchParams.set("imageSR", "3857");
  u.searchParams.set("size", `${px},${px}`);
  u.searchParams.set("format", "jpgpng");
  u.searchParams.set("f", "image");
  return { url: u.toString(), credit: NAIP.credit };
}

const DATA_URL = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/u;
const MAX_IMAGE_BYTES = 2_000_000;
/** A real aerial image of the lot is tens of kB; a few hundred bytes is a blank or an error image. */
const MIN_IMAGE_BYTES = 1_000;

/**
 * Fetch the picture and embed it. Null when there is no source, or the image can't be read in
 * time, isn't a JPEG or PNG, or is too small to be a picture: the report then prints without it.
 */
export async function fetchReportSatellite(source: SatelliteSource | null, opts: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<ReportSatellite | null> {
  if (!source || !source.url.startsWith("https://")) return null;
  const f = opts.fetch ?? globalThis.fetch;
  try {
    const res = await f(source.url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000) });
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!res.ok || (type !== "image/jpeg" && type !== "image/png")) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < MIN_IMAGE_BYTES || bytes.length > MAX_IMAGE_BYTES) return null;
    return { data_url: `data:${type};base64,${base64(bytes)}`, credit: source.credit };
  } catch {
    return null;
  }
}

/** The picture with a dot on the record's point (the image's centre); nothing if it isn't an embedded image. */
export function satelliteHtml(s: ReportSatellite): Html {
  if (!DATA_URL.test(s.data_url)) return html``;
  return html`<figure class="satellite"><svg viewBox="0 0 100 100" role="img" aria-label="Satellite view of the home"><image href="${s.data_url}" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice"/><circle cx="50" cy="50" r="1.6" class="pin"/></svg><figcaption class="muted small">${s.credit}. The dot is the property record's point, which can sit off the house.</figcaption></figure>`;
}

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
