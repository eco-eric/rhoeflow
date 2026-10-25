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

// =======================================================================================
// Glazing (hvac_sizing.rb 612 to 700; MJ8 Tables 3D-2, 3D-3, 3E-1, A11-3, A11-5, A11-6, A11-7)

/** Orientation index order used by every glazing table: S, SW, W, NW, N, NE, E, SE, S. */
export const GLAZING_ORIENTATIONS = ["S", "SW", "W", "NW", "N", "NE", "E", "SE", "S"] as const;
export const NORTH_INDEX = 4;

/** Average cooling load factors without / with interior shading, by orientation (lines 614 to 619). */
export const CLF_AVG_NO_SHADE = [0.24, 0.35, 0.38, 0.4, 0.48, 0.4, 0.38, 0.35, 0.24] as const;
export const CLF_AVG_SHADE = [0.18, 0.29, 0.32, 0.32, 0.29, 0.32, 0.32, 0.29, 0.18] as const;

/** Hourly cooling load factors, 13 hours (8:00 to 20:00), without interior shading (lines 623 to 631). */
export const CLF_HOURLY_NO_SHADE: ReadonlyArray<ReadonlyArray<number>> = [
  [0.14, 0.22, 0.34, 0.48, 0.59, 0.65, 0.65, 0.59, 0.5, 0.43, 0.36, 0.28, 0.22],
  [0.1, 0.12, 0.14, 0.16, 0.24, 0.36, 0.49, 0.6, 0.66, 0.66, 0.58, 0.43, 0.33],
  [0.08, 0.1, 0.11, 0.12, 0.14, 0.2, 0.32, 0.45, 0.57, 0.64, 0.61, 0.44, 0.34],
  [0.1, 0.12, 0.14, 0.16, 0.17, 0.19, 0.23, 0.33, 0.47, 0.59, 0.6, 0.43, 0.33],
  [0.48, 0.56, 0.63, 0.71, 0.76, 0.8, 0.82, 0.82, 0.79, 0.75, 0.69, 0.61, 0.48],
  [0.51, 0.51, 0.45, 0.39, 0.36, 0.33, 0.31, 0.28, 0.26, 0.23, 0.19, 0.15, 0.12],
  [0.51, 0.57, 0.57, 0.5, 0.42, 0.37, 0.32, 0.29, 0.25, 0.22, 0.19, 0.15, 0.12],
  [0.43, 0.55, 0.62, 0.63, 0.57, 0.48, 0.42, 0.37, 0.33, 0.28, 0.24, 0.19, 0.15],
  [0.14, 0.22, 0.34, 0.48, 0.59, 0.65, 0.65, 0.59, 0.5, 0.43, 0.36, 0.28, 0.22],
];

/** Hourly cooling load factors with interior shading (lines 636 to 644). */
export const CLF_HOURLY_SHADE: ReadonlyArray<ReadonlyArray<number>> = [
  [0.23, 0.38, 0.58, 0.75, 0.83, 0.8, 0.68, 0.5, 0.35, 0.27, 0.19, 0.11, 0.09],
  [0.14, 0.16, 0.19, 0.22, 0.38, 0.59, 0.75, 0.83, 0.81, 0.69, 0.45, 0.16, 0.12],
  [0.11, 0.13, 0.15, 0.16, 0.17, 0.31, 0.53, 0.72, 0.82, 0.81, 0.61, 0.16, 0.12],
  [0.14, 0.17, 0.19, 0.2, 0.21, 0.22, 0.3, 0.52, 0.73, 0.82, 0.69, 0.16, 0.12],
  [0.65, 0.73, 0.8, 0.86, 0.89, 0.89, 0.86, 0.82, 0.75, 0.78, 0.91, 0.24, 0.18],
  [0.74, 0.58, 0.37, 0.29, 0.27, 0.26, 0.24, 0.22, 0.2, 0.16, 0.12, 0.06, 0.05],
  [0.8, 0.76, 0.62, 0.41, 0.27, 0.24, 0.22, 0.2, 0.17, 0.14, 0.11, 0.06, 0.05],
  [0.74, 0.81, 0.79, 0.68, 0.49, 0.33, 0.28, 0.25, 0.22, 0.18, 0.13, 0.08, 0.07],
  [0.23, 0.38, 0.58, 0.75, 0.83, 0.8, 0.68, 0.5, 0.35, 0.27, 0.19, 0.11, 0.09],
];

