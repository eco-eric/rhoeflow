import { intIn, zipOf, type CountyFacts } from "./row.js";

/**
 * Tarrant Appraisal District's weekly True Prodigy export (000_Tarrant_All_Taxing_Units.zip),
 * fixed-width files in the "TP Legacy 8.0.33" layout. Positions below are 1-based and inclusive,
 * as the layout lists them. Three files are read; owner columns are never read.
 *
 * - *_APPRAISAL_IMPROVEMENT_DETAIL.TXT: prop_id 1-12, imprv_id 17-28, det_type 41-50,
 *   yr_built 86-89, area 94-108. ResMain rows are the living area (one house can have several;
 *   they add up), ResG and ResDG an attached and detached garage, ResCP a carport, ResSW a pool.
 * - *_APPRAISAL_IMPROVEMENT_DETAIL_ATTR.TXT: prop_id 1-12, desc 53-77, cd 78-87. CentralHeatAir
 *   (CentralHea, CentralAir), Foundation, ExtCover and RoofMaterial are used. The file holds no
 *   bedroom or story counts.
 * - *_APPRAISAL_INFO.TXT: prop_id 1-12, prop_type_cd 13-17 (R only), prop_val_yr 18-22,
 *   sup_num 23-34, situs_street_prefx 1040-1049, situs_street 1050-1099, situs_street_suffix
 *   1100-1109, situs_city 1110-1139, situs_zip 1140-1149, ref_id2 4435-4459 (the 8-digit account
 *   number TAD's own site shows), situs_num 4460-4474, situs_unit 4475-4479. About 14 GB
 *   unzipped, so it is read last and streamed.
 */

export const TARRANT_FILES = {
  detail: "_APPRAISAL_IMPROVEMENT_DETAIL.TXT",
  attr: "_APPRAISAL_IMPROVEMENT_DETAIL_ATTR.TXT",
  info: "_APPRAISAL_INFO.TXT",
} as const;

/** 1-based inclusive columns, trimmed. */
export function col(line: string, from: number, to: number): string {
  return line.slice(from - 1, to).trim();
}

/**
 * TAD's street suffix codes that differ from the post office's, spelled out so the address key
 * abbreviates them the same way as a typed address ("Oak Creek Trace" and "OAK CREEK TC").
 */
export const TAD_SUFFIXES: Record<string, string> = {
  CR: "CREEK",
  TR: "TRAIL",
  TC: "TRACE",
  TERR: "TERRACE",
  PK: "PARK",
  PNT: "POINT",
};

const FOUNDATION: Record<string, string> = {
  ConcSlab: "Concrete slab",
  PierBeamJo: "Pier and beam",
  Post: "Post",
  Masonry: "Masonry",
};

const EXTERIOR: Record<string, string> = {
  Masonry: "Masonry",
  Frame: "Frame",
  MultiMat: "Mixed materials",
};

/** "CompShingl" -> "Comp shingl": the record's own code, spaced out to read. */
export function spaced(code: string): string | null {
  const s = code.trim();
  if (!s) return null;
  const words = s.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 120);
}

/** "FORT WORTH" stays; "TARRANT COUNTY" (and its misspellings) is outside any city. */
export function tarrantCity(raw: string): string | null {
  const c = raw.replace(/\s+/g, " ").trim().toUpperCase();
  return c === "" || /\bCOUNTY$/.test(c) ? null : c;
}

interface Home {
  /** living area per improvement, with the year of its largest piece */
  mains: Map<string, { area: number; year: number | null; biggest: number }>;
  garage: { kind: string; area: number } | null;
  pool: boolean;
  central_heat: boolean | null;
  central_air: boolean | null;
  foundation: string | null;
  exterior: string | null;
  roof: string | null;
}

const GARAGES: Record<string, string> = { ResG: "Attached garage", ResDG: "Detached garage", ResCP: "Carport" };

