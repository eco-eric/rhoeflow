import { ESRI } from "./imagery";

/**
 * Esri World Imagery tiles from the server (ADR-044). The key is the Worker secret
 * `ARCGIS_API_KEY` (ArcGIS Location Platform, Basemaps privilege, allowed site app.rhoeflow.pro).
 * It never reaches the browser: the job page asks /api/imagery/tile/{z}/{x}/{y}, which calls this,
 * and the PDF report can call it the same way. The key goes in Esri's authorization header, not
 * the address, so it isn't written to any log; the Referer names the allowed site.
 */

export function esriEnabled(): boolean {
  return Boolean(process.env["ARCGIS_API_KEY"]);
}

export type TileResult = { ok: true; bytes: Uint8Array<ArrayBuffer>; type: "image/jpeg" | "image/png" } | { ok: false; status: number; reason: string };

const MAX_TILE_BYTES = 600_000;

/** One 256 px Esri World Imagery tile, or why not. Never throws. */
export async function fetchEsriTile(z: number, x: number, y: number, opts: { fetch?: typeof fetch; timeoutMs?: number; key?: string } = {}): Promise<TileResult> {
  const key = opts.key ?? process.env["ARCGIS_API_KEY"];
  if (!key) return { ok: false, status: 404, reason: "ARCGIS_API_KEY is not set" };
  if (![z, x, y].every(Number.isInteger) || z < ESRI.minZoom || z > ESRI.maxZoom || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return { ok: false, status: 400, reason: "tile out of range" };
  const f = opts.fetch ?? globalThis.fetch;
  try {
    const res = await f(ESRI.tile(z, x, y), {
      headers: { "X-Esri-Authorization": `Bearer ${key}`, Referer: ESRI.referer },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000),
    });
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    // A refused key comes back as a JSON error, often with HTTP 200.
    if (!res.ok || (type !== "image/jpeg" && type !== "image/png")) return { ok: false, status: 502, reason: `Esri answered HTTP ${res.status} ${type || "no type"}` };
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_TILE_BYTES) return { ok: false, status: 502, reason: `Esri tile of ${bytes.length} bytes` };
    return { ok: true, bytes, type };
  } catch (e) {
    return { ok: false, status: 504, reason: e instanceof Error ? e.name : "fetch failed" };
  }
}
