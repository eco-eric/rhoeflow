import { requireContext } from "../../../../lib/context";
import { handler, json } from "../../../../lib/http";
import { esriStatus } from "../../../../lib/imagery-server";

/**
 * GET /api/imagery/status: whether Esri World Imagery works with the server's key, and if not,
 * Esri's own reason (ADR-044, ADR-045). Signed-in only. The map asks this when it falls back to the
 * USGS picture, so the reason shows under the map. It never returns the key.
 */
export const GET = handler(async () => {
  await requireContext();
  return json(await esriStatus(), 200, { "cache-control": "no-store" });
});
