/**
 * Report rounding rules (RPT-001). Every number a report prints is a run or input value passed
 * through exactly one of these rules, and the report keeps the raw value beside the printed one
 * so a test (and E2's PDF check) can confirm the two agree. Rounding is half away from zero at
 * the rule's decimals. The rules are display rules only; no engineering value is computed here.
 */

export const ROUNDING_RULES = {
  /** Loads. Whole Btu/h; the oracle reports to the same precision. */
  btuh: { decimals: 0, unit: "Btu/h" },
  /** Cooling capacity equivalent of a load (Btu/h ÷ 12,000). */
  tons: { decimals: 2, unit: "tons" },
  /** Sanity figure: conditioned floor area per ton of total cooling load. */
  ft2_per_ton: { decimals: 0, unit: "ft²/ton" },
  /** Sanity figure: load per ft² of conditioned floor area. */
  btuh_per_ft2: { decimals: 1, unit: "Btu/h·ft²" },
  temperature_f: { decimals: 1, unit: "°F" },
  temperature_difference_f: { decimals: 1, unit: "°F" },
  area_ft2: { decimals: 1, unit: "ft²" },
  length_ft: { decimals: 1, unit: "ft" },
  elevation_ft: { decimals: 0, unit: "ft" },
  r_value: { decimals: 1, unit: "h·ft²·°F/Btu" },
  u_value: { decimals: 3, unit: "Btu/h·ft²·°F" },
  f_value: { decimals: 3, unit: "Btu/h·ft·°F" },
  shgc: { decimals: 2, unit: "" },
  /** Heat transfer multiplier, Btu/h per ft² (per ft of perimeter for a slab). */
  htm: { decimals: 2, unit: "Btu/h per unit" },
  azimuth_deg: { decimals: 0, unit: "°" },
  percent: { decimals: 0, unit: "%" },
  grains: { decimals: 1, unit: "gr/lb" },
  pressure_psi: { decimals: 3, unit: "psia" },
  humidity_ratio: { decimals: 4, unit: "lb/lb" },
  ach50: { decimals: 2, unit: "ACH50" },
  cfm: { decimals: 1, unit: "CFM" },
  leakage_cfm: { decimals: 1, unit: "CFM25" },
  count: { decimals: 0, unit: "" },
  year: { decimals: 0, unit: "" },
  factor: { decimals: 3, unit: "" },
} as const;

export type RoundingRuleId = keyof typeof ROUNDING_RULES;

/** A printed number: the value it came from, the rounded value, and the text that is printed. */
export interface PrintedNumber {
  raw: number;
  value: number;
  text: string;
  unit: string;
  rule: RoundingRuleId;
}

/** Half away from zero at `decimals`, robust to binary representation (1.005 → 1.01). */
export function roundHalfAway(x: number, decimals: number): number {
  if (!Number.isFinite(x)) throw new Error(`cannot round ${x}`);
  const f = 10 ** decimals;
  const scaled = Math.abs(x) * f;
  const r = Math.round(scaled + scaled * Number.EPSILON * 4) / f;
  return r === 0 ? 0 : Math.sign(x) * r;
}

const formatters = new Map<number, Intl.NumberFormat>();
function formatter(decimals: number, grouping: boolean): Intl.NumberFormat {
  const key = decimals * 2 + (grouping ? 1 : 0);
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouping });
    formatters.set(key, f);
  }
  return f;
}

/** Apply a rule. `unit` overrides the rule's display unit where the rule's unit is generic (HTM). */
export function printed(raw: number, rule: RoundingRuleId, unit?: string): PrintedNumber {
  const r = ROUNDING_RULES[rule];
  const value = roundHalfAway(raw, r.decimals);
  const grouping = rule !== "year" && rule !== "azimuth_deg";
  const text = rule === "percent" ? formatter(0, false).format(value) : formatter(r.decimals, grouping).format(value);
  return { raw, value, text, unit: unit ?? r.unit, rule };
}

/** Parse a printed text back to a number (for the "printed equals run data" check). */
export function parsePrinted(text: string): number {
  return Number(text.replace(/,/g, ""));
}
