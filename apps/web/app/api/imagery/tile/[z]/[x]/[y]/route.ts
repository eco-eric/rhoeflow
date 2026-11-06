import { requireContext } from "../../../../../../../lib/context";
import { handler, json, type Params } from "../../../../../../../lib/http";
import { fetchEsriTile } from "../../../../../../../lib/imagery-server";

/**
 * GET /api/imagery/tile/{z}/{x}/{y}: one Esri World Imagery tile for the satellite map (ADR-044).
 * Signed-in only, so the ArcGIS quota serves this app's people. 404 when no key is set; the map
 * then shows the USGS NAIP picture instead, and does the same when any tile fails.
 */
export const GET = handler(async (_req: Request, { params }: Params<"z" | "x" | "y">) => {
  await requireContext();
  const p = await params;
  const [z, x, y] = [p.z, p.x, p.y].map((v) => (/^\d{1,7}$/u.test(v ?? "") ? Number(v) : NaN));
  const tile = await fetchEsriTile(z!, x!, y!);
  if (!tile.ok) return json({ error: tile.reason }, tile.status);
  return new Response(tile.bytes, { headers: { "content-type": tile.type, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" } });
});
