/**
 * Coefficient tables used by the MJ8.* envelope methods.
 *
 * PROVENANCE AND POLICY NOTE (owner decision pending, see WO-02 report):
 * These values are transcribed from the reference engine, OpenStudio-HPXML v1.12.0
 * `hvac_sizing.rb` (BSD-style license, see claude/06-architecture/license-inventory.md),
 * whose comments attribute them to ACCA Manual J 8th edition figures (A12-8, A12-12,
 * A12-14, A12-16, Table 4A/4B notes). RhoeFlow reuses them as published open-source code,
 * not from the manual. CLAUDE.md's rule is "re-derive tables from ASHRAE / IECC / NOAA /
 * OpenStudio-HPXML structure; never copy ACCA tables verbatim". Whether a handful of CLTD
 * coefficients carried in NREL's code count as "structure" is the owner's call; the
 * methods take these tables as data so a re-derived set (for example from the ASHRAE
 * CLTD/CLF method) can replace them under a new method version without touching the
 * method code.
 *
 * Every table names its line range in hvac_sizing.rb so the transcription can be checked.
 */

/** CLTD adjustment by daily-range class [low, medium, high] (hvac_sizing.rb line 196). */
export const DAILY_RANGE_TEMP_ADJUST = [4, 0, -5] as const;

/** Door CLTD = CTD + offset by daily-range class (lines 988 to 995; "Table 4A Construction 11"). */
export const DOOR_CLTD_OFFSET = [15, 11, 6] as const;

/** Exterior ceiling CLTD = CTD − 5 + daily-range adjust (line 1246). */
export const EXTERIOR_CEILING_CLTD_OFFSET = -5;

/** Wall color multiplier on the base CLTD (lines 1079 to 1086; "Table 4B notes", "Appendix 12"). */
export const WALL_COLOR_MULTIPLIER = { light: 0.65, medium: 0.83, dark: 1.0 } as const;
export type WallColorClass = keyof typeof WALL_COLOR_MULTIPLIER;

/** Wall color class from solar absorptance (lines 1070 to 1078). */
export function wallColorFromAbsorptance(absorptance: number): WallColorClass {
  if (absorptance <= 0.5) return "light";
  if (absorptance <= 0.75) return "medium";
  return "dark";
}

/** Base sunlit-wall CLTD by ASHRAE wall group, intermediate groups interpolated (lines 1088 to 1090; "Figure A12-8"). */
export const WALL_CLTD_BASE_SUN: Readonly<Record<string, number>> = {
  G: 38.0, "F-G": 34.95, F: 31.9, "E-F": 29.45, E: 27.0, "D-E": 24.5, D: 22.0, "C-D": 21.25, C: 20.5, "B-C": 19.65, B: 18.8,
};

/** Table 4A wall group letter → ASHRAE wall group (lines 4712 to 4715; "Figure A12-12"). */
export const TABLE_4A_TO_ASHRAE_GROUP: Readonly<Record<string, string>> = {
  A: "G", B: "F-G", C: "F", D: "E-F", E: "E", F: "D-E", G: "D", H: "C-D", I: "C", J: "B-C", K: "B",
};

/**
 * Table 4A wall group thresholds by U-factor: [maxU, group] ascending; the last entry is the
 * fallback (lines 4456 to 4600). Keyed by schema wall type and whether the siding is brick or stone.
 */
export const WALL_GROUP_THRESHOLDS: Readonly<Record<string, ReadonlyArray<readonly [number, string]>>> = {
  "wood stud|masonry": [[0.07, "K"], [0.083, "J"], [0.095, "I"], [0.1, "H"], [0.13, "G"], [0.175, "F"], [Infinity, "E"]],
  "wood stud|other": [[0.048, "J"], [0.051, "I"], [0.059, "H"], [0.063, "G"], [0.067, "F"], [0.075, "E"], [0.086, "D"], [0.11, "C"], [0.17, "B"], [Infinity, "A"]],
  "steel frame|masonry": [[0.09, "K"], [0.105, "J"], [0.118, "I"], [0.125, "H"], [0.145, "G"], [0.2, "F"], [Infinity, "E"]],
  "steel frame|other": [[0.066, "J"], [0.07, "I"], [0.075, "H"], [0.081, "G"], [0.088, "F"], [0.1, "E"], [0.105, "D"], [0.12, "C"], [0.2, "B"], [Infinity, "A"]],
  "concrete masonry unit|any": [[0.0575, "J"], [0.067, "I"], [0.08, "H"], [0.108, "G"], [0.148, "F"], [Infinity, "E"]],
};

/** Roof CLTD base by assembly R for conditioned (cathedral) roofs: [maxR, cltd] (lines 1171 to 1183; "Figure A12-16"). */
export const ROOF_CLTD_BY_R: ReadonlyArray<readonly [number, number]> = [[6, 50], [13, 45], [15, 38], [21, 31], [30, 30], [Infinity, 27]];

export type RoofColorClass = "dark" | "medium dark" | "medium" | "medium light" | "light" | "reflective";

