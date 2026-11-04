import { z } from "zod";
import { IsoTimestampSchema, WorkEdgeIdSchema } from "@rhoeflow/schema";
import { nowIso, type StoreContext, type StoreDeps } from "./context.js";
import { getJob } from "./jobs.js";
import { UuidSchema } from "./records.js";

/**
 * House facts for a job's address (ADR-043). When a job is opened, RhoeFlow looks the house up
 * once: RentCast's property record first, then the county appraisal district's own record where
 * RhoeFlow has imported that county (Dallas and Tarrant first). Both readings are stored with
 * their source and date; they are merged field by field when read, so the merge rules can change
 * without a new lookup. Only facts that bear on a load calc are kept: no price, value, tax, sale
 * history or owner names (ADR-028, ADR-043).
 */

export const HOUSE_SOURCES = ["rentcast", "county:dallas", "county:tarrant", "county:collin", "county:denton"] as const;
export const HouseSourceSchema = z.enum(HOUSE_SOURCES);
export type HouseSource = z.output<typeof HouseSourceSchema>;

export const COUNTIES = ["dallas", "tarrant", "collin", "denton"] as const;
export const CountySchema = z.enum(COUNTIES);
export type County = z.output<typeof CountySchema>;

const SOURCE_LABELS: Record<HouseSource, string> = {
  rentcast: "RentCast (county assessor record)",
  "county:dallas": "Dallas Central Appraisal District",
  "county:tarrant": "Tarrant Appraisal District",
  "county:collin": "Collin Central Appraisal District",
  "county:denton": "Denton Central Appraisal District",
};

export function houseSourceLabel(s: HouseSource): string {
  return SOURCE_LABELS[s];
}

/** The quick-pass foundation choices a record can map to; anything else stays blank. */
export const FoundationSchema = z.enum(["slab", "crawlspace"]);
export type Foundation = z.output<typeof FoundationSchema>;

const Str = z.string().trim().min(1).max(120);
const Count = z.number().int().min(0).max(50);

/** One source's reading of the house: only the kept fields, each null when the source has none. */
export const HouseReadingSchema = z.strictObject({
  source: HouseSourceSchema,
  /** The source's own id for the record (RentCast id, appraisal account number). */
  record_id: z.string().trim().min(1).max(100).nullable(),
  /** When RhoeFlow read it. */
  retrieved_at: IsoTimestampSchema,
  /** Appraisal roll year for county files. */
  roll_year: z.number().int().min(1990).max(2100).nullable().default(null),
  year_built: z.number().int().min(1700).max(2100).nullable(),
  living_area_ft2: z.number().int().min(100).max(100_000).nullable(),
  stories: z.number().min(1).max(10).nullable(),
  foundation: FoundationSchema.nullable(),
  /** The source's own foundation wording, shown beside the mapped value. */
  foundation_raw: Str.nullable(),
  garage_spaces: Count.nullable(),
  bedrooms: Count.nullable(),
  heating: Str.nullable(),
  cooling: Str.nullable(),
  roof: Str.nullable(),
  exterior: Str.nullable(),
  pool: z.boolean().nullable(),
});
export type HouseReading = z.output<typeof HouseReadingSchema>;

export const HOUSE_LOOKUP_STATUSES = ["found", "not_found", "error", "off"] as const;

/** rhoe.job_sites: one row per job, the house lookup's result and the lot's location. */
export const JobSiteRowSchema = z.strictObject({
  job_id: UuidSchema,
  account_id: WorkEdgeIdSchema,
  lat: z.number().min(-90).max(90).nullable(),
  lon: z.number().min(-180).max(180).nullable(),
  location_source: z.enum(["rentcast", "ors"]).nullable(),
  readings: z.array(HouseReadingSchema).max(5),
  lookup_status: z.enum(HOUSE_LOOKUP_STATUSES),
  /** A short note for the tech when nothing was found or a source failed. */
  lookup_note: z.string().trim().min(1).max(300).nullable(),
  looked_up_at: IsoTimestampSchema,
  updated_at: IsoTimestampSchema,
});
export type JobSiteRow = z.output<typeof JobSiteRowSchema>;

