import {
  HOUSE_FACT_KEYS,
  citeSources,
  houseSourceLabel,
  mapFoundation,
  mergeHouseFacts,
  type HouseFactKey,
  type HouseLookupSources,
  type HouseReading,
  type HouseSource,
  type JobSiteRow,
  type MergedFact,
  type MergedHouseFacts,
  type RentcastResult,
} from "@rhoeflow/store";
import { permitSearchFor, type PermitSearch } from "./permits";

/**
 * The network side of the house lookup (ADR-043). RentCast's property records API with the Worker
 * secret `RENTCAST_API_KEY`, sent in the `X-Api-Key` header from the server only; and
 * OpenRouteService's geocoder (the ADR-041 key, `ORS_API_KEY`) for the lot's point when RentCast
 * gives none. With no key, that part is off and the job works as before.
 *
 * Only the fields a load calc uses are read from RentCast's record. Its price, tax, sale and owner
 * fields are never copied (ADR-043 "What is kept").
 */

export const RENTCAST_PROPERTIES = "https://api.rentcast.io/v1/properties";
export const ORS_SEARCH = "https://api.openrouteservice.org/geocode/search";

interface RentcastRecord {
  id?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  bedrooms?: unknown;
  squareFootage?: unknown;
  yearBuilt?: unknown;
  features?: {
    floorCount?: unknown;
    foundationType?: unknown;
    garageSpaces?: unknown;
    heatingType?: unknown;
    coolingType?: unknown;
    roofType?: unknown;
    exteriorType?: unknown;
    pool?: unknown;
    heating?: unknown;
    cooling?: unknown;
  };
}

const int = (v: unknown, min: number, max: number): number | null => (typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= min && v <= max ? v : null);
const num = (v: unknown, min: number, max: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 120) : null);

/** One RentCast record as a reading: the kept fields only, each null when missing or out of range. */
export function parseRentcastRecord(rec: RentcastRecord, retrieved_at: string): { reading: HouseReading; lat: number | null; lon: number | null } {
  const f = rec.features ?? {};
  const foundationRaw = str(f.foundationType);
  const reading: HouseReading = {
    source: "rentcast",
    record_id: str(rec.id)?.slice(0, 100) ?? null,
    retrieved_at,
    roll_year: null,
    year_built: int(rec.yearBuilt, 1700, 2100),
    living_area_ft2: int(rec.squareFootage, 100, 100_000),
    stories: num(f.floorCount, 1, 10),
    foundation: mapFoundation(foundationRaw),
    foundation_raw: foundationRaw,
    garage_spaces: int(f.garageSpaces, 0, 50),
    garage: null,
    bedrooms: int(rec.bedrooms, 0, 50),
    heating: str(f.heatingType) ?? (f.heating === false ? "None listed" : null),
    cooling: str(f.coolingType) ?? (f.cooling === false ? "None listed" : null),
    roof: str(f.roofType),
    exterior: str(f.exteriorType),
    pool: typeof f.pool === "boolean" ? f.pool : null,
  };
  const lat = num(rec.latitude, -90, 90);
  const lon = num(rec.longitude, -180, 180);
  return { reading, lat: lat !== null && lon !== null ? lat : null, lon: lat !== null && lon !== null ? lon : null };
}

async function timed<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** RentCast's record for one address, "Street, City, State Zip". */
export function rentcastSource(apiKey: string, opts: { fetch?: typeof fetch; now?: () => Date; timeoutMs?: number } = {}): (address: string) => Promise<RentcastResult> {
  const doFetch = opts.fetch ?? fetch;
  return async (address) => {
    const u = new URL(RENTCAST_PROPERTIES);
    u.searchParams.set("address", address.slice(0, 200));
    u.searchParams.set("limit", "1");
    try {
      return await timed(opts.timeoutMs ?? 8000, async (signal) => {
        const res = await doFetch(u.toString(), { headers: { "X-Api-Key": apiKey, accept: "application/json" }, signal });
        if (res.status === 404) return { status: "not_found" as const };
        if (res.status === 400) return { status: "not_found" as const };
        if (res.status === 401 || res.status === 403) return { status: "error" as const, note: "RentCast refused RhoeFlow's key; the account owner should check it." };
        if (res.status === 429) return { status: "error" as const, note: "RentCast is busy right now; look again in a minute." };
        if (!res.ok) return { status: "error" as const, note: "RentCast didn't answer; look again later." };
        const body = (await res.json()) as unknown;
        const rec = (Array.isArray(body) ? body[0] : body) as RentcastRecord | undefined;
        if (!rec || typeof rec !== "object") return { status: "not_found" as const };
        const parsed = parseRentcastRecord(rec, (opts.now ?? (() => new Date()))().toISOString());
        return { status: "found" as const, ...parsed };
      });
    } catch {
      return { status: "error" as const, note: "RentCast didn't answer; look again later." };
    }
  };
}