/** Mid-summer hourly shade-line multipliers by latitude (28 to 60) and hour group (9:00, noon, 15:00, 17:00) (lines 648 to 657). */
export const SLM_HOURLY_LATITUDES = [28, 34, 40, 46, 52, 60] as const;
export const SLM_HOURLY: ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>> = [
  [[5.3, 3.7, 5.3, 0.0], [3.2, 2.5, 3.2, 0.0], [2.2, 1.9, 2.2, 0.2], [1.8, 1.5, 1.8, 0.0], [1.4, 1.2, 1.4, 0.0], [1.1, 0.9, 1.1, 0.0]],
  [[0.0, 5.0, 1.2, 0.2], [0.0, 3.4, 1.1, 0.2], [0.0, 2.6, 0.9, 0.1], [0.0, 2.1, 0.8, 0.2], [0.0, 1.7, 0.8, 0.3], [0.0, 1.3, 0.7, 0.3]],
  [[0.0, 0.0, 1.0, 0.1], [0.0, 0.0, 1.0, 0.1], [0.0, 0.0, 1.0, 0.1], [0.0, 0.0, 0.9, 0.2], [0.0, 0.0, 0.9, 0.2], [0.0, 0.0, 0.8, 0.2]],
  [[0.0, 0.0, 1.9, 0.1], [0.0, 0.0, 2.1, 0.1], [0.0, 0.0, 2.4, 0.0], [0.0, 0.0, 2.6, 0.2], [0.0, 0.0, 3.1, 0.2], [0.0, 0.0, 3.9, 0.2]],
  [[0.0, 0.0, 0.0, 0.5], [0.0, 0.0, 0.0, 0.7], [0.0, 0.0, 0.0, 0.8], [0.0, 0.0, 0.0, 1.0], [0.0, 0.0, 0.0, 1.3], [0.0, 0.0, 0.0, 1.8]],
  [[1.9, 0.0, 0.0, 0.0], [2.1, 0.0, 0.0, 0.0], [2.4, 0.0, 0.0, 0.0], [2.6, 0.0, 0.0, 0.0], [3.1, 0.0, 0.0, 0.0], [3.9, 0.0, 0.0, 0.0]],
  [[1.0, 0.0, 0.0, 0.0], [1.0, 0.0, 0.0, 0.0], [1.0, 0.0, 0.0, 0.0], [0.9, 0.0, 0.0, 0.0], [0.9, 0.0, 0.0, 0.0], [0.8, 0.0, 0.0, 0.0]],
  [[1.2, 5.0, 0.0, 0.0], [1.1, 3.4, 0.0, 0.0], [0.9, 2.6, 0.0, 0.0], [0.8, 2.1, 0.0, 0.0], [0.8, 1.7, 0.0, 0.0], [0.7, 1.3, 0.0, 0.0]],
  [[5.3, 3.7, 5.3, 0.0], [3.2, 2.5, 3.2, 0.0], [2.2, 1.9, 2.2, 0.2], [1.8, 1.5, 1.8, 0.0], [1.4, 1.2, 1.4, 0.0], [1.1, 0.9, 1.1, 0.0]],
];

/** Average shade-line multipliers by latitude (25 to 50) (lines 660 to 669). */
export const SLM_AVG_LATITUDES = [25, 30, 35, 40, 45, 50] as const;
export const SLM_AVG: ReadonlyArray<ReadonlyArray<number>> = [
  [10.1, 5.4, 3.53, 2.6, 2.05, 1.7],
  [1.89, 1.63, 1.41, 1.25, 1.13, 1.01],
  [0.83, 0.83, 0.82, 0.81, 0.8, 0.79],
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.83, 0.83, 0.82, 0.81, 0.8, 0.79],
  [1.89, 1.63, 1.41, 1.25, 1.13, 1.01],
  [10.1, 5.4, 3.53, 2.6, 2.05, 1.7],
];

