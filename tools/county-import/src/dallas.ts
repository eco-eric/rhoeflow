import { intIn, joinWording, wording, zipOf, type CountyFacts } from "./row.js";

/**
 * Dallas Central Appraisal District's yearly data product (DCAD{year}_CURRENT.ZIP, comma files
 * with a header row). Three files are read, by column name:
 *
 * - ACCOUNT_INFO.CSV: one row per account. DIVISION_CD RES only. The situs address is STREET_NUM,
 *   STREET_HALF_NUM, FULL_STREET_NAME and UNIT_ID; PROPERTY_CITY reads "GARLAND (DALLAS CO)" or
 *   "NO TOWN"; PROPERTY_ZIPCODE has 5 or 9 digits. Accounts with EXCLUDE_OWNER set are left out
 *   whole (their owners asked for confidentiality, Texas Tax Code 25.025). Owner columns are never read.
 * - RES_DETAIL.CSV: one row per building. YR_BUILT, TOT_LIVING_AREA_SF, NUM_STORIES_DESC,
 *   FOUNDATION_TYP_DESC, HEATING_TYP_DESC, AC_TYP_DESC, EXT_WALL_DESC, ROOF_TYP_DESC,
 *   ROOF_MAT_DESC, NUM_BEDROOMS, POOL_IND. The largest building on the account is used.
 * - RES_ADDL.CSV: extra improvements. IMPR_TYP_DESC (ATTACHED GARAGE, DETACHED GARAGE, POOL, ...)
 *   and AREA_SIZE.
 *
 * 0 and UNASSIGNED mean unknown throughout and become null.
 */

export const DALLAS_FILES = { accounts: "ACCOUNT_INFO.CSV", detail: "RES_DETAIL.CSV", addl: "RES_ADDL.CSV" } as const;

const STORIES: Record<string, number> = {
  "ONE STORY": 1,
  "ONE AND ONE HALF STORIES": 1.5,
  "TWO STORIES": 2,
  "TWO AND ONE HALF STORIES": 2.5,
  "THREE STORIES": 3,
  "THREE AND ONE HALF STORIES": 3.5,
  "FOUR STORIES": 4,
};

interface Building {
  area: number;
  year: number | null;
  stories: number | null;
  foundation: string | null;
  heating: string | null;
  cooling: string | null;
  exterior: string | null;
  roof: string | null;
  bedrooms: number | null;
  pool: boolean | null;
}

interface Extras {
  garage: { kind: string; area: number } | null;
  pool: boolean;
}

/** Yes for Y/YES/TRUE/1/X; anything else (blank, N) is no. */
function flag(raw: string | undefined): boolean {
  return ["Y", "YES", "TRUE", "T", "1", "X"].includes((raw ?? "").trim().toUpperCase());
}

/** "GARLAND (DALLAS CO)" -> "GARLAND"; "NO TOWN" and blank -> null. */
export function dallasCity(raw: string | undefined): string | null {
  const c = (raw ?? "").replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  return c === "" || c === "NO TOWN" || c.endsWith(" COUNTY") ? null : c;
}

/** Central or not from the record's wording; null when the record doesn't say. */
function central(desc: string | null): boolean | null {
  if (!desc) return null;
  return /^central/i.test(desc);
}

export function readDetailRow(r: Record<string, string>): Building {
  const pool = (r["POOL_IND"] ?? "").toUpperCase();
  return {
    area: intIn(r["TOT_LIVING_AREA_SF"], 0, 10_000_000) ?? 0,
    year: intIn(r["YR_BUILT"], 1700, 2100),
    stories: STORIES[(r["NUM_STORIES_DESC"] ?? "").toUpperCase()] ?? null,
    foundation: wording(r["FOUNDATION_TYP_DESC"]),
    heating: wording(r["HEATING_TYP_DESC"]),
    cooling: wording(r["AC_TYP_DESC"]),
    exterior: wording(r["EXT_WALL_DESC"]),
    roof: joinWording([wording(r["ROOF_MAT_DESC"]), wording(r["ROOF_TYP_DESC"])]),
    bedrooms: intIn(r["NUM_BEDROOMS"], 1, 50),
    pool: pool === "Y" ? true : pool === "N" ? false : null,
  };
}