/** A point for an address from OpenRouteService's geocoder (ADR-041's key). */
export function orsGeocodeSource(apiKey: string, opts: { fetch?: typeof fetch; timeoutMs?: number } = {}): (address: string) => Promise<{ lat: number; lon: number } | null> {
  const doFetch = opts.fetch ?? fetch;
  return async (address) => {
    const u = new URL(ORS_SEARCH);
    u.searchParams.set("text", address.slice(0, 200));
    u.searchParams.set("boundary.country", "US");
    u.searchParams.set("layers", "address");
    u.searchParams.set("size", "1");
    try {
      return await timed(opts.timeoutMs ?? 5000, async (signal) => {
        const res = await doFetch(u.toString(), { headers: { authorization: apiKey, accept: "application/geo+json, application/json" }, signal });
        if (!res.ok) return null;
        const body = (await res.json()) as { features?: { geometry?: { coordinates?: unknown } }[] };
        const c = body.features?.[0]?.geometry?.coordinates;
        if (!Array.isArray(c)) return null;
        const lon = num(c[0], -180, 180);
        const lat = num(c[1], -90, 90);
        return lat !== null && lon !== null ? { lat, lon } : null;
      });
    } catch {
      return null;
    }
  };
}

/** The sources this Worker has keys for. */
export function houseSources(env: { rentcastKey?: string | undefined; orsKey?: string | undefined }): HouseLookupSources {
  return {
    rentcast: env.rentcastKey ? rentcastSource(env.rentcastKey) : null,
    geocode: env.orsKey ? orsGeocodeSource(env.orsKey) : null,
  };
}

/** Development stand-in so the card and the pre-fill can be tried without a key. Never in production. */
export function fixtureHouseSources(): HouseLookupSources {
  return {
    rentcast: async (address) => {
      if (/nowhere/i.test(address)) return { status: "not_found" };
      return {
        status: "found",
        lat: 32.7831,
        lon: -96.8067,
        reading: {
          source: "rentcast",
          record_id: "fixture-record",
          retrieved_at: new Date().toISOString(),
          roll_year: null,
          year_built: 1978,
          living_area_ft2: 1850,
          stories: 1,
          foundation: "slab",
          foundation_raw: "Slab",
          garage_spaces: 2,
          garage: null,
          bedrooms: 3,
          heating: "Forced Air Gas",
          cooling: "Central",
          roof: "Composition Shingle",
          exterior: "Brick Veneer",
          pool: false,
        },
      };
    },
    geocode: null,
  };
}

/** Quick-pass questions a house fact can answer (ADR-043 "What is kept"). */
export type PrefillQuestion = "year_built" | "floor_area" | "stories" | "foundation" | "bedrooms";

const PREFILL: Record<PrefillQuestion, { fact: HouseFactKey; fits: (v: unknown) => boolean }> = {
  year_built: { fact: "year_built", fits: (v) => typeof v === "number" },
  floor_area: { fact: "living_area_ft2", fits: (v) => typeof v === "number" },
  // The quick pass offers 1, 2 or 3 stories and 1 to 6 bedrooms; anything else is left for the tech.
  stories: { fact: "stories", fits: (v) => v === 1 || v === 2 || v === 3 },
  foundation: { fact: "foundation", fits: (v) => v === "slab" || v === "crawlspace" },
  bedrooms: { fact: "bedrooms", fits: (v) => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 6 },
};

