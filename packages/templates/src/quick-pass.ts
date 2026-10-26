/**
 * RHOE.quick_pass.box_geometry (WO-03 D2; quick-pass map `claude/06-architecture/quick-pass-map.md`).
 *
 * Turns the quick pass's twelve answers and an era template into a complete Assessment the
 * engine can run. Pure: no DOM, no Node, so the phone can build a live preview and the server
 * builds the same Assessment when a revision is accepted.
 *
 * Provenance rules (PRV-001, ADR-024, ADR-027):
 * - An answer keeps the state the tech gave it (`measured`, `documented` or `assumed`) and a
 *   source naming the question.
 * - An unanswered or unknown question falls back to the template, or to a cited default, tagged
 *   `defaulted`; "inspected, can't tell" adds the note the report shows. Unknown is never zero.
 * - Everything the box model computes (areas, perimeters, assembly R, ACH50 from a leakiness
 *   answer, duct leakage from a rate) is `derived`, citing the method and the inputs.
 *
 * Defaults cite the reference engine's own tables at the pinned release (OpenStudio-HPXML
 * v1.12.0, BSD; see license-inventory.md): BuildResidentialHPXML ("BRH") argument defaults and
 * option tables, and HPXMLtoOpenStudio `defaults.rb`. Values the map calls builder placeholders
 * say so in their source until the owner replaces them in the template editor (D9).
 */
import { z } from "zod";
import {
  MediaIdSchema,
  UNKNOWN_REASONS,
  collectFields,
  validateAssessment,
  type Assessment,
  type AssessmentInput,
  type Field,
  type KnownState,
  type Unit,
  type UnknownReason,
} from "@rhoeflow/schema";
import {
  WEATHER_LIBRARY,
  WOOD_FRAMING_SETS,
  framedCeilingAssemblyR,
  framedWallAssemblyR,
  resdbAch50,
  resdbInputFromAssessment,
  resolveWeatherStation,
  type LeakinessDescription,
  type WeatherStation,
} from "@rhoeflow/calc";
import { applyTemplate } from "./apply.js";
import type { Template } from "./template.js";

export const RHOE_QUICK_PASS = { id: "RHOE.quick_pass.box_geometry", version: "0.1.1" } as const;
export const QUICK_PASS_VERSION = "0.1.0" as const;

// ---------------------------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------------------------

/** States a tech may give an answer. `proposed` is AI's (none in WO-03); defaults are never the tech's. */
export const ANSWER_STATES = ["measured", "documented", "assumed"] as const;

function given<V extends z.ZodType>(value: V) {
  return z.strictObject({
    value,
    state: z.enum(ANSWER_STATES).default("assumed"),
    /** Defaults to "quick pass Q<n>, answered by the tech". A plan sheet or nameplate goes here. */
    source: z.string().trim().min(1).optional(),
    note: z.string().optional(),
    evidence: z.array(MediaIdSchema).default([]),
    /**
     * Other values seen for this question from a different source or method, kept, never
     * overwritten (D3, PRV-002): e.g. a tape-measured floor area against one read from the plan.
     * The answer's own value is the one in use.
     */
    alternatives: z
      .array(
        z.strictObject({
          value,
          state: z.enum(ANSWER_STATES),
          source: z.string().trim().min(1),
          note: z.string().optional(),
          evidence: z.array(MediaIdSchema).default([]),
          recorded_at: z.iso.datetime({ offset: true }).optional(),
        }),
      )
      .max(10)
      .default([]),
    /** Why this value was chosen over the alternatives (PRV-003). Required when an alternative differs. */
    rationale: z.string().trim().min(1).optional(),
  });
}

/** ADR-027: "didn't inspect" vs "inspected, can't tell". Neither becomes zero. */
const UnknownAnswerSchema = z.strictObject({
  unknown: z.enum(UNKNOWN_REASONS),
  note: z.string().optional(),
  evidence: z.array(MediaIdSchema).default([]),
});

function answer<V extends z.ZodType>(value: V) {
  return z.union([given(value), UnknownAnswerSchema]).optional();
}

/** Window types the map offers, each a row of the HES table in `defaults.rb` (6468 to 6478). */
export const WINDOW_TYPES = {
  single_clear_metal: { label: "Single pane, metal frame", ufactor: 1.27, shgc: 0.75, line: 6468 },
  single_clear_nonmetal: { label: "Single pane, wood or vinyl frame", ufactor: 0.89, shgc: 0.64, line: 6469 },
  double_clear_metal: { label: "Double pane clear, metal frame", ufactor: 0.81, shgc: 0.67, line: 6472 },
  double_clear_nonmetal: { label: "Double pane clear, wood or vinyl frame", ufactor: 0.51, shgc: 0.56, line: 6474 },
  double_lowe_nonmetal: { label: "Double pane low-E, wood or vinyl frame", ufactor: 0.42, shgc: 0.52, line: 6478 },
} as const;
export type WindowType = keyof typeof WINDOW_TYPES;

/** Attic choices (map Q9): nominal R steps of BRH `enclosure_ceiling.tsv`. */
export const ATTIC_CHOICES = { none: 0, some: 13, modern: 30, upgraded: 38 } as const;

/**
 * R per inch for a measured attic depth. BUILDER PLACEHOLDERS: mid-range values commonly
 * published for each material; the owner confirms them (quick-pass map §5). The depth is the
 * measurement; the R it implies is `derived` and says which factor it used.
 */
export const R_PER_INCH = { cellulose: 3.5, fiberglass_loose: 2.5, fiberglass_batt: 3.2 } as const;

/** Window amount (map Q7). Typical is the plan's low end; light and lots are builder placeholders. */
export const WINDOW_FRACTIONS = { light: 0.1, typical: 0.15, lots: 0.22 } as const;

export const QuickPassAnswersSchema = z.strictObject({
  quick_pass_version: z.literal(QUICK_PASS_VERSION),
  /** Q1. The WorkEdge property fixes the address; this is the weather station it maps to. */
  station_key: answer(z.string().trim().min(1)),
  /** Q2 (required: it selects the template). */
  year_built: answer(z.number().int()),
  /** Q3 (required). Conditioned floor area, ft². */
  floor_area: answer(z.number().positive()),
  /** Q3 (required). Stories above grade; RhoeFlow's quick pass has no basements. */
  stories: answer(z.number().int().min(1).max(3)),
  /** Q3a (required). Cars 0 means no garage. Side as seen from the street, facing the front door. */
  garage: answer(z.strictObject({ cars: z.number().int().min(0).max(3), side: z.enum(["left", "right"]) })),
  /** Q3b. A conditioned room over the garage (two-story houses with a garage only). */
  room_over_garage: answer(z.boolean()),
  /** Q4. ft. */
  ceiling_height: answer(z.number().positive()),
  /** Q5 (required). Azimuth the front faces, degrees clockwise from north; the UI offers 8 points. */
  front_azimuth: answer(z.number().min(0).lt(360)),
  /** Q6. */
  foundation: answer(z.enum(["slab", "crawlspace"])),
  /** Q7. A choice, or the measured total window area. */
  window_amount: answer(z.union([z.enum(["light", "typical", "lots"]), z.strictObject({ total_area_ft2: z.number().positive() })])),
  /** Q8. A choice, or U-factor and SHGC read from an NFRC label. */
  window_type: answer(
    z.union([
      z.enum(Object.keys(WINDOW_TYPES) as [WindowType, ...WindowType[]]),
      z.strictObject({ ufactor: z.number().positive(), shgc: z.number().gt(0).lt(1) }),
    ]),
  ),
  /** Q9. A choice, a nominal R read from a label, or a measured depth and its material. */
  attic_insulation: answer(
    z.union([
      z.enum(["none", "some", "modern", "upgraded"]),
      z.strictObject({ nominal_r: z.number().min(0) }),
      z.strictObject({ depth_in: z.number().min(0), material: z.enum(["cellulose", "fiberglass_loose", "fiberglass_batt"]) }),
    ]),
  ),
  /** Q10. Where the supply and return ducts run. Ignored for a ductless system. */
  duct_location: answer(z.enum(["attic", "conditioned", "garage", "crawlspace"])),
  /** Q10. Sealed or not, or a duct-blaster total leakage to outside in CFM25. */
  ducts_sealed: answer(z.union([z.boolean(), z.strictObject({ leakage_to_outside_cfm25: z.number().min(0) })])),
  /** Q10b. The existing system type; it only decides whether there are ducts. Equipment details come from WorkEdge later (A2). */
  system: answer(z.enum(["furnace_ac", "heat_pump", "ductless"])),
  /** Q11. A choice, or a blower-door result. */
  tightness: answer(
    z.union([z.enum(["leaky", "average", "tight"]), z.strictObject({ ach50: z.number().positive() }), z.strictObject({ cfm50: z.number().positive() })]),
  ),
  /** Q12 (required). Occupants = bedrooms + 1. */
  bedrooms: answer(z.number().int().min(0).max(12)),
});
export type QuickPassAnswers = z.output<typeof QuickPassAnswersSchema>;
export type QuickPassAnswersInput = z.input<typeof QuickPassAnswersSchema>;
export type QuestionKey = Exclude<keyof QuickPassAnswers, "quick_pass_version">;

export interface QuestionInfo {
  key: QuestionKey;
  number: string;
  label: string;
  required: boolean;
  section: "home" | "size" | "orientation" | "windows" | "attic" | "ducts" | "tightness";
}