/** Peak solar factors (Btu/h-ft2) by orientation and latitude (lines 672 to 682). */
export const PSF_LATITUDES = [28, 34, 40, 46, 52, 60] as const;
export const PSF: ReadonlyArray<ReadonlyArray<number>> = [
  [91.0, 121.0, 149.0, 173.0, 193.0, 211.0],
  [172.0, 185.0, 196.0, 205.0, 212.0, 217.0],
  [220.0, 219.0, 216.0, 213.0, 208.0, 199.0],
  [149.0, 140.0, 135.0, 130.0, 124.0, 114.0],
  [38.0, 37.0, 35.0, 34.0, 32.0, 28.0],
  [149.0, 140.0, 135.0, 130.0, 124.0, 114.0],
  [220.0, 219.0, 216.0, 213.0, 208.0, 199.0],
  [172.0, 185.0, 196.0, 205.0, 212.0, 217.0],
  [91.0, 121.0, 149.0, 173.0, 193.0, 211.0],
];

/** Hourly temperature adjustment by daily-range class [low, medium, high], 13 hours (lines 686 to 688). */
export const HOURLY_TEMP_ADJUST: ReadonlyArray<ReadonlyArray<number>> = [
  [-6.3, -5.0, -3.7, -2.5, -1.5, -0.7, -0.2, 0.0, -0.2, -0.7, -1.5, -2.5, -3.7],
  [-12.6, -10.0, -7.4, -5.0, -2.9, -1.3, -0.3, 0.0, -0.3, -1.3, -2.9, -5.0, -7.4],
  [-18.9, -15.0, -11.1, -7.5, -4.4, -2.0, -0.5, 0.0, -0.5, -2.0, -4.4, -7.5, -11.1],
];

/** Solar heat gain reference SHGC in the window HTM (SHGC / 0.87) (line 749). */
export const SHGC_REFERENCE = 0.87;
/** AED excursion limit as a multiple of the daily average fenestration load (line 971). */
export const AED_EXCURSION_LIMIT = 1.3;

/**
 * Interior shading coefficients by window type and shading device (lines 5082 to 5095; "Table 3D-4").
 * Columns: dark blinds, medium blinds, light blinds, dark shades, medium shades, light shades,
 * dark curtains, medium curtains, light curtains.
 */
export const INTERIOR_SHADING_COEFFICIENTS: Readonly<Record<string, ReadonlyArray<number>>> = {
  "1P Clear": [0.68, 0.6, 0.51, 0.8, 0.55, 0.4, 0.8, 0.6, 0.35],
  "1P Heat Absorbing": [0.81, 0.75, 0.69, 0.66, 0.52, 0.44, 0.81, 0.66, 0.52],
  "1P Reflective": [0.78, 0.71, 0.64, 0.89, 0.73, 0.61, 1.0, 0.75, 0.58],
  "2P Clear": [0.64, 0.59, 0.54, 0.8, 0.57, 0.46, 0.86, 0.63, 0.34],
  "2P Low-e Option 1": [0.68, 0.62, 0.57, 0.87, 0.6, 0.47, 0.93, 0.67, 0.33],
  "2P Low-e Option 2": [0.72, 0.65, 0.59, 0.77, 0.62, 0.54, 0.77, 0.62, 0.54],
  "2P Low-e Option 3": [0.85, 0.76, 0.66, 0.87, 0.77, 0.66, 0.89, 0.78, 0.67],
  "2P Heat Absorbing": [0.66, 0.59, 0.51, 0.69, 0.52, 0.43, 0.86, 0.69, 0.6],
  "2P Reflective": [0.85, 0.76, 0.66, 0.87, 0.77, 0.66, 0.89, 0.78, 0.67],
  "3P Clear": [0.64, 0.58, 0.53, 0.81, 0.56, 0.44, 0.87, 0.62, 0.31],
  "3P Heat Absorbing": [0.85, 0.74, 0.64, 0.87, 0.62, 0.5, 1.0, 0.87, 0.75],
  "3P Reflective": [0.85, 0.74, 0.64, 0.86, 0.75, 0.63, 0.87, 0.75, 0.62],
};
export const INTERIOR_SHADING_COLUMNS = ["dark blinds", "medium blinds", "light blinds", "dark shades", "medium shades", "light shades", "dark curtains", "medium curtains", "light curtains"] as const;
export type InteriorShadingDevice = (typeof INTERIOR_SHADING_COLUMNS)[number];