/**
 * rhoe.county_property: an appraisal district's residential record, imported once a year after the
 * roll is certified (tools/county-import). Public records, the same for every account, and loaded
 * only by the owner; the app only reads it. No owner names, values or taxes.
 */
export const CountyHomeRowSchema = z.strictObject({
  county: CountySchema,
  account_num: z.string().trim().min(1).max(40),
  roll_year: z.number().int().min(1990).max(2100),
  situs_key: z.string().trim().min(3).max(240),
  situs_address: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100).nullable(),
  year_built: z.number().int().min(1700).max(2100).nullable(),
  living_area_ft2: z.number().int().min(100).max(100_000).nullable(),
  stories: z.number().min(1).max(10).nullable(),
  foundation_raw: z.string().trim().min(1).max(120).nullable(),
  garage_spaces: Count.nullable(),
  bedrooms: Count.nullable(),
  pool: z.boolean().nullable(),
  central_heat: z.boolean().nullable(),
  central_air: z.boolean().nullable(),
});
export type CountyHomeRow = z.output<typeof CountyHomeRowSchema>;

// ------------------------------------------------------------------------------------------------
// Address keys and foundation wording
// ------------------------------------------------------------------------------------------------

const SUFFIXES: Record<string, string> = {
  STREET: "ST", AVENUE: "AVE", AV: "AVE", DRIVE: "DR", ROAD: "RD", LANE: "LN", BOULEVARD: "BLVD", COURT: "CT", CIRCLE: "CIR",
  PLACE: "PL", PARKWAY: "PKWY", TRAIL: "TRL", TERRACE: "TER", HIGHWAY: "HWY", FREEWAY: "FWY", EXPRESSWAY: "EXPY", SQUARE: "SQ",
  CROSSING: "XING", POINT: "PT", COVE: "CV", HOLLOW: "HOLW", RIDGE: "RDG", CREEK: "CRK", MEADOW: "MDW", MEADOWS: "MDWS",
  VALLEY: "VLY", VIEW: "VW", LOOP: "LOOP", PATH: "PATH", RUN: "RUN", WAY: "WAY", ALLEY: "ALY", BEND: "BND", GROVE: "GRV",
  HEIGHTS: "HTS", HILL: "HL", HILLS: "HLS", ISLAND: "IS", LAKE: "LK", LANDING: "LNDG", PARK: "PARK", PASS: "PASS", PLAZA: "PLZ",
  SPRINGS: "SPGS", SPRING: "SPG", STATION: "STA", SUMMIT: "SMT", VILLAGE: "VLG", VISTA: "VIS", WALK: "WALK", WOODS: "WDS",
};
const DIRECTIONS: Record<string, string> = { NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W", NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW" };

/**
 * The key a street address is matched on across sources: upper case, punctuation and unit
 * markers dropped, suffixes and directions abbreviated the USPS way, then "|" and the city.
 * "123 North Main Street, Dallas" and "123 N MAIN ST, DALLAS" give the same key.
 */