/** The questions in the map's order, with the section the task overview groups them under. */
export const QUICK_PASS_QUESTIONS: readonly QuestionInfo[] = [
  { key: "station_key", number: "1", label: "Address and weather station", required: false, section: "home" },
  { key: "year_built", number: "2", label: "Year built", required: true, section: "home" },
  { key: "floor_area", number: "3", label: "Conditioned floor area", required: true, section: "size" },
  { key: "stories", number: "3", label: "Stories", required: true, section: "size" },
  { key: "garage", number: "3a", label: "Attached garage", required: true, section: "size" },
  { key: "room_over_garage", number: "3b", label: "Room over the garage", required: false, section: "size" },
  { key: "ceiling_height", number: "4", label: "Ceiling height", required: false, section: "size" },
  { key: "bedrooms", number: "12", label: "Bedrooms", required: true, section: "size" },
  { key: "front_azimuth", number: "5", label: "Which way the front faces", required: true, section: "orientation" },
  { key: "foundation", number: "6", label: "Foundation", required: false, section: "orientation" },
  { key: "window_amount", number: "7", label: "Window amount", required: false, section: "windows" },
  { key: "window_type", number: "8", label: "Window type", required: false, section: "windows" },
  { key: "attic_insulation", number: "9", label: "Attic insulation", required: false, section: "attic" },
  { key: "system", number: "10b", label: "Heating and cooling system", required: false, section: "ducts" },
  { key: "duct_location", number: "10", label: "Where the ducts run", required: false, section: "ducts" },
  { key: "ducts_sealed", number: "10", label: "Are the ducts sealed", required: false, section: "ducts" },
  { key: "tightness", number: "11", label: "House tightness", required: false, section: "tightness" },
];

export function emptyQuickPassAnswers(): QuickPassAnswers {
  return QuickPassAnswersSchema.parse({ quick_pass_version: QUICK_PASS_VERSION });
}

// ---------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------

const HPXML = "OpenStudio-HPXML v1.12.0";
const BRH = `${HPXML} BuildResidentialHPXML`;
const DEFAULTS_RB = `${HPXML} HPXMLtoOpenStudio/resources/defaults.rb`;
const M = `${RHOE_QUICK_PASS.id} ${RHOE_QUICK_PASS.version}`;

export const QUICK_PASS_SOURCES = {
  station: `ADR-034: design conditions from the pinned weather library ${WEATHER_LIBRARY.name}@${WEATHER_LIBRARY.version}; DFW station 722590 is the only station in it (WO-03 §7)`,
  facility: "quick pass: single-family detached houses only (WO-03 scope)",
  aspect: `${BRH} geometry_unit_aspect_ratio default 2 (front and back are the long walls)`,
  ceilingHeight: `${BRH} geometry_average_ceiling_height default 8 ft (quick-pass map Q4; the owner sets era values in the template editor)`,
  garageSize: `${BRH} resources/options/geometry_garage_type.tsv lines 3, 9, 15: 1, 2 and 3 cars are 12, 21 and 30 ft wide, 20 ft deep`,
  windowSplit: "ANSI/RESNET/ICC 301 reference home: window area split equally on four orientations (quick-pass map §2)",
  windowTypical: "RhoeFlow plan v2 §Quick pass: typical glazing 15 to 18 % of floor area, low end used (quick-pass map Q7)",
  windowLightLots: "BUILDER PLACEHOLDER (quick-pass map Q7): light 0.10 and lots 0.22 of floor area until the owner sets them in the template editor",
  shading: `${DEFAULTS_RB} 1662 and 1670: light curtains, summer coverage 0.5 (ANSI/RESNET/ICC 301-2022)`,
  door: `${BRH} geometry_door_area default 20 ft2 on the front wall; enclosure_door default "Solid Wood, R-2" (resources/options/enclosure_door.tsv line 2)`,
  wallType: `${BRH} enclosure_wall default "Wood Stud, R-13": wood stud framing`,
  wallColor: `${DEFAULTS_RB} 1383 to 1384 default wall color medium; constructions.rb 1992 medium = solar absorptance 0.70`,
  emittance: `${DEFAULTS_RB} 1273 and 1376: emittance 0.90`,
  roof: `${BRH} enclosure_roof_material default "Asphalt/Fiberglass Shingles, Medium"; geometry_roof_pitch default 6:12`,
  roofColor: `${DEFAULTS_RB} 1286 to 1287 default roof color medium; constructions.rb 1922 medium asphalt shingles = solar absorptance 0.85`,
  roofR: `${BRH} resources/options/enclosure_roof.tsv line 2: uninsulated roof deck over an unconditioned attic, assembly R-2.3`,
  radiantBarrierNone: `${BRH} enclosure_radiant_barrier default None (the template has no radiant-barrier slot)`,
  radiantBarrierGrade: `${DEFAULTS_RB} 1282 to 1283: radiant barrier grade 1 when present`,
  slab: `${BRH} enclosure_slab default Uninsulated; ${DEFAULTS_RB} 1554 slab thickness 4 in`,
  carpet: `${DEFAULTS_RB} 1563 to 1567: conditioned slab carpet fraction 0.8, carpet R-2`,
  garageSlab: `${DEFAULTS_RB} 1554 and 1563 to 1567: garage slab 4 in, no carpet; BRH: garages are on slab-on-grade`,
  crawlSla: `${DEFAULTS_RB} 5725 to 5727: vented crawlspace SLA 1/150 (ANSI/RESNET/ICC 301 Table 4.2.2(1))`,
  crawlFloor: `${BRH} resources/options/enclosure_floor_over_foundation.tsv line 2: wood frame floor, uninsulated, assembly R-3.7 (BUILDER PLACEHOLDER: DFW pier-and-beam floors are taken as uninsulated until the owner says otherwise)`,
  crawlSkirt:
    "BUILDER PLACEHOLDER: brick skirt between piers, 2.5 ft high, 0.5 ft below grade, 8 in double brick, assembly R-2.2, as in the oracle-verified fixture ranch-1950s-crawl-dfw; the owner confirms",
  garageCeiling: `${BRH} resources/options/enclosure_ceiling.tsv line 2: uninsulated ceiling; garage ceilings taken as uninsulated drywall`,
  garageWalls: "BUILDER PLACEHOLDER: attached-garage exterior walls taken as uninsulated wood stud with the house cladding; the owner confirms",
  floorOverGarageOld: `${BRH} resources/options/enclosure_floor_over_garage.tsv line 2: wood frame, uninsulated, assembly R-3.7 (houses built before Texas's first statewide code, 2001)`,
  floorOverGarageNew: `${BRH} resources/options/enclosure_floor_over_garage.tsv line 6: wood frame R-19, assembly R-21 (BUILDER PLACEHOLDER: IECC climate zone 3 floor R-19 taken for houses built under a Texas statewide code, 2001 and later; the owner confirms)`,
  heating: `${BRH} hvac_heating_system default "Central Furnace, 78% AFUE" (resources/options/hvac_heating_system.tsv line 9); not a design-load input`,
  cooling: `${BRH} hvac_cooling_system default "Central AC, SEER2 13.4" (resources/options/hvac_cooling_system.tsv line 6); not a design-load input`,
  heatPump: `${BRH} "Central HP, SEER2 13.4, HSPF2 7.0" (resources/options/hvac_heat_pump.tsv line 6); not a design-load input`,
  miniSplit: `${BRH} "Ductless Mini-Split HP, SEER2 13.7, HSPF2 7.4" (resources/options/hvac_heat_pump.tsv line 18); not a design-load input`,
  systemDefault: "quick pass Q10b default: furnace and central AC, the most common existing system in TruFicient's replacement jobs (plan §Era-based defaults); answer Q10b to change it",
  returns: `${DEFAULTS_RB} 2903 to 2904: one return register per conditioned floor`,
  setpoints: `${DEFAULTS_RB} 281 and 286: Manual J indoor design 70 F heating, 75 F cooling`,
  sizing: "ADR-005: the heat-pump sizing policy is an explicit input; ACCA, as in every reference house",
  ductsInside:
    "ducts entirely inside conditioned space leak into the conditioned space, so leakage to outside is 0 until a duct-blaster test says otherwise (OpenStudio-HPXML v1.12.0 airflow.rb 795 to 813 rejects more than 10 cfm25 per 100 ft2, or 12.5 %, to outside for such ducts)",
  ductsSealed: "IECC 2015 R403.3.4 total duct leakage 4 cfm25 per 100 ft2, taken as leakage to outside for ducts the tech reports as sealed (quick-pass map Q10; template slot duct_leakage_sealed when the owner sets it)",
  pierAndBeam: "RhoeFlow plan v2 §Quick pass Q6: pier-and-beam before 1960",
  shielding: `${DEFAULTS_RB} 825 to 828: shielding class 4 (normal) for a detached house`,
  zone: "quick pass: one conditioned zone (block load, ADR-014)",
  ieccYear: "IECC 2021 climate zone designation, as carried by the template region",
  internal: `${DEFAULTS_RB} 309 to 313 ManualJ InternalLoadsSensible 2400 Btu/h, one refrigerator; latent 0`,
  humidity: `${HPXML} default ManualJ HumiditySetpoint 0.5 for a humid climate (IECC 3A)`,
  occupants: `${HPXML} default ManualJ NumberofOccupants = bedrooms + 1`,
} as const;

// ---------------------------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------------------------

export type AnswerStatus = "answered" | "didnt_inspect" | "inspected_cant_tell" | "not_answered";

export interface QuickPassIssue {
  question: QuestionKey | null;
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface QuickPassContext {
  template: Template;
  /** The stored template version (`v<n>`), or null for the repo set (WO-03 C7). */
  template_version: string | null;
  assessment_id: string;
  created_at: string;
  updated_at: string;
  revision?: number;
  workedge: { team_id: string; project_id: string; property_id: string; customer_id?: string };
}

export interface QuickPassResult {
  method: typeof RHOE_QUICK_PASS;
  /** Null when a required answer is missing or an answer is inconsistent (see `issues`). */
  assessment: Assessment | null;
  issues: QuickPassIssue[];
  status: Record<QuestionKey, AnswerStatus>;
  /** Assessment paths each question set, so the app can show the value, state and source behind an answer. */
  fields: Partial<Record<QuestionKey, string[]>>;
}

type Alternative = { value: unknown; state: KnownState; source: string; note?: string | undefined; evidence: string[] };
type AnyAnswer =
  | { value: unknown; state: KnownState; source?: string | undefined; note?: string | undefined; evidence: string[]; alternatives?: Alternative[]; rationale?: string | undefined }
  | { unknown: UnknownReason; note?: string | undefined; evidence: string[] };

/** Alternatives whose value differs from the value in use: these are real conflicts. */
export function conflictsOf(a: unknown): Alternative[] {
  if (!a || typeof a !== "object" || "unknown" in a) return [];
  const g = a as { value: unknown; alternatives?: Alternative[] };
  return (g.alternatives ?? []).filter((x) => JSON.stringify(x.value) !== JSON.stringify(g.value));
}

const show = (v: unknown) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v));