// =======================================================================================
// Infiltration (hvac_sizing.rb 1461 to 1500; "Tables 5D/5E"; SLA per ANSI/RESNET/ICC 301)

export const INFILTRATION = {
  pressureExponent: 0.65,
  /** Stack coefficient per above-grade story (line 1471). */
  stackCoefficientPerStory: 0.015,
  /** Wind coefficient: (0.0065 - 0.00266 x (class - 3)) x stories^0.4 (line 1472). */
  windCoefficientBase: 0.0065,
  windCoefficientPerClass: 0.00266,
  windCoefficientStoriesExponent: 0.4,
  windSpeedCoolingMph: 7.5,
  windSpeedHeatingMph: 15.0,
  fireplaceHeatingCfm: 20.0,
  /** Sensible load per cfm per degree F and latent per cfm per grain, both x altitude factor (lines 1546 to 1548). */
  sensibleFactor: 1.1,
  latentFactor: 0.68,
  /** Rim-joist allowance between stories in the default infiltration height (defaults.rb 5803). */
  rimJoistFt: 0.5,
} as const;

/** Manual J Table 5A default air changes per hour by leakiness, stories and floor-area bin (lines 4720 to 4765). */
export const DEFAULT_ACH_FLOOR_AREA_BINS = [900, 1500, 2000, 3000, Infinity] as const;
export type LeakinessClass = "very tight" | "tight" | "average" | "leaky" | "very leaky";
export const DEFAULT_ACH_SFD_HEATING: ReadonlyArray<Readonly<Record<LeakinessClass, ReadonlyArray<number>>>> = [
  { "very tight": [0.21, 0.16, 0.14, 0.11, 0.1], tight: [0.41, 0.31, 0.26, 0.22, 0.19], average: [0.61, 0.45, 0.38, 0.32, 0.28], leaky: [0.95, 0.7, 0.59, 0.49, 0.43], "very leaky": [1.29, 0.94, 0.8, 0.66, 0.58] },
  { "very tight": [0.27, 0.2, 0.18, 0.15, 0.13], tight: [0.53, 0.39, 0.34, 0.28, 0.25], average: [0.79, 0.58, 0.5, 0.41, 0.37], leaky: [1.23, 0.9, 0.77, 0.63, 0.56], "very leaky": [1.67, 1.22, 1.04, 0.85, 0.75] },
];
export const DEFAULT_ACH_SFD_COOLING: ReadonlyArray<Readonly<Record<LeakinessClass, ReadonlyArray<number>>>> = [
  { "very tight": [0.11, 0.08, 0.07, 0.06, 0.05], tight: [0.22, 0.16, 0.14, 0.11, 0.1], average: [0.32, 0.23, 0.2, 0.16, 0.15], leaky: [0.5, 0.36, 0.31, 0.25, 0.23], "very leaky": [0.67, 0.49, 0.42, 0.34, 0.3] },
  { "very tight": [0.14, 0.11, 0.09, 0.08, 0.07], tight: [0.28, 0.21, 0.18, 0.15, 0.13], average: [0.41, 0.3, 0.26, 0.21, 0.19], leaky: [0.64, 0.47, 0.4, 0.33, 0.29], "very leaky": [0.87, 0.64, 0.54, 0.44, 0.39] },
];

// =======================================================================================
// Internal gains (hvac_sizing.rb 1610 to 1611)

export const INTERNAL_GAINS = { sensiblePerOccupant: 230, latentPerOccupant: 200 } as const;

// =======================================================================================
// Ducts (hvac_sizing.rb 1653 to 1690, 1765 to 1830, 1846 to 2020, 3825 to 3887, 3951 to 4219;
// defaults.rb 6046 to 6100, 6598 to 6645; ASHRAE Standard 152)