/** An answer the record gives: the value and the source to cite on it (provenance `documented`). */
export interface RecordAnswer {
  question: PrefillQuestion;
  value: number | string;
  source: string;
}

export interface HouseFactRow {
  key: HouseFactKey;
  label: string;
  status: MergedFact["status"];
  /** The value in words, or null when sources disagree or none has it. */
  text: string | null;
  /** Each source's value in words, shown when they disagree. */
  readings: { source: string; text: string; answer: RecordAnswer | null }[];
  /** The answer this fact pre-fills, when it agrees or comes from one source. */
  answer: RecordAnswer | null;
}

/** What the job page and `/api/jobs/:id/house` send the browser: the lookup, in words, and the permit link. */
export interface HouseView {
  status: JobSiteRow["lookup_status"] | null;
  note: string | null;
  looked_up_at: string | null;
  location: { lat: number; lon: number; source: "rentcast" | "ors" } | null;
  /** Each source once, for the card's footer: "RentCast (county assessor record), read Nov 4, 2026". */
  sources: string[];
  rows: HouseFactRow[];
  permit: PermitSearch | null;
}

const LABELS: Record<HouseFactKey, string> = {
  year_built: "Year built",
  living_area_ft2: "Living area",
  stories: "Stories",
  foundation: "Foundation",
  garage_spaces: "Garage",
  garage: "Garage type",
  bedrooms: "Bedrooms",
  heating: "Heating",
  cooling: "Cooling",
  roof: "Roof",
  exterior: "Exterior walls",
  pool: "Pool",
};

function factText(key: HouseFactKey, v: unknown, raw: string | null): string {
  if (key === "living_area_ft2" && typeof v === "number") return `${v.toLocaleString("en-US")} ft²`;
  if (key === "garage_spaces" && typeof v === "number") return v === 0 ? "None" : `${v}-car`;
  if (key === "foundation") return `${v === "slab" ? "Slab" : "Pier and beam (crawlspace)"}${raw ? ` (record says ${raw})` : ""}`;
  if (key === "pool") return v ? "Yes" : "No";
  return String(v);
}

export function houseView(site: JobSiteRow | null, city: string | null): HouseView {
  const permit = permitSearchFor(city);
  if (!site) return { status: null, note: null, looked_up_at: null, location: null, sources: [], rows: [], permit };
  const merged: MergedHouseFacts = mergeHouseFacts(site.readings);
  const rawOf = (src: HouseSource) => site.readings.find((r) => r.source === src)?.foundation_raw ?? null;
  const questionFor = (key: HouseFactKey) => (Object.entries(PREFILL) as [PrefillQuestion, (typeof PREFILL)[PrefillQuestion]][]).find(([, p]) => p.fact === key);
  const rows: HouseFactRow[] = [];
  for (const key of HOUSE_FACT_KEYS) {
    const m = merged[key];
    if (m.status === "none") continue;
    const q = questionFor(key);
    const answerOf = (value: unknown, srcs: HouseSource[]): RecordAnswer | null =>
      q && q[1].fits(value) ? { question: q[0], value: value as number | string, source: citeSources(site.readings, srcs) } : null;
    rows.push({
      key,
      label: LABELS[key],
      status: m.status,
      text: m.status === "disagree" ? null : factText(key, m.value, m.readings.length === 1 ? rawOf(m.readings[0]!.source) : null),
      readings: m.readings.map((r) => ({ source: houseSourceLabel(r.source), text: factText(key, r.value, rawOf(r.source)), answer: answerOf(r.value, [r.source]) })),
      answer: m.status === "disagree" ? null : answerOf(m.value, m.readings.map((r) => r.source)),
    });
  }
  return {
    status: site.lookup_status,
    note: site.lookup_note,
    looked_up_at: site.looked_up_at,
    location: site.lat !== null && site.lon !== null && site.location_source ? { lat: site.lat, lon: site.lon, source: site.location_source } : null,
    sources: site.readings.map((r) => citeSources(site.readings, [r.source])),
    rows,
    permit,
  };
}