function statusOf(a: AnyAnswer | undefined): AnswerStatus {
  if (a === undefined) return "not_answered";
  return "unknown" in a ? a.unknown : "answered";
}

function isGiven<T>(a: AnyAnswer | undefined): a is { value: T; state: KnownState; source?: string; note?: string; evidence: string[] } {
  return a !== undefined && !("unknown" in a);
}

// ---------------------------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------------------------

const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const az = (x: number) => ((Math.round(x) % 360) + 360) % 360;

export function buildQuickPass(answersInput: QuickPassAnswersInput | QuickPassAnswers, ctx: QuickPassContext): QuickPassResult {
  const answers = QuickPassAnswersSchema.parse(answersInput);
  const issues: QuickPassIssue[] = [];
  const status = Object.fromEntries(QUICK_PASS_QUESTIONS.map((q) => [q.key, statusOf(answers[q.key] as AnyAnswer | undefined)])) as Record<QuestionKey, AnswerStatus>;
  const fields: Partial<Record<QuestionKey, string[]>> = {};
  const t = ctx.template;
  const tid = `template:${t.template_id}${ctx.template_version ? ` ${ctx.template_version}` : ""}`;
  const qnum = (k: QuestionKey) => QUICK_PASS_QUESTIONS.find((q) => q.key === k)!.number;
  const fail = (question: QuestionKey | null, code: string, message: string) => issues.push({ question, severity: "error", code, message });
  const warn = (question: QuestionKey | null, code: string, message: string) => issues.push({ question, severity: "warning", code, message });
  const result = (assessment: Assessment | null): QuickPassResult => ({ method: RHOE_QUICK_PASS, assessment, issues, status, fields });
  const touch = (k: QuestionKey, ...paths: string[]) => {
    (fields[k] ??= []).push(...paths);
  };

  // Field makers.
  const answerSource = (k: QuestionKey, a: { source?: string | undefined }) => a.source ?? `quick pass Q${qnum(k)} (${QUICK_PASS_QUESTIONS.find((q) => q.key === k)!.label}), answered by the tech`;
  const fromAnswer = <T,>(k: QuestionKey, a: { value: unknown; state: KnownState; source?: string | undefined; note?: string | undefined; evidence: string[] }, value: T, unit?: Unit, note?: string) => ({
    value,
    state: a.state,
    source: answerSource(k, a),
    evidence: [...a.evidence],
    ...(note || a.note ? { note: [note, a.note].filter(Boolean).join("; ") } : {}),
    ...(unit ? { unit } : {}),
  });
  const unknownNote = (a: AnyAnswer | undefined) => (a && "unknown" in a ? (a.unknown === "inspected_cant_tell" ? "inspected, could not determine" : "not inspected") : undefined);
  const dflt = <T,>(value: T, source: string, unit?: Unit, note?: string) => ({ value, state: "defaulted" as const, source, evidence: [] as string[], ...(note ? { note } : {}), ...(unit ? { unit } : {}) });
  const derived = <T,>(value: T, source: string, unit?: Unit, note?: string) => ({ value, state: "derived" as const, source, evidence: [] as string[], ...(note ? { note } : {}), ...(unit ? { unit } : {}) });
  const unknownQ = (unit: Unit, a: AnyAnswer | undefined) => ({ value: null, unit, state: "unknown" as const, reason: (a && "unknown" in a ? a.unknown : "didnt_inspect") as UnknownReason, evidence: a ? [...a.evidence] : [] });
  const unknownF = (a: AnyAnswer | undefined) => ({ value: null, state: "unknown" as const, reason: (a && "unknown" in a ? a.unknown : "didnt_inspect") as UnknownReason, evidence: a ? [...a.evidence] : [] });

  // ---- required answers
  const req = <T,>(k: QuestionKey) => {
    const a = answers[k] as AnyAnswer | undefined;
    if (!isGiven<T>(a)) {
      fail(k, "required", `Q${qnum(k)} ${QUICK_PASS_QUESTIONS.find((q) => q.key === k)!.label} is required${a ? " (an unknown cannot stand in for it)" : ""}`);
      return null;
    }
    return a;
  };
  const yearA = req<number>("year_built");
  const areaA = req<number>("floor_area");
  const storiesA = req<number>("stories");
  const garageA = req<{ cars: number; side: "left" | "right" }>("garage");
  const frontA = req<number>("front_azimuth");
  const bedroomsA = req<number>("bedrooms");

  // ---- Q1 station
  const stationA = answers.station_key as AnyAnswer | undefined;
  const stationKey = isGiven<string>(stationA) ? stationA.value : "722590";
  let station: WeatherStation | null = null;
  try {
    station = resolveWeatherStation({ library: WEATHER_LIBRARY.name, version: WEATHER_LIBRARY.version, station_key: stationKey });
  } catch {
    fail("station_key", "unsupported_station", `station ${stationKey} is not in ${WEATHER_LIBRARY.name}@${WEATHER_LIBRARY.version}; this order covers DFW 722590 only`);
  }

  issues.push(...checkQuickPassAnswers(answers));
  if (!yearA || !areaA || !storiesA || !garageA || !frontA || !bedroomsA || !station || issues.some((i) => i.severity === "error")) return result(null);

  const year = yearA.value;
  const cfa = areaA.value;
  const n = storiesA.value;
  const front = az(frontA.value);
  const cars = garageA.value.cars;
  const garageSide = garageA.value.side;

  // ---- Q4 ceiling height
  const hA = answers.ceiling_height as AnyAnswer | undefined;
  const hSlot = t.defaults.average_ceiling_height;
  const h = isGiven<number>(hA) ? hA.value : (hSlot?.value ?? 8);
  const heightField = isGiven<number>(hA)
    ? fromAnswer("ceiling_height", hA, h, "ft")
    : dflt(h, hSlot ? `${tid} average_ceiling_height. ${hSlot.basis}` : QUICK_PASS_SOURCES.ceilingHeight, "ft", unknownNote(hA));

  // ---- Q3a / Q3b garage and bonus room
  const GARAGE_WIDTH: Record<number, number> = { 0: 0, 1: 12, 2: 21, 3: 30 };
  const gw = GARAGE_WIDTH[cars]!;
  const gd = cars > 0 ? 20 : 0;
  const bonusA = answers.room_over_garage as AnyAnswer | undefined;
  const bonus = isGiven<boolean>(bonusA) && bonusA.value === true;
  if (bonus && (n < 2 || cars === 0)) {
    fail("room_over_garage", "room_over_garage_needs_two_stories_and_garage", "a room over the garage needs a two-story house with an attached garage");
    return result(null);
  }
  const bonusArea = bonus ? gw * gd : 0;

  // ---- box geometry (map §2)
  const footprint = (cfa - bonusArea) / n;
  if (!(footprint > 0)) {
    fail("floor_area", "floor_area_too_small", `floor area ${cfa} ft2 leaves no footprint once the ${bonusArea} ft2 room over the garage is taken out`);
    return result(null);
  }
  const L = Math.sqrt(2 * footprint);
  const W = footprint / L;
  const shared = cars > 0 ? Math.min(gd, W) : 0;
  if (cars > 0 && gd > W) warn("garage", "garage_deeper_than_house", `the garage is ${gd} ft deep but the house side is only ${round(W)} ft; the shared wall is limited to ${round(W)} ft`);
  const AZ = { front, back: az(front + 180), left: az(front + 90), right: az(front + 270) };
  const garageAz = garageSide === "left" ? AZ.left : AZ.right;
  const geo = `${M}: box of ${round(footprint)} ft2 per floor, ${round(L)} x ${round(W)} ft (${QUICK_PASS_SOURCES.aspect}), ${n} ${n === 1 ? "story" : "stories"} of ${h} ft`;

  // ---- Q6 foundation
  const fA = answers.foundation as AnyAnswer | undefined;
  let crawl: boolean;
  let foundationField;
  if (isGiven<"slab" | "crawlspace">(fA)) {
    crawl = fA.value === "crawlspace";
    foundationField = fromAnswer("foundation", fA, crawl ? ("vented crawlspace" as const) : ("slab-on-grade" as const));
  } else if (year < 1960) {
    crawl = true;
    foundationField = dflt("vented crawlspace" as const, QUICK_PASS_SOURCES.pierAndBeam, undefined, unknownNote(fA));
  } else {
    const tf = t.style.foundation;
    if (tf !== "slab-on-grade" && tf !== "vented crawlspace") {
      fail("foundation", "unsupported_foundation", `template foundation "${tf}" is not one the quick pass builds; answer Q6`);
      return result(null);
    }
    crawl = tf === "vented crawlspace";
    foundationField = dflt(tf, `${tid} style.foundation`, undefined, unknownNote(fA));
  }
  touch("foundation", "building.enclosure.foundations[0].foundation_type");

  // ---- attic type from the template
  if (t.style.attic === "conditioned") {
    fail(null, "unsupported_attic", `template ${t.template_id} has a conditioned attic, which the quick pass does not build`);
    return result(null);
  }
  const atticLoc = t.style.attic === "vented" ? ("attic - vented" as const) : ("attic - unvented" as const);

  // ---- Q10b system and Q10 ducts
  const sysA = answers.system as AnyAnswer | undefined;
  const system = isGiven<"furnace_ac" | "heat_pump" | "ductless">(sysA) ? sysA.value : "furnace_ac";
  const ducted = system !== "ductless";
  const dlA = answers.duct_location as AnyAnswer | undefined;
  const ductChoice = isGiven<"attic" | "conditioned" | "garage" | "crawlspace">(dlA) ? dlA.value : "attic";
  if (ducted && ductChoice === "garage" && cars === 0) {
    fail("duct_location", "ducts_in_missing_garage", "ducts are in the garage but Q3a says there is no garage");
    return result(null);
  }
  if (ducted && ductChoice === "crawlspace" && !crawl) {
    fail("duct_location", "ducts_in_missing_crawlspace", "ducts are in a crawlspace but the house is on a slab");
    return result(null);
  }
  const DUCT_LOC = { attic: atticLoc, conditioned: "conditioned space", garage: "garage", crawlspace: "crawlspace - vented" } as const;
  const ductLoc = DUCT_LOC[ductChoice];

  // ---- walls
  const wallBase = (id: string, ext: "outside" | "garage", int: "conditioned space" | "garage", azimuth: number, area: number, areaSource: string) => ({
    id,
    exterior_adjacent_to: derived(ext, `${M}: box model`),
    interior_adjacent_to: derived(int, `${M}: box model`),
    wall_type: dflt("wood stud" as const, QUICK_PASS_SOURCES.wallType),
    area: derived(round(area), areaSource, "ft2"),
    azimuth: derived(azimuth, `${M}: front faces ${front} degrees (Q5)`, "degrees"),
    siding: ext === "garage" ? dflt("none" as const, `${M}: wall between the house and the garage has no cladding`) : dflt("brick veneer" as const, `${tid} style.typical_cladding "${t.style.typical_cladding}"`),
    solar_absorptance: dflt(0.7, QUICK_PASS_SOURCES.wallColor, "fraction"),
    emittance: dflt(0.9, QUICK_PASS_SOURCES.emittance, "fraction"),
    insulation_assembly_r_value: unknownQ("h-ft2-F/Btu", undefined),
    insulation_cavity_r_value: unknownQ("h-ft2-F/Btu", undefined),
    ...(t.defaults.wall_insulation_continuous_r ? { insulation_continuous_r_value: unknownQ("h-ft2-F/Btu", undefined) } : {}),
  });
  const sideArea = (side: "left" | "right") => {
    let a = W * h * n;
    let note = `${round(W)} ft x ${h} ft x ${n}`;
    if (cars > 0 && side === garageSide) {
      a -= shared * h * (bonus ? 2 : 1);
      note += ` less ${round(shared)} ft x ${h} ft against the garage${bonus ? " and the room over it" : ""}`;
    }
    return { a, note };
  };
  const left = sideArea("left");
  const right = sideArea("right");
  const walls: Record<string, unknown>[] = [
    wallBase("wall-front", "outside", "conditioned space", AZ.front, L * h * n, `${geo}; front wall ${round(L)} ft x ${h} ft x ${n}`),
    wallBase("wall-back", "outside", "conditioned space", AZ.back, L * h * n, `${geo}; back wall ${round(L)} ft x ${h} ft x ${n}`),
    wallBase("wall-left", "outside", "conditioned space", AZ.left, left.a, `${geo}; left wall ${left.note}`),
    wallBase("wall-right", "outside", "conditioned space", AZ.right, right.a, `${geo}; right wall ${right.note}`),
  ];
  const garageArea = gw * gd;
  if (cars > 0) {
    const gsrc = `${M}: ${cars}-car garage ${gw} x ${gd} ft on the ${garageSide} (${QUICK_PASS_SOURCES.garageSize}), front flush with the house`;
    walls.push(wallBase("wall-garage", "garage", "conditioned space", garageAz, shared * h, `${gsrc}; shared wall ${round(shared)} ft x ${h} ft`));
    const gwall = (id: string, azimuth: number, len: number) => ({
      ...wallBase(id, "outside", "garage", azimuth, len * h, `${gsrc}; ${round(len)} ft x ${h} ft`),
      insulation_cavity_r_value: dflt(0, QUICK_PASS_SOURCES.garageWalls, "h-ft2-F/Btu"),
      ...(t.defaults.wall_insulation_continuous_r ? { insulation_continuous_r_value: dflt(0, QUICK_PASS_SOURCES.garageWalls, "h-ft2-F/Btu") } : {}),
    });
    walls.push(gwall("garage-wall-front", AZ.front, gw), gwall("garage-wall-back", AZ.back, gw), gwall("garage-wall-side", garageAz, gd));
    if (bonus) {
      const bsrc = `${M}: room over the garage, ${gw} x ${gd} ft (Q3b)`;
      walls.push(
        wallBase("bonus-wall-front", "outside", "conditioned space", AZ.front, gw * h, `${bsrc}; ${gw} ft x ${h} ft`),
        wallBase("bonus-wall-back", "outside", "conditioned space", AZ.back, gw * h, `${bsrc}; ${gw} ft x ${h} ft`),
        wallBase("bonus-wall-side", "outside", "conditioned space", garageAz, gd * h, `${bsrc}; ${gd} ft x ${h} ft`),
      );
    }
  }
  touch("floor_area", "building.building_construction.conditioned_floor_area");
  touch("stories", "building.building_construction.number_of_conditioned_floors");
  touch("front_azimuth", "building.site.azimuth_of_front_of_home");
  if (cars > 0) touch("garage", `building.enclosure.walls[${walls.findIndex((w) => w["id"] === "wall-garage")}].area`);

  // ---- Q7 / Q8 windows
  const waA = answers.window_amount as AnyAnswer | undefined;
  const fracSlot = t.defaults.window_area_fraction;
  let totalWindow: number;
  let windowSource: string;
  let windowState: KnownState = "derived";
  let windowEvidence: string[] = [];
  if (isGiven<"light" | "typical" | "lots" | { total_area_ft2: number }>(waA) && typeof waA.value === "object") {
    totalWindow = waA.value.total_area_ft2;
    windowSource = `${answerSource("window_amount", waA)}: total ${totalWindow} ft2; ${QUICK_PASS_SOURCES.windowSplit}`;
    windowState = waA.state;
    windowEvidence = [...waA.evidence];
  } else {
    const choice = isGiven<"light" | "typical" | "lots">(waA) ? waA.value : "typical";
    const frac = choice === "typical" && fracSlot ? fracSlot.value : WINDOW_FRACTIONS[choice];
    const fracSource = choice === "typical" ? (fracSlot ? `${tid} window_area_fraction. ${fracSlot.basis}` : QUICK_PASS_SOURCES.windowTypical) : QUICK_PASS_SOURCES.windowLightLots;
    totalWindow = frac * cfa;
    windowSource = `${M}: ${choice} glazing = ${frac} x ${cfa} ft2 (${isGiven(waA) ? `Q7 answered "${choice}"` : `Q7 ${statusOf(waA) === "not_answered" ? "not answered" : statusOf(waA).replace(/_/g, " ")}, typical used`}; ${fracSource}); ${QUICK_PASS_SOURCES.windowSplit}`;
  }
  const perSide = totalWindow / 4;
  const wtA = answers.window_type as AnyAnswer | undefined;
  const windowFields = (): { ufactor: unknown; shgc: unknown } => {
    if (isGiven<WindowType | { ufactor: number; shgc: number }>(wtA)) {
      if (typeof wtA.value === "object") return { ufactor: fromAnswer("window_type", wtA, wtA.value.ufactor, "Btu/h-ft2-F"), shgc: fromAnswer("window_type", wtA, wtA.value.shgc, "fraction") };
      const row = WINDOW_TYPES[wtA.value];
      const src = `${answerSource("window_type", wtA)}: "${row.label}", values from the Home Energy Score window table, ${DEFAULTS_RB} ${row.line}`;
      return {
        ufactor: { value: row.ufactor, unit: "Btu/h-ft2-F", state: wtA.state, source: src, evidence: [...wtA.evidence] },
        shgc: { value: row.shgc, unit: "fraction", state: wtA.state, source: src, evidence: [...wtA.evidence] },
      };
    }
    return { ufactor: unknownQ("Btu/h-ft2-F", wtA), shgc: unknownQ("fraction", wtA) };
  };
  // Each orientation's quarter goes on the conditioned exterior walls facing that way, in
  // proportion to their area (a garage side keeps its share on the room over the garage).
  const windows: Record<string, unknown>[] = [];
  for (const side of ["front", "back", "left", "right"] as const) {
    const facing = walls.filter(
      (w) =>
        (w["exterior_adjacent_to"] as { value: string }).value === "outside" &&
        (w["interior_adjacent_to"] as { value: string }).value === "conditioned space" &&
        (w["azimuth"] as { value: number }).value === AZ[side],
    );
    const total = facing.reduce((sum, w) => sum + (w["area"] as { value: number }).value, 0);
    facing.forEach((w, i) => {
      const wallArea = (w["area"] as { value: number }).value;
      const share = facing.length === 1 ? perSide : (perSide * wallArea) / total;
      windows.push({
        id: i === 0 ? `win-${side}` : `win-${side}-${i + 1}`,
        attached_to_wall: w["id"] as string,
        area: {
          value: round(share),
          unit: "ft2" as const,
          state: windowState,
          source: facing.length === 1 ? windowSource : `${windowSource}; the ${side} quarter split over ${facing.length} walls by area`,
          evidence: windowEvidence,
        },
        azimuth: derived(AZ[side], `${M}: on the ${side} side`, "degrees"),
        ...windowFields(),
        interior_shading: dflt("light curtains" as const, QUICK_PASS_SOURCES.shading),
        interior_shading_summer_coverage: dflt(0.5, QUICK_PASS_SOURCES.shading, "fraction"),
      });
    });
  }
  touch("window_amount", ...windows.map((_, i) => `building.enclosure.windows[${i}].area`));
  touch("window_type", "building.enclosure.windows[0].ufactor", "building.enclosure.windows[0].shgc");

  // ---- Q9 ceilings and roof
  const aiA = answers.attic_insulation as AnyAnswer | undefined;
  const ceilingCavity = (): unknown => {
    if (!isGiven<"none" | "some" | "modern" | "upgraded" | { nominal_r: number } | { depth_in: number; material: keyof typeof R_PER_INCH }>(aiA)) return unknownQ("h-ft2-F/Btu", aiA);
    const v = aiA.value;
    if (typeof v === "string") return fromAnswer("attic_insulation", aiA, ATTIC_CHOICES[v], "h-ft2-F/Btu", `"${v}" = nominal R-${ATTIC_CHOICES[v]} (BRH resources/options/enclosure_ceiling.tsv steps, quick-pass map Q9)`);
    if ("nominal_r" in v) return fromAnswer("attic_insulation", aiA, v.nominal_r, "h-ft2-F/Btu");
    const r = round(v.depth_in * R_PER_INCH[v.material]);
    return derived(r, `${M}: measured depth ${v.depth_in} in (${answerSource("attic_insulation", aiA)}, ${aiA.state}) x R-${R_PER_INCH[v.material]} per inch for ${v.material.replace(/_/g, " ")} (BUILDER PLACEHOLDER factor, the owner confirms)`, "h-ft2-F/Btu");
  };
  const ceiling = (id: string, int: "conditioned space" | "garage", area: number, areaSource: string) => ({
    id,
    exterior_adjacent_to: derived(atticLoc, `${tid} style.attic "${t.style.attic}"`),
    interior_adjacent_to: derived(int, `${M}: box model`),
    floor_or_ceiling: derived("ceiling" as const, `${M}: attic floor`),
    floor_type: dflt("wood frame" as const, QUICK_PASS_SOURCES.wallType),
    area: derived(round(area), areaSource, "ft2"),
    insulation_assembly_r_value: unknownQ("h-ft2-F/Btu", undefined),
    insulation_cavity_r_value: int === "garage" ? dflt(0, QUICK_PASS_SOURCES.garageCeiling, "h-ft2-F/Btu") : ceilingCavity(),
  });
  const floors: Record<string, unknown>[] = [ceiling("ceiling-main", "conditioned space", footprint, `${geo}; top-floor ceiling = footprint`)];
  if (bonus) floors.push(ceiling("ceiling-bonus", "conditioned space", bonusArea, `${M}: room over the garage ${gw} x ${gd} ft`));
  else if (cars > 0) floors.push(ceiling("ceiling-garage", "garage", garageArea, `${M}: garage ${gw} x ${gd} ft under the attic`));
  touch("attic_insulation", "building.enclosure.floors[0].insulation_cavity_r_value", "building.enclosure.floors[0].insulation_assembly_r_value");
  if (bonus) {
    const newer = year >= 2001;
    floors.push({
      id: "floor-over-garage",
      exterior_adjacent_to: derived("garage" as const, `${M}: room over the garage (Q3b)`),
      interior_adjacent_to: derived("conditioned space" as const, `${M}: room over the garage (Q3b)`),
      floor_or_ceiling: derived("floor" as const, `${M}: room over the garage (Q3b)`),
      floor_type: dflt("wood frame" as const, QUICK_PASS_SOURCES.wallType),
      area: derived(round(bonusArea), `${M}: ${gw} x ${gd} ft`, "ft2"),
      insulation_assembly_r_value: dflt(newer ? 21 : 3.7, newer ? QUICK_PASS_SOURCES.floorOverGarageNew : QUICK_PASS_SOURCES.floorOverGarageOld, "h-ft2-F/Btu"),
    });
    touch("room_over_garage", `building.enclosure.floors[${floors.length - 1}].area`);
  }
  const atticFloorArea = footprint + (cars > 0 ? garageArea : 0);
  const slope = Math.sqrt(1 + (6 / 12) ** 2);
  const rb = t.defaults.roof_radiant_barrier;
  const roof = {
    id: "roof-1",
    interior_adjacent_to: derived(atticLoc, `${tid} style.attic "${t.style.attic}"`),
    area: derived(round(atticFloorArea * slope), `${M}: attic floor ${round(atticFloorArea)} ft2 x ${round(slope, 4)} for a 6:12 pitch (${QUICK_PASS_SOURCES.roof})`, "ft2"),
    roof_type: dflt("asphalt or fiberglass shingles" as const, QUICK_PASS_SOURCES.roof),
    solar_absorptance: dflt(0.85, QUICK_PASS_SOURCES.roofColor, "fraction"),
    emittance: dflt(0.9, QUICK_PASS_SOURCES.emittance, "fraction"),
    pitch: dflt(6, QUICK_PASS_SOURCES.roof, "in:12"),
    radiant_barrier: rb ? unknownF(undefined) : dflt(false, QUICK_PASS_SOURCES.radiantBarrierNone),
    insulation_assembly_r_value: dflt(2.3, QUICK_PASS_SOURCES.roofR, "h-ft2-F/Btu"),
  };

  // ---- slabs, crawlspace
  const slabs: Record<string, unknown>[] = [];
  const foundationWalls: Record<string, unknown>[] = [];
  const perimeter = 2 * (L + W) - shared;
  const perimeterSource = `${geo}; exposed perimeter 2 x (${round(L)} + ${round(W)}) ft${shared > 0 ? ` less ${round(shared)} ft against the garage` : ""}`;
  if (!crawl) {
    slabs.push({
      id: "slab-main",
      interior_adjacent_to: derived("conditioned space" as const, `${M}: slab-on-grade`),
      area: derived(round(footprint), `${geo}; slab = footprint`, "ft2"),
      thickness: dflt(4, QUICK_PASS_SOURCES.slab, "in"),
      exposed_perimeter: derived(round(perimeter), perimeterSource, "ft"),
      perimeter_insulation_r_value: dflt(0, QUICK_PASS_SOURCES.slab, "h-ft2-F/Btu"),
      perimeter_insulation_depth: dflt(0, QUICK_PASS_SOURCES.slab, "ft"),
      under_slab_insulation_r_value: dflt(0, QUICK_PASS_SOURCES.slab, "h-ft2-F/Btu"),
      carpet_fraction: dflt(0.8, QUICK_PASS_SOURCES.carpet, "fraction"),
      carpet_r_value: dflt(2, QUICK_PASS_SOURCES.carpet, "h-ft2-F/Btu"),
    });
  } else {
    floors.push({
      id: "floor-crawl",
      exterior_adjacent_to: derived("crawlspace - vented" as const, `${M}: pier and beam over a vented crawlspace`),
      interior_adjacent_to: derived("conditioned space" as const, `${M}: pier and beam over a vented crawlspace`),
      floor_or_ceiling: derived("floor" as const, `${M}: floor over the crawlspace`),
      floor_type: dflt("wood frame" as const, QUICK_PASS_SOURCES.wallType),
      area: derived(round(footprint), `${geo}; floor = footprint`, "ft2"),
      insulation_assembly_r_value: dflt(3.7, QUICK_PASS_SOURCES.crawlFloor, "h-ft2-F/Btu"),
    });
    const skirt = (id: string, azimuth: number, len: number) => ({
      id,
      exterior_adjacent_to: dflt("ground" as const, QUICK_PASS_SOURCES.crawlSkirt),
      interior_adjacent_to: derived("crawlspace - vented" as const, `${M}: crawlspace perimeter`),
      type: dflt("double brick" as const, QUICK_PASS_SOURCES.crawlSkirt),
      height: dflt(2.5, QUICK_PASS_SOURCES.crawlSkirt, "ft"),
      area: derived(round(len * 2.5), `${geo}; ${round(len)} ft x 2.5 ft skirt`, "ft2"),
      azimuth: derived(azimuth, `${M}: box model`, "degrees"),
      thickness: dflt(8, QUICK_PASS_SOURCES.crawlSkirt, "in"),
      depth_below_grade: dflt(0.5, QUICK_PASS_SOURCES.crawlSkirt, "ft"),
      insulation_assembly_r_value: dflt(2.2, QUICK_PASS_SOURCES.crawlSkirt, "h-ft2-F/Btu"),
    });
    foundationWalls.push(skirt("fw-front", AZ.front, L), skirt("fw-back", AZ.back, L), skirt("fw-left", AZ.left, W), skirt("fw-right", AZ.right, W));
    slabs.push({
      id: "slab-crawl",
      interior_adjacent_to: derived("crawlspace - vented" as const, `${M}: crawlspace floor`),
      area: derived(round(footprint), `${geo}; crawlspace floor = footprint`, "ft2"),
      thickness: dflt(0, `${DEFAULTS_RB} 1554: crawlspace floor thickness 0 (dirt)`, "in"),
      exposed_perimeter: derived(round(2 * (L + W)), `${geo}; perimeter 2 x (${round(L)} + ${round(W)}) ft`, "ft"),
      perimeter_insulation_r_value: dflt(0, QUICK_PASS_SOURCES.slab, "h-ft2-F/Btu"),
      perimeter_insulation_depth: dflt(0, QUICK_PASS_SOURCES.slab, "ft"),
      under_slab_insulation_r_value: dflt(0, QUICK_PASS_SOURCES.slab, "h-ft2-F/Btu"),
      carpet_fraction: dflt(0, `${DEFAULTS_RB} 1563 to 1567: no carpet outside conditioned space`, "fraction"),
      carpet_r_value: dflt(0, `${DEFAULTS_RB} 1563 to 1567: no carpet outside conditioned space`, "h-ft2-F/Btu"),
    });
  }
  if (cars > 0) {
    slabs.push({
      id: "slab-garage",
      interior_adjacent_to: derived("garage" as const, `${M}: garage on slab`),
      area: derived(round(garageArea), `${M}: garage ${gw} x ${gd} ft`, "ft2"),
      thickness: dflt(4, QUICK_PASS_SOURCES.garageSlab, "in"),
      exposed_perimeter: derived(round(2 * gw + gd), `${M}: garage front, back and outer side ${gw} + ${gw} + ${gd} ft`, "ft"),
      perimeter_insulation_r_value: dflt(0, QUICK_PASS_SOURCES.slab, "h-ft2-F/Btu"),
      perimeter_insulation_depth: dflt(0, QUICK_PASS_SOURCES.slab, "ft"),
      under_slab_insulation_r_value: dflt(0, QUICK_PASS_SOURCES.slab, "h-ft2-F/Btu"),
      carpet_fraction: dflt(0, QUICK_PASS_SOURCES.garageSlab, "fraction"),
      carpet_r_value: dflt(0, QUICK_PASS_SOURCES.garageSlab, "h-ft2-F/Btu"),
    });
  }

  // ---- Q11 air leakage (placeholder until the ResDB step below)
  const tA = answers.tightness as AnyAnswer | undefined;
  let leakiness: LeakinessDescription | null = null;
  let airLeakage: unknown;
  if (isGiven<"leaky" | "average" | "tight" | { ach50: number } | { cfm50: number }>(tA) && typeof tA.value === "object") {
    airLeakage = "ach50" in tA.value ? fromAnswer("tightness", tA, tA.value.ach50, "ACH50", "blower-door result") : fromAnswer("tightness", tA, tA.value.cfm50, "cfm50", "blower-door result");
  } else {
    leakiness = isGiven<LeakinessDescription>(tA) ? (tA.value as LeakinessDescription) : "average";
    airLeakage = derived(0, "placeholder replaced by RHOE.infiltration.resdb_ach50 below", "ACH50");
  }
  touch("tightness", "building.enclosure.air_infiltration.air_leakage");

  // ---- Q10 ducts and their leakage
  const dsA = answers.ducts_sealed as AnyAnswer | undefined;
  const leakSlot = t.defaults.duct_leakage_to_outside;
  const sealedSlot = t.defaults.duct_leakage_sealed;
  type Leak = { unit: "cfm25" | "fraction"; supply: unknown; ret: unknown };
  const split = (total: number, unit: "cfm25" | "fraction", mk: (v: number, share: string) => unknown): Leak => ({
    unit,
    supply: mk(round((total * 2) / 3, 4), "supply share 2/3"),
    ret: mk(round(total / 3, 4), "return share 1/3"),
  });
  const rateToCfm25 = (rate: number) => (rate * cfa) / 100;
  let leak: Leak;
  if (isGiven<boolean | { leakage_to_outside_cfm25: number }>(dsA) && typeof dsA.value === "object") {
    const total = dsA.value.leakage_to_outside_cfm25;
    leak = split(total, "cfm25", (v, share) => fromAnswer("ducts_sealed", dsA, v, "cfm25", `duct-blaster total ${total} cfm25 to outside, ${share} (WO-02 A2)`));
  } else if (ductChoice === "conditioned") {
    leak = split(0, "cfm25", (v, share) => derived(v, `${M}: Q10 ducts in conditioned space, ${share}. ${QUICK_PASS_SOURCES.ductsInside}`, "cfm25", unknownNote(dsA)));
  } else if (isGiven<boolean>(dsA) && dsA.value === true) {
    if (sealedSlot && sealedSlot.unit === "fraction") {
      leak = split(sealedSlot.value, "fraction", (v, share) => derived(v, `${tid} duct_leakage_sealed ${sealedSlot.value} (${sealedSlot.basis}), ${share}; Q10 answered sealed`, "fraction"));
    } else {
      const rate = sealedSlot?.value ?? 4;
      const total = rateToCfm25(rate);
      const src = sealedSlot ? `${tid} duct_leakage_sealed ${rate} cfm25 per 100 ft2. ${sealedSlot.basis}` : QUICK_PASS_SOURCES.ductsSealed;
      leak = split(total, "cfm25", (v, share) => derived(v, `${M}: Q10 answered sealed; ${rate} cfm25 per 100 ft2 x ${cfa} ft2 / 100 = ${round(total, 2)} cfm25, ${share} (${src})`, "cfm25"));
    }
  } else {
    if (!leakSlot) {
      fail("ducts_sealed", "template_has_no_duct_leakage", `template ${t.template_id} has no duct leakage; answer Q10 with a duct-blaster number`);
      return result(null);
    }
    if (leakSlot.unit === "cfm25/100ft2") {
      const total = rateToCfm25(leakSlot.value);
      leak = split(total, "cfm25", (v, share) => derived(v, `${M}: ${tid} duct leakage ${leakSlot.value} cfm25 per 100 ft2 x ${cfa} ft2 / 100 = ${round(total, 2)} cfm25 to outside, ${share} (WO-02 A2). ${leakSlot.basis}`, "cfm25", unknownNote(dsA)));
    } else if (leakSlot.unit === "fraction" || leakSlot.unit === "cfm25") {
      // The applier writes the template value and its split (WO-02 A2).
      leak = { unit: leakSlot.unit, supply: unknownQ(leakSlot.unit, dsA), ret: unknownQ(leakSlot.unit, dsA) };
    } else {
      fail("ducts_sealed", "unsupported_duct_leakage_unit", `template duct leakage unit ${leakSlot.unit} is not one the quick pass converts`);
      return result(null);
    }
  }
  const ductLocField = isGiven(dlA) ? fromAnswer("duct_location", dlA, ductLoc) : dflt(ductLoc, `quick pass Q10 default: ducts in the attic (RhoeFlow plan v2 §Quick pass Q10)`, undefined, unknownNote(dlA));
  const distribution = {
    id: "dist-1",
    distribution_system_type: derived("AirDistribution" as const, `${M}: ducted system (Q10b)`),
    air_distribution_type: dflt("regular velocity" as const, `${HPXML} default AirDistributionType for a central ducted system`),
    conditioned_floor_area_served: derived(cfa, `${M}: one system serves the whole floor area`, "ft2"),
    number_of_return_registers: derived(n, QUICK_PASS_SOURCES.returns, "count"),
    duct_leakage_measurements: [
      { duct_type: derived("supply" as const, `${M}: supply measurement`), value: leak.supply, total_or_to_outside: derived("to outside" as const, `${M}: leakage to outside (WO-02 A2)`) },
      { duct_type: derived("return" as const, `${M}: return measurement`), value: leak.ret, total_or_to_outside: derived("to outside" as const, `${M}: leakage to outside (WO-02 A2)`) },
    ],
    ducts: (["supply", "return"] as const).map((k) => ({
      id: `duct-${k}`,
      duct_type: derived(k, `${M}: ${k} ducts`),
      duct_insulation_r_value: unknownQ("h-ft2-F/Btu", undefined),
      duct_location: ductLocField,
      duct_fraction_area: derived(1, `${M}: all ${k} duct area in one location (Q10)`, "fraction"),
    })),
  };
  if (ducted) touch("duct_location", "building.systems.hvac.hvac_distributions[0].ducts[0].duct_location");
  if (ducted) touch("ducts_sealed", "building.systems.hvac.hvac_distributions[0].duct_leakage_measurements[0].value", "building.systems.hvac.hvac_distributions[0].duct_leakage_measurements[1].value");

  const sysSource = isGiven(sysA) ? answerSource("system", sysA) : QUICK_PASS_SOURCES.systemDefault;
  const served = (k: string) => derived(1, `${M}: one system serves the whole house (${k})`, "fraction");
  const hvacSystems = (() => {
    if (system === "furnace_ac") {
      return {
        heating_systems: [
          {
            id: "heat-1",
            heating_system_type: dflt("Furnace" as const, `${sysSource}; ${QUICK_PASS_SOURCES.heating}`),
            heating_system_fuel: dflt("natural gas" as const, `${sysSource}; ${QUICK_PASS_SOURCES.heating}`),
            annual_heating_efficiency: dflt(0.78, QUICK_PASS_SOURCES.heating, "AFUE"),
            fraction_heat_load_served: served("heating"),
            distribution_system: "dist-1",
            x_served_zone_ids: ["zone-main"],
          },
        ],
        cooling_systems: [
          {
            id: "cool-1",
            cooling_system_type: dflt("central air conditioner" as const, `${sysSource}; ${QUICK_PASS_SOURCES.cooling}`),
            cooling_system_fuel: dflt("electricity" as const, QUICK_PASS_SOURCES.cooling),
            compressor_type: dflt("single stage" as const, QUICK_PASS_SOURCES.cooling),
            annual_cooling_efficiency: dflt(13.4, QUICK_PASS_SOURCES.cooling, "SEER2"),
            fraction_cool_load_served: served("cooling"),
            distribution_system: "dist-1",
            x_served_zone_ids: ["zone-main"],
          },
        ],
        heat_pumps: [],
      };
    }
    const mini = system === "ductless";
    const src = mini ? QUICK_PASS_SOURCES.miniSplit : QUICK_PASS_SOURCES.heatPump;
    return {
      heating_systems: [],
      cooling_systems: [],
      heat_pumps: [
        {
          id: "hp-1",
          heat_pump_type: dflt(mini ? ("mini-split" as const) : ("air-to-air" as const), `${sysSource}; ${src}`),
          heat_pump_fuel: dflt("electricity" as const, src),
          compressor_type: dflt(mini ? ("variable speed" as const) : ("single stage" as const), src),
          annual_cooling_efficiency: dflt(mini ? 13.7 : 13.4, src, "SEER2"),
          annual_heating_efficiency: dflt(mini ? 7.4 : 7.0, src, "HSPF2"),
          fraction_heat_load_served: served("heating"),
          fraction_cool_load_served: served("cooling"),
          ...(mini ? {} : { distribution_system: "dist-1" }),
          x_served_zone_ids: ["zone-main"],
        },
      ],
    };
  })();
  touch("system", system === "furnace_ac" ? "building.systems.hvac.heating_systems[0].heating_system_type" : "building.systems.hvac.heat_pumps[0].heat_pump_type");

  // ---- the rest of the Assessment
  const W_SRC = `weather: ${WEATHER_LIBRARY.name} ${WEATHER_LIBRARY.version}, station ${station.stationKey} (${station.name}), EPW header design block '${station.designConditionsTitle}' (ADR-034)`;
  const rangeClass = station.dailyRangeF < 16 ? "low" : station.dailyRangeF <= 25 ? "medium" : "high";
  const bedrooms = bedroomsA.value;
  const input: AssessmentInput = {
    schema_version: "0.1.0",
    assessment_id: ctx.assessment_id,
    revision: ctx.revision ?? 0,
    created_at: ctx.created_at,
    updated_at: ctx.updated_at,
    workedge: { ...ctx.workedge },
    template_id: t.template_id,
    ...(ctx.template_version ? { template_version: ctx.template_version } : {}),
    building: {
      hpxml_version: "4.0",
      site: {
        azimuth_of_front_of_home: fromAnswer("front_azimuth", frontA, front, "degrees"),
        shielding_of_home: dflt("normal" as const, QUICK_PASS_SOURCES.shielding),
        site_type: dflt("suburban" as const, `${DEFAULTS_RB} 817 to 820 SiteType suburban`, undefined, "drives the Manual J infiltration shielding class with shielding_of_home"),
        soil_type: dflt("unknown" as const, `${HPXML} default SoilType (unknown)`, undefined, "inspect or look up the NRCS soil survey to replace"),
        moisture_type: dflt("mixed" as const, `${HPXML} default MoistureType (mixed)`),
      },
      building_construction: {
        year_built: fromAnswer("year_built", yearA, year, "year"),
        residential_facility_type: dflt("single-family detached" as const, QUICK_PASS_SOURCES.facility),
        number_of_conditioned_floors: fromAnswer("stories", storiesA, n, "count"),
        number_of_conditioned_floors_above_grade: fromAnswer("stories", storiesA, n, "count"),
        number_of_bedrooms: fromAnswer("bedrooms", bedroomsA, bedrooms, "count"),
        conditioned_floor_area: fromAnswer("floor_area", areaA, cfa, "ft2"),
        average_ceiling_height: heightField,
        conditioned_building_volume: derived(round(cfa * h), `${M}: ${cfa} ft2 x ${h} ft`, "ft3"),
      },
      climate_and_risk_zones: {
        iecc_climate_zone: dflt(t.region.iecc_climate_zone, `${tid} region.iecc_climate_zone`),
        iecc_year: dflt(2021, QUICK_PASS_SOURCES.ieccYear, "year"),
        weather_station: {
          id: "ws-1",
          name: isGiven(stationA) ? fromAnswer("station_key", stationA, station.name) : dflt(station.name, QUICK_PASS_SOURCES.station),
          station_key: isGiven(stationA) ? fromAnswer("station_key", stationA, station.stationKey) : dflt(station.stationKey, QUICK_PASS_SOURCES.station),
        },
      },
      zones: [{ id: "zone-main", zone_type: dflt("conditioned" as const, QUICK_PASS_SOURCES.zone), spaces: [] }],
      enclosure: {
        air_infiltration: { id: "infil-1", house_pressure: dflt(50, `${M}: blower-door test pressure for ACH50 / CFM50`, "Pa"), air_leakage: airLeakage },
        attics: [{ id: "attic-1", attic_type: dflt(t.style.attic, `${tid} style.attic`) }],
        foundations: [
          {
            id: "found-1",
            foundation_type: foundationField,
            ...(crawl ? { vented_crawlspace_sla: dflt(0.006667, QUICK_PASS_SOURCES.crawlSla, "fraction") } : {}),
          },
        ],
        foundation_walls: foundationWalls,
        roofs: [roof],
        walls,
        floors,
        slabs,
        windows,
        doors: [{ id: "door-front", attached_to_wall: "wall-front", area: dflt(20, QUICK_PASS_SOURCES.door, "ft2"), azimuth: derived(AZ.front, `${M}: front door`, "degrees"), r_value: dflt(2, QUICK_PASS_SOURCES.door, "h-ft2-F/Btu") }],
      },
      systems: {
        hvac: {
          ...hvacSystems,
          hvac_control: { id: "ctrl-1", heating_setpoint: dflt(70, QUICK_PASS_SOURCES.setpoints, "F"), cooling_setpoint: dflt(75, QUICK_PASS_SOURCES.setpoints, "F") },
          hvac_distributions: ducted ? [distribution] : [],
          hvac_sizing_control: {
            heat_pump_sizing_methodology: dflt("ACCA" as const, QUICK_PASS_SOURCES.sizing),
            allow_increased_fixed_capacities: dflt(false, "ADR-005: no silent capacity increase"),
            manualj_inputs: {
              heating_design_temperature: dflt(station.heatingDb99F, `${W_SRC}: heating 99 % dry bulb`, "F"),
              cooling_design_temperature: dflt(station.coolingDb1F, `${W_SRC}: cooling 1 % dry bulb`, "F"),
              daily_temperature_range: dflt(rangeClass, `${W_SRC}: cooling daily range ${station.dailyRangeF} F, class ${rangeClass} (16 to 25 F is medium)`),
              humidity_setpoint: dflt(0.5, QUICK_PASS_SOURCES.humidity, "fraction"),
              internal_loads_sensible: dflt(2400, QUICK_PASS_SOURCES.internal, "Btu/h"),
              internal_loads_latent: dflt(0, QUICK_PASS_SOURCES.internal, "Btu/h"),
              number_of_occupants: derived(bedrooms + 1, `${QUICK_PASS_SOURCES.occupants}; Q12 = ${bedrooms}`, "count"),
            },
          },
        },
      },
    },
  } as unknown as AssessmentInput;
  touch("bedrooms", "building.building_construction.number_of_bedrooms");
  touch("year_built", "building.building_construction.year_built");
  touch("ceiling_height", "building.building_construction.average_ceiling_height");
  touch("station_key", "building.climate_and_risk_zones.weather_station.station_key");

  const shaped = validateAssessment(input);
  if (!shaped.ok) {
    for (const i of shaped.issues) fail(null, "internal_shape", `${i.path}: ${i.message}`);
    return result(null);
  }

  // ---- the template fills what the answers left unknown (ADR-024)
  const applied = applyTemplate(shaped.assessment, t).assessment;
  applied.template_id = t.template_id;
  if (ctx.template_version) applied.template_version = ctx.template_version;
  const e = applied.building.enclosure;
  if (e.roofs[0]!.radiant_barrier.value === true) {
    (e.roofs[0] as Record<string, unknown>)["radiant_barrier_grade"] = dflt(1, QUICK_PASS_SOURCES.radiantBarrierGrade, "count");
  }

  // ---- MJ8.construction.assembly_r: nominal layers to whole-assembly R (quick-pass map §4)
  const wallSet = WOOD_FRAMING_SETS.wall2x4At16;
  for (const w of e.walls) {
    const cavity = w.insulation_cavity_r_value?.value ?? null;
    const continuous = w.insulation_continuous_r_value?.value ?? 0;
    if (cavity === null) {
      // The wall between the house and the garage takes the house walls' cavity R.
      const house = e.walls.find((x) => x.id === "wall-front")!;
      if (w.exterior_adjacent_to.value === "garage" && house.insulation_cavity_r_value?.value != null) {
        w.insulation_cavity_r_value = { ...house.insulation_cavity_r_value, note: "same as the exterior walls" } as typeof w.insulation_cavity_r_value;
        if (house.insulation_continuous_r_value && house.insulation_continuous_r_value.value !== null) w.insulation_continuous_r_value = { ...house.insulation_continuous_r_value } as typeof w.insulation_continuous_r_value;
      } else {
        fail(null, "wall_cavity_unknown", `wall ${w.id}: cavity R is unknown and the template has none`);
        continue;
      }
    }
    const cavR = w.insulation_cavity_r_value!.value as number;
    const contR = (w.insulation_continuous_r_value?.value as number | null | undefined) ?? continuous ?? 0;
    const siding = w.siding.value as string;
    const garageInterior = w.interior_adjacent_to.value === "garage";
    const r = framedWallAssemblyR({ ...wallSet, cavityR: cavR, continuousR: contR, siding, interiorFinish: garageInterior ? "none" : "gypsum board", sheathingThicknessIn: 0.5 });
    w.insulation_assembly_r_value = derived(
      round(r.assemblyR, 2),
      `MJ8.construction.assembly_r 0.1.0 (parallel path): 2x4 studs, framing factor ${wallSet.framingFactor} (OpenStudio-HPXML reference wall set, WOOD_FRAMING_SETS.wall2x4At16), cavity R-${cavR}, continuous R-${contR}, ${siding}, 1/2 in sheathing, ${garageInterior ? "no interior finish" : "1/2 in gypsum"}`,
      "h-ft2-F/Btu",
    ) as typeof w.insulation_assembly_r_value;
  }
  const ceilSet = WOOD_FRAMING_SETS.ceiling2x6At24;
  for (const f of e.floors) {
    if (f.floor_or_ceiling?.value !== "ceiling") continue;
    const nominal = f.insulation_cavity_r_value?.value;
    if (nominal === null || nominal === undefined) {
      fail("attic_insulation", "ceiling_r_unknown", `ceiling ${f.id}: insulation is unknown and the template has none`);
      continue;
    }
    const cavityR = Math.min(nominal, 19);
    const aboveR = nominal - cavityR;
    const r = framedCeilingAssemblyR({ joistNominalIn: ceilSet.studNominalIn, framingFactor: ceilSet.framingFactor, cavityR, aboveJoistR: aboveR, interiorFinish: "gypsum board" });
    f.insulation_assembly_r_value = derived(
      round(r.assemblyR, 2),
      `MJ8.construction.assembly_r 0.1.0 (parallel path): 2x6 joists at 24 in, framing factor ${ceilSet.framingFactor} (OpenStudio-HPXML reference ceiling set, WOOD_FRAMING_SETS.ceiling2x6At24); nominal R-${nominal} as R-${cavityR} between the joists and R-${round(aboveR, 2)} above, the reference engine's split (packages/calc/fixtures/oracle/assembly-r.json); 1/2 in gypsum`,
      "h-ft2-F/Btu",
    ) as typeof f.insulation_assembly_r_value;
  }

  // ---- RHOE.infiltration.resdb_ach50 for a leakiness answer (map Q11)
  if (leakiness) {
    const ach50 = resdbAch50(resdbInputFromAssessment(applied, leakiness));
    const why = isGiven(tA) ? `Q11 answered "${leakiness}"` : `Q11 ${statusOf(tA).replace(/_/g, " ")}, average used`;
    e.air_infiltration.air_leakage = derived(
      round(ach50, 2),
      `RHOE.infiltration.resdb_ach50 0.1.0: LBNL ResDB regression (${DEFAULTS_RB} 5912 to 6031) for year ${year}, ${cfa} ft2, ${n} x ${h} ft, ${crawl ? "vented crawlspace" : "slab"}, ducts ${ducted ? ductLoc : "none"}, times the "${leakiness}" multiplier (${why})`,
      "ACH50",
      unknownNote(tA),
    ) as typeof e.air_infiltration.air_leakage;
  }

  // D3: every field a question set carries the conflicting values it did not use, and why.
  for (const q of QUICK_PASS_QUESTIONS) {
    const a = answers[q.key] as AnyAnswer | undefined;
    const conflicts = conflictsOf(a);
    if (conflicts.length === 0 || !a || "unknown" in a) continue;
    const text = `conflicting ${conflicts.length === 1 ? "value" : "values"} kept: ${conflicts.map((c) => `${show(c.value)} (${c.state}, ${c.source})`).join("; ")}; chose ${show(a.value)} because ${a.rationale ?? "(no reason given)"}`;
    for (const p of fields[q.key] ?? []) {
      const visit = collectFields(applied).find((v) => v.path === p);
      if (!visit) continue;
      const f = visit.field as { note?: string };
      f.note = f.note ? `${f.note}; ${text}` : text;
    }
  }

  // "Inspected, can't tell" keeps the map's wording on every template value it fell back to.
  const relabel = (k: QuestionKey) => {
    const a = answers[k] as AnyAnswer | undefined;
    if (!a || !("unknown" in a)) return;
    for (const p of fields[k] ?? []) {
      const visit = collectFields(applied).find((v) => v.path === p);
      const note = unknownNote(a);
      if (visit && note && visit.field.state === "defaulted") (visit.field as { note?: string }).note = note;
    }
  };
  (["window_type", "attic_insulation", "ducts_sealed"] as QuestionKey[]).forEach(relabel);

  const final = validateAssessment(applied);
  if (!final.ok) {
    for (const i of final.issues) fail(null, "internal_shape", `${i.path}: ${i.message}`);
    return result(null);
  }
  for (const { path, field } of collectFields(final.assessment)) {
    if (field.state === "unknown" || field.state === "proposed") fail(null, "unresolved_field", `${path} is still ${field.state}; the quick pass left it unresolved`);
  }
  issues.push(...checkAssessmentGeometry(final.assessment));
  if (issues.some((i) => i.severity === "error")) return result(null);
  return result(final.assessment);
}