/** Default solar absorptance by roof color and type (constructions.rb lines 1918 to 1960, NREL defaults); used to classify color from absorptance. */
export const ROOF_ABSORPTANCE_BY_COLOR: Readonly<Record<string, Readonly<Record<RoofColorClass, number>>>> = {
  "asphalt or fiberglass shingles": { dark: 0.92, "medium dark": 0.89, medium: 0.85, "medium light": 0.8, light: 0.75, reflective: 0.5 },
  "wood shingles or shakes": { dark: 0.92, "medium dark": 0.89, medium: 0.85, "medium light": 0.8, light: 0.75, reflective: 0.5 },
  "slate or tile shingles": { dark: 0.9, "medium dark": 0.83, medium: 0.75, "medium light": 0.67, light: 0.6, reflective: 0.3 },
  "metal surfacing": { dark: 0.9, "medium dark": 0.83, medium: 0.75, "medium light": 0.67, light: 0.6, reflective: 0.3 },
  concrete: { dark: 0.9, "medium dark": 0.83, medium: 0.75, "medium light": 0.67, light: 0.6, reflective: 0.3 },
  "cool roof": { dark: 0.9, "medium dark": 0.83, medium: 0.75, "medium light": 0.67, light: 0.6, reflective: 0.3 },
};

/** Nearest color class for a roof's absorptance (defaults.rb get_roof_color). */
export function roofColorFromAbsorptance(roofType: string, absorptance: number): RoofColorClass {
  const map = ROOF_ABSORPTANCE_BY_COLOR[roofType];
  if (!map) throw new Error(`no roof color map for roof type "${roofType}"`);
  let best: RoofColorClass = "medium";
  let bestDiff = Infinity;
  for (const [color, a] of Object.entries(map) as [RoofColorClass, number][]) {
    const d = Math.abs(a - absorptance);
    if (d < bestDiff) {
      bestDiff = d;
      best = color;
    }
  }
  return best;
}

/**
 * Vented-attic cooling design temperature base (°F) before the CTD/daily-range adjustment, by
 * roof type, color and radiant barrier (lines 436 to 505; "Figure A12-14"). Unvented attics use
 * 150 (no barrier) or 130 (barrier) regardless of roof.
 */
export function ventedAtticBaseTempF(roofType: string, color: RoofColorClass, radiantBarrier: boolean): number {
  const dark = color === "dark" || color === "medium dark";
  const lightish = color === "medium" || color === "medium light" || color === "light";
  switch (roofType) {
    case "asphalt or fiberglass shingles":
      return radiantBarrier ? (dark ? 120 : 110) : dark ? 130 : 120;
    case "wood shingles or shakes":
      return radiantBarrier ? 110 : 120;
    case "metal surfacing":
      if (color === "reflective") return 95;
      if (radiantBarrier) return dark ? 120 : 110;
      return dark ? 130 : 120;
    case "slate or tile shingles":
    case "concrete":
    case "cool roof":
      if (color === "reflective") return 95;
      if (radiantBarrier) return dark ? 105 : 100;
      return dark ? 110 : lightish ? 105 : 105;
    default:
      throw new Error(`no attic temperature rule for roof type "${roofType}"`);
  }
}
export const UNVENTED_ATTIC_BASE_TEMP_F = { noBarrier: 150, barrier: 130 } as const;
/** Encapsulated vented attic (floor R < roof R): cooling temp = outdoor + 40 (line 425). */
export const ENCAPSULATED_VENTED_ATTIC_COOLING_OFFSET_F = 40;

/** Roof (cathedral) CLTD color multiplier (lines 1186 to 1205). */
export function roofCltdColorMultiplier(roofType: string, color: RoofColorClass): number {
  const tileLike = roofType === "slate or tile shingles" || roofType === "concrete" || roofType === "cool roof";
  const shingleLike = roofType === "asphalt or fiberglass shingles" || roofType === "wood shingles or shakes";
  if (color === "dark" || color === "medium dark") {
    return tileLike || roofType === "wood shingles or shakes" ? 0.83 : 1.0;
  }
  if (color === "reflective") {
    return shingleLike ? 0.83 : 0.65;
  }
  return tileLike ? 0.65 : 0.83;
}

/** Ground conductivity (Btu/h-ft-°F) from soil and moisture type (lines 234 to 253; "Table 4A"). */
export function groundConductivity(soilType: string | undefined, moistureType: string | undefined, explicit?: number): number {
  if (explicit !== undefined) return explicit;
  const soil = soilType ?? "unknown";
  const moisture = moistureType ?? "mixed";
  const heavy = soil === "clay" || soil === "unknown" || soil === "other";
  const light = soil === "sand" || soil === "gravel" || soil === "silt";
  if (heavy && (moisture === "wet" || moisture === "mixed")) return 1 / 1.25;
  if (light && moisture === "dry") return 1 / 5;
  return 1 / 2;
}

/** Slab F-value model constants (lines 4914 to 4960; NREL model calibrated to Table 4A by T. Fontanini). */
export const SLAB = {
  gravelRPerInch: 0.65,
  concreteKInPerInch: 12.5, // Btu-in/h-ft2-°F (materials.rb BaseMaterial.Concrete)
  airFilmsR: 0.05 + 0.92 + 0.17, // indoor finish + indoor film + exposed film
  pathRadiiFt: [8, 9, 10, 11, 12, 13],
  radiantFloorHtdOffset: 25,
} as const;
