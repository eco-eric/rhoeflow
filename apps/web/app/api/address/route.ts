import { fixtureAddresses, lookupAddress } from "../../../lib/address";
import { requireContext } from "../../../lib/context";
import { devMemoryEnabled } from "../../../lib/dev";
import { handler, json } from "../../../lib/http";

/**
 * GET /api/address?q=<what was typed>[&lat=&lon=]: up to five US street addresses (ADR-041).
 * Signed-in only, so the OpenRouteService quota serves this app's people and no one else.
 * `{ enabled: false }` means no key is set and the address is typed by hand.
 */
export const GET = handler(async (req: Request) => {
  await requireContext();
  const u = new URL(req.url);
  const q = u.searchParams.get("q") ?? "";
  const lat = Number(u.searchParams.get("lat"));
  const lon = Number(u.searchParams.get("lon"));
  const focus = Number.isFinite(lat) && Number.isFinite(lon) && u.searchParams.has("lat") && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
  const apiKey = process.env["ORS_API_KEY"];
  if (!apiKey && devMemoryEnabled()) return json({ enabled: true, items: fixtureAddresses(q) });
  return json(await lookupAddress(q, { apiKey, focus }));
});