export const DUCTS = {
  /** Default actual airflow per ton of load (hvac.rb lines 12 to 13, RESNET). */
  cfmPerTonFurnace: 240,
  cfmPerTonDx: 360,
  /** Supply air temperature during heating (lines 1684 to 1690). */
  supplyAirTempFurnaceF: 120,
  supplyAirTempHeatPumpF: 105,
  /** Leaving air temperature rule by sensible heat ratio (lines 1664 to 1675). */
  leavingAirTempLowShrF: 54,
  leavingAirTempHighShrF: 58,
  shrLow: 0.8,
  shrHigh: 0.85,
  /** Delivery-effectiveness convergence (lines 1872, 1879 to 1909). */
  maxIterations: 50,
  convergenceDelta: 0.001,
  deFloor: 0.25,
  deCeiling: 1.0,
  /** Surface-area defaults (defaults.rb 6598 to 6614). */
  supplyAreaPerCfa: 0.27,
  returnAreaPerCfaPerRegister: 0.05,
  returnAreaPerCfaMax: 0.25,
  /** Effective R model (defaults.rb 6046 to 6075; Palmiter and Kruse 2006). */
  uninsulatedEffectiveR: 1.7,
  supplyDiameterIn: 6.0,
  returnDiameterIn: 14.0,
  exteriorFilmR: 0.667,
  interiorFilmRectR: 0.333,
  insulationRPerInch: 2.8,
  defaultFractionRectangularSupply: 0.25,
  defaultFractionRectangularReturn: 1.0,
} as const;

// =======================================================================================
// Framed assemblies (constructions.rb 346 to 410, 2484 to 2510, 2674 to 2700, 2816 to 2838,
// 3111 to 3180; materials.rb 86 to 140, 205 to 330, 416 to 540)

/** Conductivity (Btu-in/h-ft2-F) and default thickness (in) of the layers the oracle's framed models use. */
export const FRAMED = {
  woodKIn: 0.8004,
  gypsumKIn: 1.1112,
  interiorFinishThicknessIn: 0.5,
  wallOsbThicknessIn: 0.5,
  /** Closed air cavity in an uninsulated stud bay (materials.rb 86 to 89). */
  closedAirCavityR: 1.0,
  /** Open air cavity in an uninsulated joist bay (materials.rb 97 to 99): k_in 1e7, so R ≈ 0. */
  openAirCavityKIn: 1e7,
  filmIndoorWallR: 0.68,
  /** Exterior film: mean of winter 0.17 and summer 0.25 (materials.rb 115 to 130). */
  filmOutsideR: (0.17 + 0.25) / 2,
  /** Ceiling films on both faces: mean of downward 0.92 and upward 0.61 (materials.rb 144 to 158). */
  filmFloorAverageR: (0.92 + 0.61) / 2,
} as const;

/** Actual stud and joist depth by nominal size (materials.rb 312 to 325). */
export const STUD_ACTUAL_DEPTH_IN: Readonly<Record<number, number>> = { 2: 1.5, 3: 2.5, 4: 3.5, 6: 5.5, 8: 7.25, 10: 9.25, 12: 11.25 };

/** Exterior finish R by siding type: thickness / k (materials.rb 205 to 250 with base materials 516 to 540). */
export const SIDING_R: Readonly<Record<string, number>> = {
  "brick veneer": 4.0 / 5.5,
  stone: 1.0 / 12.5,
  stucco: 1.0 / 4.5,
  "synthetic stucco": 1.0 / 0.204,
  "vinyl siding": 0.375 / 0.62,
  "aluminum siding": 0.375 / 0.62,
  "fiber cement siding": 0.375 / 1.79,
  "masonite siding": 0.5 / 0.69,
  "wood siding": 0.75 / 0.71,
  none: 0,
};

/** The oracle's wood-frame construction sets (constructions.rb 2502 to 2508, 2694 to 2702), for reference defaults. */
export const WOOD_FRAMING_SETS = {
  wall2x4At16: { studNominalIn: 4, framingFactor: 0.23 },
  wall2x6At24: { studNominalIn: 6, framingFactor: 0.2 },
  ceiling2x4At16: { studNominalIn: 4, framingFactor: 0.13 },
  ceiling2x6At24: { studNominalIn: 6, framingFactor: 0.1 },
} as const;

/** Regain factors by duct location for the locations WO-02 supports (lines 1765 to 1830). */
export const DUCT_REGAIN_FACTOR: Readonly<Record<string, number>> = {
  outside: 0.0,
  "attic - vented": 0.1,
  "attic - unvented": 0.1,
  garage: 0.05,
  "conditioned space": 1.0,
  "basement - conditioned": 1.0,
  "crawlspace - conditioned": 1.0,
};