// ---------------------------------------------------------------------------------------------
// D7 checks: impossible values, inconsistent areas, window area against wall area (GEO-002)
// ---------------------------------------------------------------------------------------------

/**
 * Checks on the answers before any geometry exists. Limits are plausibility bounds for a DFW
 * single-family house, not code values; an error blocks the build, a warning asks the tech to
 * confirm. Messages say what to check.
 */
export function checkQuickPassAnswers(answers: QuickPassAnswers, now: Date = new Date()): QuickPassIssue[] {
  const out: QuickPassIssue[] = [];
  const v = <T,>(k: QuestionKey): T | undefined => {
    const a = answers[k] as AnyAnswer | undefined;
    return isGiven<T>(a) ? a.value : undefined;
  };
  const err = (question: QuestionKey, code: string, message: string) => out.push({ question, severity: "error", code, message });
  const warn = (question: QuestionKey, code: string, message: string) => out.push({ question, severity: "warning", code, message });

  const year = v<number>("year_built");
  if (year !== undefined && (year < 1850 || year > now.getUTCFullYear() + 1)) err("year_built", "impossible_year", `year built ${year} is outside 1850 to ${now.getUTCFullYear() + 1}`);
  const area = v<number>("floor_area");
  if (area !== undefined && (area < 300 || area > 15000)) err("floor_area", "impossible_floor_area", `floor area ${area} ft2 is outside 300 to 15,000 ft2`);
  if (area !== undefined && area >= 300 && area < 600) warn("floor_area", "small_floor_area", `floor area ${area} ft2 is small for a house; confirm it is the conditioned area`);
  const stories = v<number>("stories");
  const h = v<number>("ceiling_height");
  if (h !== undefined && (h < 6.5 || h > 20)) err("ceiling_height", "impossible_ceiling_height", `ceiling height ${h} ft is outside 6.5 to 20 ft`);
  if (h !== undefined && h > 12 && h <= 20) warn("ceiling_height", "tall_ceiling", `ceiling height ${h} ft is the average over the whole house; confirm`);
  const garage = v<{ cars: number }>("garage");
  if (stories !== undefined && area !== undefined && garage && garage.cars > 0 && area / stories < 400) warn("garage", "garage_large_for_house", "the garage is large for the house footprint; confirm the floor area and stories");
  if (v<boolean>("room_over_garage") === true && stories === 1) err("room_over_garage", "room_over_garage_one_story", "a one-story house cannot have a room over the garage; answer Q3b no or Q3 two stories");
  if (v<boolean>("room_over_garage") === true && garage && garage.cars === 0) err("room_over_garage", "room_over_no_garage", "Q3b says there is a room over the garage but Q3a says there is no garage");
  const wa = v<"light" | "typical" | "lots" | { total_area_ft2: number }>("window_amount");
  if (wa && typeof wa === "object" && area !== undefined) {
    const frac = wa.total_area_ft2 / area;
    if (frac > 0.5) err("window_amount", "window_area_impossible", `window area ${wa.total_area_ft2} ft2 is ${Math.round(frac * 100)} % of the floor area; check the number`);
    else if (frac > 0.3) warn("window_amount", "window_area_high", `window area is ${Math.round(frac * 100)} % of the floor area; confirm`);
    else if (frac < 0.03) warn("window_amount", "window_area_low", `window area is ${Math.round(frac * 100)} % of the floor area; confirm`);
  }
  const wt = v<string | { ufactor: number; shgc: number }>("window_type");
  if (wt && typeof wt === "object" && (wt.ufactor < 0.15 || wt.ufactor > 1.5)) err("window_type", "impossible_ufactor", `window U-factor ${wt.ufactor} is outside 0.15 to 1.5`);
  const ai = v<string | { nominal_r: number } | { depth_in: number }>("attic_insulation");
  if (ai && typeof ai === "object" && "nominal_r" in ai && ai.nominal_r > 80) err("attic_insulation", "impossible_attic_r", `attic R-${ai.nominal_r} is above R-80; check the number`);
  if (ai && typeof ai === "object" && "depth_in" in ai && ai.depth_in > 30) warn("attic_insulation", "deep_attic", `attic depth ${ai.depth_in} in is unusually deep; confirm`);
  const tight = v<string | { ach50: number } | { cfm50: number }>("tightness");
  if (tight && typeof tight === "object" && "ach50" in tight && (tight.ach50 < 0.5 || tight.ach50 > 50)) warn("tightness", "unusual_ach50", `blower-door ${tight.ach50} ACH50 is outside 0.5 to 50; confirm the units`);
  if (tight && typeof tight === "object" && "cfm50" in tight && area !== undefined && (tight.cfm50 < 100 || tight.cfm50 > area * 3)) warn("tightness", "unusual_cfm50", `blower-door ${tight.cfm50} CFM50 looks unusual for ${area} ft2; confirm the units`);
  const ds = v<boolean | { leakage_to_outside_cfm25: number }>("ducts_sealed");
  if (ds && typeof ds === "object" && area !== undefined && ds.leakage_to_outside_cfm25 > area) warn("ducts_sealed", "unusual_duct_leakage", `duct leakage ${ds.leakage_to_outside_cfm25} cfm25 is more than 1 cfm25 per ft2; confirm`);
  if (v<string>("system") === "ductless" && answers.duct_location && "value" in answers.duct_location) warn("duct_location", "ductless_has_ducts", "Q10b says ductless; the duct answers are ignored");
  // D3: a kept conflict needs a reason for the value in use (PRV-002, PRV-003).
  for (const q of QUICK_PASS_QUESTIONS) {
    const a = answers[q.key] as AnyAnswer | undefined;
    const conflicts = conflictsOf(a);
    if (conflicts.length > 0 && a && !("unknown" in a) && !a.rationale) {
      err(q.key, "conflict_needs_rationale", `Q${q.number} ${q.label} has ${conflicts.length + 1} different values (${[show(a.value), ...conflicts.map((c) => show(c.value))].join(", ")}); choose one and say why`);
    }
  }
  return out;
}