export function situsKey(line1: string, city: string | null | undefined): string | null {
  const words = line1
    .toUpperCase()
    .replace(/[.,#']/g, " ")
    .split(/\s+/)
    .filter((w) => w !== "");
  if (words.length < 2 || !/^\d/.test(words[0]!)) return null;
  // Drop a unit ("APT 4", "UNIT B", "STE 100"): appraisal records key the building, not the unit.
  const unitAt = words.findIndex((w, i) => i > 0 && ["APT", "UNIT", "STE", "SUITE", "BLDG"].includes(w));
  const kept = unitAt > 0 ? words.slice(0, unitAt) : words;
  const norm = kept.map((w, i) => (i === 0 ? w : (SUFFIXES[w] ?? DIRECTIONS[w] ?? w)));
  const c = (city ?? "").toUpperCase().replace(/[^A-Z ]/g, "").replace(/\s+/g, " ").trim();
  if (!c) return null;
  return `${norm.join(" ")}|${c}`;
}

/** Maps a record's foundation wording to the quick pass: slab or crawlspace, or null when unclear. */
export function mapFoundation(raw: string | null | undefined): Foundation | null {
  if (!raw) return null;
  const parts = raw.split("/").map((p) => p.trim().toLowerCase());
  const slab = parts.some((p) => ["slab", "mat", "raft"].includes(p));
  const crawl = parts.some((p) => ["crawl", "pier", "raised", "post & beam", "pier and beam", "pier & beam"].includes(p) || p.includes("crawl"));
  if (slab === crawl) return null;
  return slab ? "slab" : "crawlspace";
}

/** A county record as a reading of the same shape as RentCast's. */
export function countyReading(row: CountyHomeRow, retrieved_at: string): HouseReading {
  return {
    source: `county:${row.county}`,
    record_id: row.account_num,
    retrieved_at,
    roll_year: row.roll_year,
    year_built: row.year_built,
    living_area_ft2: row.living_area_ft2,
    stories: row.stories,
    foundation: mapFoundation(row.foundation_raw),
    foundation_raw: row.foundation_raw,
    garage_spaces: row.garage_spaces,
    bedrooms: row.bedrooms,
    heating: row.central_heat === null ? null : row.central_heat ? "Central" : "Not central",
    cooling: row.central_air === null ? null : row.central_air ? "Central" : "Not central",
    roof: null,
    exterior: null,
    pool: row.pool,
  };
}

// ------------------------------------------------------------------------------------------------
// Merge (ADR-043 "How RentCast and the county files merge")
// ------------------------------------------------------------------------------------------------

export const HOUSE_FACT_KEYS = ["year_built", "living_area_ft2", "stories", "foundation", "garage_spaces", "bedrooms", "heating", "cooling", "roof", "exterior", "pool"] as const;
export type HouseFactKey = (typeof HOUSE_FACT_KEYS)[number];

/** Facts that pre-fill a quick-pass answer; the rest are shown only. */
export const PREFILL_KEYS = ["year_built", "living_area_ft2", "stories", "foundation", "bedrooms"] as const satisfies readonly HouseFactKey[];

export interface MergedFact {
  /**
   * agree: two or more sources give the same value (area within 5%); one_source: only one has it;
   * disagree: sources differ, nothing is pre-filled and the tech picks; none: no source has it.
   */
  status: "agree" | "one_source" | "disagree" | "none";
  /** The value to use; null when sources disagree or none has it. */
  value: unknown;
  readings: { source: HouseSource; value: unknown }[];
}

export type MergedHouseFacts = Record<HouseFactKey, MergedFact>;

/** Shown-only facts take the first source that has one and never count as a disagreement. */
const SHOWN_ONLY: ReadonlySet<HouseFactKey> = new Set(["heating", "cooling", "roof", "exterior", "pool", "garage_spaces"]);

function same(key: HouseFactKey, a: unknown, b: unknown): boolean {
  if (key === "living_area_ft2" && typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 0.05 * Math.max(a, b);
  return a === b;
}

/** RentCast first, then the counties, in the order the readings are stored. */
export function mergeHouseFacts(readings: readonly HouseReading[]): MergedHouseFacts {
  const out = {} as MergedHouseFacts;
  for (const key of HOUSE_FACT_KEYS) {
    const have = readings.filter((r) => r[key] !== null && r[key] !== undefined).map((r) => ({ source: r.source, value: r[key] as unknown }));
    if (have.length === 0) out[key] = { status: "none", value: null, readings: [] };
    else if (have.length === 1) out[key] = { status: "one_source", value: have[0]!.value, readings: have };
    else if (have.every((h) => same(key, have[0]!.value, h.value))) out[key] = { status: "agree", value: have[0]!.value, readings: have };
    else if (SHOWN_ONLY.has(key)) out[key] = { status: "one_source", value: have[0]!.value, readings: have };
    else out[key] = { status: "disagree", value: null, readings: have };
  }
  return out;
}

/** "RentCast (county assessor record), Nov 4, 2026; Dallas Central Appraisal District, 2026 roll" */
export function citeSources(readings: readonly HouseReading[], sources: readonly HouseSource[]): string {
  return readings
    .filter((r) => sources.includes(r.source))
    .map((r) => {
      const day = new Date(r.retrieved_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
      const id = r.record_id ? ` ${r.source === "rentcast" ? "record" : "account"} ${r.record_id}` : "";
      return `${houseSourceLabel(r.source)}${id}, ${r.roll_year ? `${r.roll_year} roll, ` : ""}read ${day}`;
    })
    .join("; ");
}

// ------------------------------------------------------------------------------------------------
// The lookup
// ------------------------------------------------------------------------------------------------

export type RentcastResult = { status: "found"; reading: HouseReading; lat: number | null; lon: number | null } | { status: "not_found" } | { status: "error"; note: string };

/** The network side, injected by the web app so the store has no network code. */
export interface HouseLookupSources {
  /** RentCast's record for one address; null when no key is set. */
  rentcast: ((address: string) => Promise<RentcastResult>) | null;
  /** A point for the address when RentCast gives none; null when no geocoder is set. */
  geocode: ((address: string) => Promise<{ lat: number; lon: number } | null>) | null;
}

/** The job's house lookup, or null if it hasn't run. */
export async function getJobSite(deps: StoreDeps, ctx: StoreContext, job_id: string): Promise<JobSiteRow | null> {
  await getJob(deps, ctx, job_id);
  return deps.db.jobSites.get(ctx.account_id, job_id);
}

/**
 * Looks the job's house up and stores the readings. Runs once per job; `force` runs it again (the
 * tech's "Look again", after fixing the address). A source that fails doesn't stop the others.
 */
export async function lookupHouse(deps: StoreDeps, ctx: StoreContext, job_id: string, sources: HouseLookupSources, opts: { force?: boolean } = {}): Promise<JobSiteRow> {
  const job = await getJob(deps, ctx, job_id);
  const existing = await deps.db.jobSites.get(ctx.account_id, job_id);
  if (existing && !opts.force) return existing;
  const at = nowIso(deps);
  const notes: string[] = [];
  const readings: HouseReading[] = [];
  let lat: number | null = null;
  let lon: number | null = null;
  let location_source: JobSiteRow["location_source"] = null;
  let rentcastError = false;

  const line1 = job.address_line1?.trim() ?? "";
  const cityLine = [job.city, [job.state, job.postal_code].filter(Boolean).join(" ")].filter((p) => p && p.trim() !== "").join(", ");
  const address = line1 && cityLine ? `${line1}, ${cityLine}` : "";

  if (!address) {
    notes.push("The job has no street address and city, so there was nothing to look up.");
  } else {
    if (sources.rentcast) {
      const r = await sources.rentcast(address);
      if (r.status === "found") {
        readings.push(r.reading);
        if (r.lat !== null && r.lon !== null) {
          lat = r.lat;
          lon = r.lon;
          location_source = "rentcast";
        }
      } else if (r.status === "error") {
        rentcastError = true;
        notes.push(r.note);
      }
    }
    const key = situsKey(line1, job.city);
    if (key) {
      const rows = await deps.db.countyHomes.findBySitus(key);
      // Several accounts at one street address (condos, duplexes) can't be told apart: use none.
      if (rows.length === 1) readings.push(countyReading(rows[0]!, at));
      else if (rows.length > 1) notes.push("The county has more than one record at this address, so its record wasn't used.");
    }
    if (lat === null && sources.geocode) {
      const p = await sources.geocode(address);
      if (p) {
        lat = p.lat;
        lon = p.lon;
        location_source = "ors";
      }
    }
  }

  const lookup_status: JobSiteRow["lookup_status"] =
    readings.length > 0 ? "found" : rentcastError ? "error" : !sources.rentcast && address ? "off" : "not_found";
  if (lookup_status === "not_found" && address) notes.push("No property record matched this address.");
  const row: JobSiteRow = {
    job_id,
    account_id: ctx.account_id,
    lat,
    lon,
    location_source,
    readings,
    lookup_status,
    lookup_note: notes.length ? notes.join(" ").slice(0, 300) : null,
    looked_up_at: at,
    updated_at: at,
  };
  return deps.db.jobSites.upsert(JobSiteRowSchema.parse(row));
}