/** Accounts' buildings and extras, then one CountyFacts per kept residential account. */
export async function* readDallas(
  files: {
    accounts: AsyncIterable<Record<string, string>>;
    detail: AsyncIterable<Record<string, string>>;
    addl: AsyncIterable<Record<string, string>>;
  },
  opts: { roll_year?: number; onSkip?: (reason: string) => void } = {},
): AsyncGenerator<CountyFacts> {
  const skip = opts.onSkip ?? (() => {});
  const buildings = new Map<string, Building>();
  for await (const r of files.detail) {
    const acct = r["ACCOUNT_NUM"];
    if (!acct) continue;
    const b = readDetailRow(r);
    const had = buildings.get(acct);
    if (!had || b.area > had.area) buildings.set(acct, b);
  }
  const extras = new Map<string, Extras>();
  for await (const r of files.addl) {
    const acct = r["ACCOUNT_NUM"];
    if (!acct) continue;
    const desc = (r["IMPR_TYP_DESC"] ?? "").toUpperCase();
    const e = extras.get(acct) ?? { garage: null, pool: false };
    const g = /^(ATTACHED|DETACHED) (GARAGE|CARPORT)$/.exec(desc);
    if (g) {
      const area = intIn(r["AREA_SIZE"], 1, 100_000) ?? 0;
      if (!e.garage || area > e.garage.area) e.garage = { kind: `${g[1]![0]}${g[1]!.slice(1).toLowerCase()} ${g[2]!.toLowerCase()}`, area };
    }
    if (desc.includes("POOL")) e.pool = true;
    extras.set(acct, e);
  }

  for await (const r of files.accounts) {
    if ((r["DIVISION_CD"] ?? "").toUpperCase() !== "RES") continue;
    const acct = r["ACCOUNT_NUM"];
    if (!acct) continue;
    if (flag(r["EXCLUDE_OWNER"])) {
      skip("confidential_owner");
      continue;
    }
    const b = buildings.get(acct);
    if (!b) {
      skip("no_building");
      continue;
    }
    const roll_year = intIn(r["APPRAISAL_YR"], 1990, 2100) ?? opts.roll_year ?? null;
    if (roll_year === null) {
      skip("no_roll_year");
      continue;
    }
    const unit = (r["UNIT_ID"] ?? "").trim();
    const street = [r["STREET_NUM"], r["STREET_HALF_NUM"], r["FULL_STREET_NAME"]].map((p) => (p ?? "").trim()).filter(Boolean).join(" ");
    const e = extras.get(acct);
    yield {
      county: "dallas",
      account_num: acct,
      roll_year,
      situs_address: (unit ? `${street} UNIT ${unit}` : street).replace(/\s+/g, " ").toUpperCase(),
      city: dallasCity(r["PROPERTY_CITY"]),
      situs_zip: zipOf(r["PROPERTY_ZIPCODE"]),
      year_built: b.year,
      living_area_ft2: b.area >= 100 && b.area <= 100_000 ? b.area : null,
      stories: b.stories,
      foundation_raw: b.foundation,
      bedrooms: b.bedrooms,
      pool: b.pool === true || e?.pool ? true : b.pool,
      central_heat: central(b.heating),
      central_air: central(b.cooling),
      heating_raw: b.heating,
      cooling_raw: b.cooling,
      roof_raw: b.roof,
      exterior_raw: b.exterior,
      garage_raw: e?.garage ? `${e.garage.kind}${e.garage.area ? `, ${e.garage.area.toLocaleString("en-US")} ft²` : ""}` : null,
    };
  }
}