/** Checks on the built geometry: window area against the wall it sits in, and consistent areas. */
export function checkAssessmentGeometry(a: Assessment): QuickPassIssue[] {
  const out: QuickPassIssue[] = [];
  const e = a.building.enclosure;
  for (const w of e.walls) {
    const openings = [...e.windows, ...e.doors].filter((o) => o.attached_to_wall === w.id).reduce((s, o) => s + (o.area.value ?? 0), 0);
    const area = w.area.value ?? 0;
    if (openings === 0) continue;
    if (openings >= area) out.push({ question: "window_amount", severity: "error", code: "openings_exceed_wall", message: `windows and doors on ${w.id} (${Math.round(openings)} ft2) exceed the wall (${Math.round(area)} ft2)` });
    else if (openings > 0.6 * area) out.push({ question: "window_amount", severity: "warning", code: "openings_most_of_wall", message: `windows and doors cover ${Math.round((openings / area) * 100)} % of ${w.id}; confirm the window amount` });
  }
  const cfa = a.building.building_construction.conditioned_floor_area.value ?? 0;
  const conditionedFloors = [...e.floors.filter((f) => f.interior_adjacent_to.value === "conditioned space" && f.floor_or_ceiling?.value === "floor"), ...e.slabs.filter((s) => s.interior_adjacent_to.value === "conditioned space")].reduce((s, x) => s + (x.area.value ?? 0), 0);
  const stories = a.building.building_construction.number_of_conditioned_floors_above_grade.value ?? 1;
  const ceilings = e.floors.filter((f) => f.interior_adjacent_to.value === "conditioned space" && f.floor_or_ceiling?.value === "ceiling").reduce((s, x) => s + (x.area.value ?? 0), 0);
  if (cfa > 0 && conditionedFloors > 0 && stories === 1 && Math.abs(conditionedFloors - cfa) > 1) out.push({ question: "floor_area", severity: "error", code: "inconsistent_floor_area", message: `ground floor ${Math.round(conditionedFloors)} ft2 does not match the one-story floor area ${cfa} ft2` });
  if (cfa > 0 && ceilings > cfa + 1) out.push({ question: "floor_area", severity: "error", code: "inconsistent_ceiling_area", message: `ceilings ${Math.round(ceilings)} ft2 exceed the floor area ${cfa} ft2` });
  return out;
}

export type { Field };
