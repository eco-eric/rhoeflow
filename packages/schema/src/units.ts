/**
 * Units a quantity field may carry. Every numeric engineering input names its unit
 * explicitly so conversions are typed and testable (MTH-002, UNT-001).
 *
 * Conventions: IP units throughout, matching Manual J / S / D worksheets and
 * OpenStudio-HPXML inputs. No bare percentages: use "fraction" (PRV-003).
 */
export const UNITS = [
  // length / area / volume
  "ft",
  "in",
  "ft2",
  "ft3",
  // temperature
  "F",
  "deltaF",
  // heat flow and thermal properties
  "Btu/h",
  "ton", // 12,000 Btu/h; kept distinct so conversions are explicit
  "W",
  "kW",
  "Btu/h-ft2-F", // U-factor
  "h-ft2-F/Btu", // R-value
  // airflow and leakage
  "cfm",
  "cfm25",
  "cfm50",
  "ACH50",
  "ACHnatural",
  "cfm25/100ft2",
  "Pa",
  // efficiency ratings (unit-less ratings named so they cannot be confused)
  "AFUE",
  "SEER",
  "SEER2",
  "EER",
  "EER2",
  "HSPF",
  "HSPF2",
  "COP",
  // geometry and misc
  "degrees", // azimuth, clockwise from north
  "in:12", // roof pitch, rise per 12 in of run
  "fraction",
  "grains", // humidity ratio difference, grains of water per lb of dry air
  "count",
  "year",
] as const;

export type Unit = (typeof UNITS)[number];
