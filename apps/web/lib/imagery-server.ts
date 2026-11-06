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

/** Esri's own words when it refuses a request, e.g. "498 Invalid token.", with the key never echoed. */
export function esriRefusal(body: string, key: string): { code: number | null; text: string } {
  let code: number | null = null;
  let message = "";
  try {
    const e = (JSON.parse(body) as { error?: { code?: unknown; message?: unknown; details?: unknown } }).error;
    if (e) {
      code = typeof e.code === "number" ? e.code : null;
      const details = Array.isArray(e.details) ? e.details.filter((d): d is string => typeof d === "string") : [];
      message = [typeof e.message === "string" ? e.message : "", ...details].filter(Boolean).join(" ");
    }
  } catch {
    message = "";
  }
  const clean = (key ? message.split(key).join("[key]") : message).replace(/[^\x20-\x7e]/gu, "").slice(0, 200).trim();
  return { code, text: clean || "no reason given" };
}

/**
 * One 256 px Esri World Imagery tile, or why not. Never throws. The key goes in Esri's
 * authorization header; if Esri answers 499 "Token Required" (it didn't read the header), the tile
 * is asked once more with the key as Esri's `token` parameter, the way Esri's own samples send it.
 */
export async function fetchEsriTile(z: number, x: number, y: number, opts: { fetch?: typeof fetch; timeoutMs?: number; key?: string } = {}): Promise<TileResult> {
  const key = opts.key ?? process.env["ARCGIS_API_KEY"];
  if (!key) return { ok: false, status: 404, reason: "ARCGIS_API_KEY is not set on the server" };
  if (![z, x, y].every(Number.isInteger) || z < ESRI.minZoom || z > ESRI.maxZoom || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return { ok: false, status: 400, reason: "tile out of range" };
  const f = opts.fetch ?? globalThis.fetch;
  const ask = async (withToken: boolean): Promise<TileResult & { code?: number | null }> => {
    const url = withToken ? `${ESRI.tile(z, x, y)}?token=${encodeURIComponent(key)}` : ESRI.tile(z, x, y);
    const res = await f(url, {
      headers: withToken ? { Referer: ESRI.referer } : { "X-Esri-Authorization": `Bearer ${key}`, Referer: ESRI.referer },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000),
    });
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (type === "image/jpeg" || type === "image/png") {
      if (!res.ok) return { ok: false, status: 502, reason: `Esri answered HTTP ${res.status}` };
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_TILE_BYTES) return { ok: false, status: 502, reason: `Esri tile of ${bytes.length} bytes` };
      return { ok: true, bytes, type };
    }
    // A refused key comes back as a JSON error, often with HTTP 200.
    const r = esriRefusal(await res.text().catch(() => ""), key);
    return { ok: false, status: 502, code: r.code, reason: `Esri refused the tile (HTTP ${res.status}${r.code ? `, code ${r.code}` : ""}): ${r.text}` };
  };
  try {
    const first = await ask(false);
    if (first.ok || !("code" in first) || first.code !== 499) return strip(first);
    return strip(await ask(true));
  } catch (e) {
    return { ok: false, status: 504, reason: e instanceof Error && e.name === "TimeoutError" ? "Esri took too long" : "Esri couldn't be reached" };
  }
}

function strip(r: TileResult & { code?: number | null }): TileResult {
  if (r.ok) return r;
  return { ok: false, status: r.status, reason: r.reason };
}

/** A tile over Dallas at the map's zoom, used to check the key works. */
export const CHECK_TILE = { z: 19, x: 121321, y: 211398 } as const;

/** Whether Esri imagery works right now, and if not, Esri's reason (no key value in it). */
export async function esriStatus(opts: { fetch?: typeof fetch; key?: string } = {}): Promise<{ key: boolean; ok: boolean; reason: string | null }> {
  const key = opts.key ?? process.env["ARCGIS_API_KEY"];
  if (!key) return { key: false, ok: false, reason: "ARCGIS_API_KEY is not set on the server" };
  const t = await fetchEsriTile(CHECK_TILE.z, CHECK_TILE.x, CHECK_TILE.y, { ...opts, key });
  return { key: true, ok: t.ok, reason: t.ok ? null : t.reason };
}
