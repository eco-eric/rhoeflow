/**
 * Address lookup for a new customer (ADR-041), through OpenRouteService's geocoding (Pelias), so
 * RhoeFlow needs no Google Cloud project. The key is the Worker secret `ORS_API_KEY`; it is sent in
 * a header from the server and never reaches the browser. Without it the lookup is off and the
 * address is typed by hand, which always works.
 */

export interface AddressSuggestion {
  /** One line to show, e.g. "123 Main St, Dallas, TX 75201". */
  label: string;
  line1: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
}

interface OrsFeature {
  properties?: {
    label?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    locality?: string;
    localadmin?: string;
    county?: string;
    region_a?: string;
    region?: string;
    postalcode?: string;
    layer?: string;
  };
}

export const ORS_AUTOCOMPLETE = "https://api.openrouteservice.org/geocode/autocomplete";

/** Builds the autocomplete address: US street addresses only, five at most. */
export function orsUrl(text: string, focus?: { lat: number; lon: number } | null): string {
  const u = new URL(ORS_AUTOCOMPLETE);
  u.searchParams.set("text", text);
  u.searchParams.set("boundary.country", "US");
  u.searchParams.set("layers", "address");
  u.searchParams.set("size", "5");
  if (focus) {
    u.searchParams.set("focus.point.lat", focus.lat.toFixed(3));
    u.searchParams.set("focus.point.lon", focus.lon.toFixed(3));
  }
  return u.toString();
}

/** Turns OpenRouteService features into address fields, dropping any without a street line. */
export function parseOrsFeatures(features: OrsFeature[]): AddressSuggestion[] {
  const out: AddressSuggestion[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    const p = f.properties ?? {};
    const line1 = (p.housenumber && p.street ? `${p.housenumber} ${p.street}` : (p.name ?? "")).trim();
    if (!line1) continue;
    const city = p.locality ?? p.localadmin ?? null;
    const state = p.region_a ?? p.region ?? null;
    const postal_code = p.postalcode ?? null;
    const label = [line1, city, [state, postal_code].filter(Boolean).join(" ")].filter((x) => x && x.length > 0).join(", ");
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, line1, city, state, postal_code });
  }
  return out;
}

export type LookupResult = { enabled: false } | { enabled: true; items: AddressSuggestion[]; error?: string };

export async function lookupAddress(text: string, opts: { apiKey: string | undefined; focus?: { lat: number; lon: number } | null; fetch?: typeof fetch; timeoutMs?: number }): Promise<LookupResult> {
  if (!opts.apiKey) return { enabled: false };
  const q = text.trim().slice(0, 120);
  if (q.length < 4) return { enabled: true, items: [] };
  const doFetch = opts.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await doFetch(orsUrl(q, opts.focus), { headers: { authorization: opts.apiKey, accept: "application/geo+json, application/json" }, signal: controller.signal });
    if (res.status === 429) return { enabled: true, items: [], error: "Address lookup is busy right now; type the address in." };
    if (res.status === 401 || res.status === 403) return { enabled: true, items: [], error: "Address lookup isn't set up right; type the address in." };
    if (!res.ok) return { enabled: true, items: [], error: "Address lookup didn't answer; type the address in." };
    const body = (await res.json()) as { features?: OrsFeature[] };
    return { enabled: true, items: parseOrsFeatures(body.features ?? []) };
  } catch {
    return { enabled: true, items: [], error: "Address lookup didn't answer; type the address in." };
  } finally {
    clearTimeout(timer);
  }
}

/** Development stand-in so the lookup can be tried without a key. Never used in production. */
export function fixtureAddresses(text: string): AddressSuggestion[] {
  const all: AddressSuggestion[] = [
    { label: "100 Fixture Ln, Dallas, TX 75201", line1: "100 Fixture Ln", city: "Dallas", state: "TX", postal_code: "75201" },
    { label: "1001 Fixture Pkwy, Plano, TX 75024", line1: "1001 Fixture Pkwy", city: "Plano", state: "TX", postal_code: "75024" },
  ];
  const t = text.trim().toLowerCase();
  return t.length < 4 ? [] : all.filter((a) => a.label.toLowerCase().includes(t.split(/\s+/)[0]!));
}