export async function* readTarrant(
  files: { detail: AsyncIterable<string>; attr: AsyncIterable<string>; info: AsyncIterable<string> },
  opts: { roll_year?: number; onSkip?: (reason: string) => void } = {},
): AsyncGenerator<CountyFacts> {
  const skip = opts.onSkip ?? (() => {});
  const homes = new Map<string, Home>();
  for await (const line of files.detail) {
    const pid = col(line, 1, 12);
    if (!pid) continue;
    const type = col(line, 41, 50);
    const area = intIn(col(line, 94, 108), 0, 10_000_000) ?? 0;
    const isMain = type === "ResMain";
    const garage = GARAGES[type];
    if (!isMain && !garage && type !== "ResSW") continue;
    let h = homes.get(pid);
    if (!h) {
      h = { mains: new Map(), garage: null, pool: false, central_heat: null, central_air: null, foundation: null, exterior: null, roof: null };
      homes.set(pid, h);
    }
    if (isMain) {
      const imprv = col(line, 17, 28);
      const m = h.mains.get(imprv) ?? { area: 0, year: null, biggest: -1 };
      m.area += area;
      if (area > m.biggest) {
        m.biggest = area;
        m.year = intIn(col(line, 86, 89), 1700, 2100) ?? m.year;
      }
      h.mains.set(imprv, m);
    } else if (garage) {
      if (!h.garage || area > h.garage.area) h.garage = { kind: garage, area };
    } else h.pool = true;
  }

  for await (const line of files.attr) {
    const h = homes.get(col(line, 1, 12));
    if (!h) continue;
    const desc = col(line, 53, 77);
    const cd = col(line, 78, 87);
    if (desc === "CentralHeatAir") {
      if (cd === "CentralHea") h.central_heat = true;
      else if (cd === "CentralAir") h.central_air = true;
    } else if (desc === "Foundation" && cd) h.foundation = FOUNDATION[cd] ?? spaced(cd);
    else if (desc === "ExtCover" && cd) h.exterior = EXTERIOR[cd] ?? spaced(cd);
    else if (desc === "RoofMaterial" && cd) h.roof = spaced(cd);
  }

  // One row per property: the latest supplement wins.
  const picked = new Map<string, { sup: number; facts: CountyFacts }>();
  for await (const line of files.info) {
    if (col(line, 13, 17) !== "R") continue;
    const pid = col(line, 1, 12);
    const h = homes.get(pid);
    if (!h || h.mains.size === 0) continue;
    const sup = intIn(col(line, 23, 34), 0, 1e9) ?? 0;
    const had = picked.get(pid);
    if (had && had.sup >= sup) continue;
    const roll_year = intIn(col(line, 18, 22), 1990, 2100) ?? opts.roll_year ?? null;
    if (roll_year === null) {
      skip("no_roll_year");
      continue;
    }
    // The house is the improvement with the most living area.
    let main = { area: 0, year: null as number | null };
    for (const m of h.mains.values()) if (m.area > main.area) main = m;
    const suffix = col(line, 1100, 1109).toUpperCase();
    const unit = col(line, 4475, 4479);
    const street = [col(line, 4460, 4474), col(line, 1040, 1049), col(line, 1050, 1099), TAD_SUFFIXES[suffix] ?? suffix]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .toUpperCase();
    const account = col(line, 4435, 4459) || pid;
    picked.set(pid, {
      sup,
      facts: {
        county: "tarrant",
        account_num: account,
        roll_year,
        situs_address: unit ? `${street} UNIT ${unit.toUpperCase()}` : street,
        city: tarrantCity(col(line, 1110, 1139)),
        situs_zip: zipOf(col(line, 1140, 1149)),
        year_built: main.year,
        living_area_ft2: main.area >= 100 && main.area <= 100_000 ? main.area : null,
        stories: null,
        foundation_raw: h.foundation,
        bedrooms: null,
        pool: h.pool ? true : null,
        central_heat: h.central_heat,
        central_air: h.central_air,
        heating_raw: null,
        cooling_raw: null,
        roof_raw: h.roof,
        exterior_raw: h.exterior,
        garage_raw: h.garage ? `${h.garage.kind}${h.garage.area ? `, ${h.garage.area.toLocaleString("en-US")} ft²` : ""}` : null,
      },
    });
  }
  // Two properties can carry one legacy account number; keep the first and count the rest.
  const seen = new Set<string>();
  for (const { facts } of picked.values()) {
    if (seen.has(facts.account_num)) {
      skip("duplicate_account");
      continue;
    }
    seen.add(facts.account_num);
    yield facts;
  }
}
