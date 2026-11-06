import { requireContext } from "../../../lib/context";
import { handler, json } from "../../../lib/http";
import { STREETS, fetchStreets } from "../../../lib/streets";

/**
 * GET /api/streets?lat=..&lon=..: the road centre lines and names round a point, from the Census
 * Bureau's TIGERweb (ADR-045), for the satellite map. Signed-in only; US points only.
 */
export const GET = handler(async (req: Request) => {
  await requireContext();
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  if (!q.get("lat") || !q.get("lon") || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < 17 || lat > 72 || lon < -180 || lon > -64) {
    return json({ error: "lat and lon of a US point are needed" }, 400);
  }
  const r = await fetchStreets(lat, lon);
  if (!r.ok) return json({ error: r.reason }, 502);
  return json({ streets: r.streets, credit: STREETS.credit, source: STREETS.source }, 200, { "cache-control": "private, max-age=604800" });
});
