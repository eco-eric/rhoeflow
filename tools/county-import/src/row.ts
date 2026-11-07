import { CountyHomeRowSchema, situsKey, type County, type CountyHomeRow } from "@rhoeflow/store";

/** Column order of the CSV the importer writes and load.sql copies (rhoe.county_property). */
export const COLUMNS = [
  "county",
  "account_num",
  "roll_year",
  "situs_key",
  "situs_address",
  "city",
  "situs_zip",
  "year_built",
  "living_area_ft2",
  "stories",
  "foundation_raw",
  "garage_spaces",
  "bedrooms",
  "pool",
  "central_heat",
  "central_air",
  "heating_raw",
  "cooling_raw",
  "roof_raw",
  "exterior_raw",
  "garage_raw",
] as const satisfies readonly (keyof CountyHomeRow)[];

/** The city key used when the county files a house outside any city ("NO TOWN", "TARRANT COUNTY"). */
export const UNINCORPORATED = "UNINCORPORATED";

/** What one county record says, before the address key and the checks. */
export interface CountyFacts {
  county: County;
  account_num: string;
  roll_year: number;
  /** "123 N MAIN ST" or "123 N MAIN ST UNIT 4" */
  situs_address: string;
  /** null when the county files it outside any city */
  city: string | null;
  situs_zip: string | null;
  year_built: number | null;
  living_area_ft2: number | null;
  stories: number | null;
  foundation_raw: string | null;
  bedrooms: number | null;
  pool: boolean | null;
  central_heat: boolean | null;
  central_air: boolean | null;
  heating_raw: string | null;
  cooling_raw: string | null;
  roof_raw: string | null;
  exterior_raw: string | null;
  garage_raw: string | null;
}

/** A whole number in range, or null for blank, 0 or out of range (the files use 0 for unknown). */
export function intIn(raw: string | undefined, min: number, max: number): number | null {
  const s = (raw ?? "").trim();
  if (!/^-?\d+(\.0+)?$/.test(s)) return null;
  const n = Math.round(Number(s));
  return n >= min && n <= max ? n : null;
}

/** "75243" or "752431234" or "75243-1234" -> "75243"; anything else null. */
export function zipOf(raw: string | undefined): string | null {
  const m = /^(\d{5})(?:-?\d{4})?$/.exec((raw ?? "").trim());
  return m ? m[1]! : null;
}

const BLANK = new Set(["", "UNASSIGNED", "UNKNOWN", "N/A", "NA", "0"]);

/** "CENTRAL FULL" -> "Central full"; blank and UNASSIGNED -> null. */
export function wording(raw: string | undefined): string | null {
  const s = (raw ?? "").replace(/\s+/g, " ").trim();
  if (BLANK.has(s.toUpperCase())) return null;
  const lower = s.toLowerCase();
  return (lower.charAt(0).toUpperCase() + lower.slice(1)).slice(0, 120);
}

/** Joins the parts that have wording: ["Composition shingle", null, "Gable"] -> "Composition shingle, gable". */
export function joinWording(parts: (string | null)[]): string | null {
  const kept = parts.filter((p): p is string => !!p);
  if (kept.length === 0) return null;
  return kept.map((p, i) => (i === 0 ? p : p.charAt(0).toLowerCase() + p.slice(1))).join(", ").slice(0, 120);
}

export type SkipReason = "no_address" | "bad_record";

/** The row to load, or why it was skipped. Every row passes the store's own schema, which mirrors the table's checks. */
export function toRow(f: CountyFacts): { row: CountyHomeRow } | { skip: SkipReason } {
  const key = situsKey(f.situs_address, f.city ?? UNINCORPORATED);
  if (!key || key.length > 240) return { skip: "no_address" };
  const parsed = CountyHomeRowSchema.safeParse({
    county: f.county,
    account_num: f.account_num,
    roll_year: f.roll_year,
    situs_key: key,
    situs_address: f.situs_address.slice(0, 200),
    city: f.city,
    year_built: f.year_built,
    living_area_ft2: f.living_area_ft2,
    stories: f.stories,
    foundation_raw: f.foundation_raw,
    // The county files give a garage's size, not a car count (garage_raw has the size).
    garage_spaces: null,
    bedrooms: f.bedrooms,
    pool: f.pool,
    central_heat: f.central_heat,
    central_air: f.central_air,
    situs_zip: f.situs_zip,
    heating_raw: f.heating_raw,
    cooling_raw: f.cooling_raw,
    roof_raw: f.roof_raw,
    exterior_raw: f.exterior_raw,
    garage_raw: f.garage_raw,
  });
  return parsed.success ? { row: parsed.data } : { skip: "bad_record" };
}

function csvField(v: unknown): string {
  if (v === null || v === undefined) return ""; // unquoted empty is NULL to Postgres COPY CSV
  if (typeof v === "boolean") return v ? "t" : "f";
  if (typeof v === "number") return String(v);
  return `"${String(v).replace(/"/g, '""')}"`;
}

export function csvHeader(): string {
  return COLUMNS.join(",") + "\n";
}

export function csvLine(row: CountyHomeRow): string {
  return COLUMNS.map((c) => csvField(row[c])).join(",") + "\n";
}

/** Counts only, so the run's log (public: the repository is public) holds no address. */
export class Stats {
  rows = 0;
  readonly skipped: Record<string, number> = {};
  readonly filled: Record<string, number> = {};
  roll_years = new Set<number>();
  private readonly keys = new Map<string, number>();

  skip(reason: string): void {
    this.skipped[reason] = (this.skipped[reason] ?? 0) + 1;
  }

  add(row: CountyHomeRow): void {
    this.rows++;
    this.roll_years.add(row.roll_year);
    for (const c of COLUMNS) if (row[c] !== null) this.filled[c] = (this.filled[c] ?? 0) + 1;
    this.keys.set(row.situs_key, (this.keys.get(row.situs_key) ?? 0) + 1);
  }

  toJSON(): Record<string, unknown> {
    let shared = 0;
    for (const n of this.keys.values()) if (n > 1) shared += n;
    return {
      rows: this.rows,
      roll_years: [...this.roll_years].sort(),
      skipped: this.skipped,
      filled: this.filled,
      // Records that share a street address with another (condos, duplexes): the lookup uses none of them.
      rows_sharing_an_address: shared,
    };
  }
}
