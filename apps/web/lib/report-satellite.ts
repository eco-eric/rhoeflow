import { embedImage, fetchEmbeddedImage, type ReportSatellite } from "@rhoeflow/report-html";
import { ESRI, IMAGERY, esriTiles, satelliteImageUrl } from "./imagery";
import { fetchEsriTile } from "./imagery-server";

/**
 * The report's satellite picture of the house (owner's request, 2026-11-06): the same picture as
 * the job page's map (ADR-044). Esri World Imagery tiles when `ARCGIS_API_KEY` is set and every
 * tile comes back; otherwise the one north-up USDA NAIP image of the same square; null when
 * neither can be read. The server fetches and embeds the images, so the report and its PDF load
 * nothing from outside and the key never leaves the Worker.
 */
export async function reportSatellite(lat: number, lon: number, opts: { fetch?: typeof fetch; key?: string; timeoutMs?: number } = {}): Promise<ReportSatellite | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return null;
  const timeoutMs = opts.timeoutMs ?? 6_000;

  const tiles = esriTiles(lat, lon);
  const read = await Promise.all(
    tiles.map((t) => fetchEsriTile(t.z, t.x, t.y, { timeoutMs, ...(opts.fetch ? { fetch: opts.fetch } : {}), ...(opts.key !== undefined ? { key: opts.key } : {}) })),
  );
  if (read.every((r) => r.ok)) {
    const images = tiles.map((t, i) => {
      const r = read[i]!;
      const data_url = r.ok ? embedImage(r.bytes, r.type) : null;
      return data_url ? { data_url, left: t.left, top: t.top, size: t.size } : null;
    });
    if (images.every((i) => i !== null)) return { size: IMAGERY.px, images, credit: ESRI.credit };
  }

  const naip = await fetchEmbeddedImage(satelliteImageUrl(lat, lon), { timeoutMs, ...(opts.fetch ? { fetch: opts.fetch } : {}) });
  return naip ? { size: IMAGERY.px, images: [{ data_url: naip, left: 0, top: 0, size: IMAGERY.px }], credit: IMAGERY.credit } : null;
}
