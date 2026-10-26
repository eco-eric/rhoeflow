import { CalcOutputSchema, type CalcOutput } from "@rhoeflow/calc";
import { collectFields, PROVENANCE_STATES, type ProvenanceState } from "@rhoeflow/schema";
import type { Cell, LabeledCell, PrintedValue, ReportModel, Table, WorksheetRow } from "./model.js";
import { EXCLUDED_PAGES, NOTICES } from "./notices.js";
import { printed, type PrintedNumber, type RoundingRuleId } from "./rounding.js";

/**
 * Build the report model from one frozen run (RPT-001, RPT-002, WTH-001). The only inputs are
 * the run's stored output (which carries its frozen input) and the run row's identity and
 * staleness; nothing is read from the live assessment, and no engineering value is computed
 * here. The printed figures are run results, frozen input values, or one of two stated
 * conversions of run totals: tons = Btu/h ÷ 12,000 and the sanity ratios against floor area.
 */

export interface ReportRunInfo {
  run_id: string;
  assessment_id: string;
  revision: number;
  status: string;
  stale: boolean;
  stale_reason: string | null;
}

export interface BuildReportInput {
  run: ReportRunInfo;
  /** The run's `output.json` artifact, as parsed JSON. */
  output: unknown;
  /** The property as WorkEdge names it, read through JobStore at render time (ADR-028, ADR-031). */
  property_label?: { text: string; source: string };
}

export class ReportError extends Error {
  constructor(
    readonly code: "run_not_ok" | "output_mismatch" | "output_invalid",
    message: string,
  ) {
    super(message);
    this.name = "ReportError";
  }
}

/** Structural check: `instanceof` fails across separately bundled route chunks (as for StoreError). */
export function isReportError(e: unknown): e is ReportError {
  return e instanceof Error && e.name === "ReportError" && typeof (e as { code?: unknown }).code === "string";
}

export const REPORT_MODEL_VERSION = "0.1.0" as const;

type AnyField = { value: unknown; unit?: string; state: ProvenanceState; source: string };
const isField = (x: unknown): x is AnyField => typeof x === "object" && x !== null && "state" in x && "source" in x && "value" in x;

const text = (t: string): PrintedValue => ({ text: t });
const runCell = (value: PrintedValue, path: string): Cell => ({ value, path: `output.${path}` });
const labeled = (label: string, c: Cell): LabeledCell => ({ label, ...c });

/** A frozen input field as a printed cell; numbers go through `rule`, everything else prints as text. */
function fieldCell(f: unknown, path: string, rule?: RoundingRuleId): Cell | null {
  if (!isField(f)) return null;
  const v = f.value;
  let value: PrintedValue;
  if (typeof v === "number") value = rule ? printed(v, rule) : printed(v, "factor");
  else if (typeof v === "boolean") value = text(v ? "yes" : "no");
  else if (v === null || v === undefined) value = text("—");
  else value = text(String(v));
  return { value, state: f.state, source: f.source, path };
}

const RULE_BY_UNIT: Record<string, RoundingRuleId> = {
  ft2: "area_ft2",
  ft: "length_ft",
  in: "length_ft",
  F: "temperature_f",
  "h-ft2-F/Btu": "r_value",
  "Btu/h-ft2-F": "u_value",
  degrees: "azimuth_deg",
  ACH50: "ach50",
  cfm50: "cfm",
  cfm25: "leakage_cfm",
  "Btu/h": "btuh",
  count: "count",
  grains: "grains",
  Pa: "count",
  ft3: "count",
};
const ruleFor = (f: AnyField): RoundingRuleId => (f.unit && RULE_BY_UNIT[f.unit]) || "factor";

const get = (root: unknown, path: string): unknown => {
  let cur: unknown = root;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
};

export function buildReport(input: BuildReportInput): ReportModel {
  const parsed = CalcOutputSchema.safeParse(input.output);
  if (!parsed.success) throw new ReportError("output_invalid", `the run's output does not parse: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  const out: CalcOutput = parsed.data;
  if (input.run.status !== "ok" || out.status !== "ok" || !out.results.building) {
    throw new ReportError("run_not_ok", `run ${input.run.run_id} is ${input.run.status}; reports render only from a finished ok run`);
  }
  if (out.manifest.run_id !== input.run.run_id) {
    throw new ReportError("output_mismatch", `output belongs to run ${out.manifest.run_id}, not ${input.run.run_id}`);
  }
  const fi = out.frozen_input;
  const a = fi.assessment;
  const b = a.building;
  const totals = out.results.building;

  // ------------------------------------------------------------------ meta
  const meta: ReportModel["meta"] = {
    run_id: out.manifest.run_id,
    assessment_id: a.assessment_id,
    revision: input.run.revision,
    scenario: { id: fi.scenario.id, name: fi.scenario.name, override_count: fi.scenario.overrides.length },
    engine: { name: out.manifest.engine.name, version: out.manifest.engine.version },
    calc_output_version: out.calc_output_version,
    input_hash: out.manifest.input_hash,
    method_ids: out.manifest.method_ids,
    run_created_at: out.manifest.created_at,
    weather: { library: fi.weather.library, version: fi.weather.version, station_key: fi.weather.station_key },
    template: a.template_id ? { id: a.template_id, version: a.template_version ?? null } : null,
    workedge: { team_id: a.workedge.team_id, project_id: a.workedge.project_id, property_id: a.workedge.property_id },
    stale: input.run.stale,
    stale_reason: input.run.stale_reason,
  };

  // ------------------------------------------------------------------ home
  const bc = b.building_construction;
  const foundation = b.enclosure.foundations[0]?.foundation_type;
  const homeRows: [string, unknown, string, RoundingRuleId?][] = [
    ["Year built", bc.year_built, "building.building_construction.year_built", "year"],
    ["Conditioned floor area", bc.conditioned_floor_area, "building.building_construction.conditioned_floor_area", "area_ft2"],
    ["Stories above grade", bc.number_of_conditioned_floors_above_grade, "building.building_construction.number_of_conditioned_floors_above_grade", "count"],
    ["Bedrooms", bc.number_of_bedrooms, "building.building_construction.number_of_bedrooms", "count"],
    ["Occupants (design)", b.systems.hvac.hvac_sizing_control.manualj_inputs.number_of_occupants, "building.systems.hvac.hvac_sizing_control.manualj_inputs.number_of_occupants", "count"],
    ["Foundation", foundation, "building.enclosure.foundations[0].foundation_type"],
    ["Front of home faces (degrees from north)", b.site.azimuth_of_front_of_home, "building.site.azimuth_of_front_of_home", "azimuth_deg"],
  ];
  const home = {
    property_label: input.property_label ?? null,
    rows: homeRows.flatMap(([label, f, path, rule]) => {
      const c = fieldCell(f, path, rule);
      return c ? [labeled(label, c)] : [];
    }),
  };

  // ------------------------------------------------------------------ totals and sanity
  const coolingTotal = totals.cooling_sensible + totals.cooling_latent;
  const tons = coolingTotal / 12000;
  const t: ReportModel["totals"] = {
    heating: labeled("Heating", runCell(printed(totals.heating_sensible, "btuh"), "results.building.heating_sensible")),
    cooling_sensible: labeled("Cooling, sensible", runCell(printed(totals.cooling_sensible, "btuh"), "results.building.cooling_sensible")),
    cooling_latent: labeled("Cooling, latent", runCell(printed(totals.cooling_latent, "btuh"), "results.building.cooling_latent")),
    cooling_total: labeled("Cooling, total (sensible + latent)", runCell(printed(coolingTotal, "btuh"), "results.building.cooling_sensible + cooling_latent")),
    cooling_tons: labeled("Cooling, total in tons (÷ 12,000)", runCell(printed(tons, "tons"), "(results.building.cooling_sensible + cooling_latent) / 12000")),
  };
  const cfaField = bc.conditioned_floor_area;
  const cfa = typeof cfaField.value === "number" ? cfaField.value : null;
  const sanityRows: LabeledCell[] = [];
  if (cfa && cfa > 0) {
    if (tons > 0) sanityRows.push(labeled("Floor area per ton of cooling", runCell(printed(cfa / tons, "ft2_per_ton"), "conditioned_floor_area / cooling tons")));
    sanityRows.push(labeled("Cooling load per ft²", runCell(printed(coolingTotal / cfa, "btuh_per_ft2"), "cooling total / conditioned_floor_area")));
    sanityRows.push(labeled("Heating load per ft²", runCell(printed(totals.heating_sensible / cfa, "btuh_per_ft2"), "heating / conditioned_floor_area")));
  }
  const band = fi.checks?.sanity_band;
  const sanity: ReportModel["sanity"] = {
    rows: sanityRows,
    band:
      band && cfa && tons > 0
        ? {
            low: band.low_ft2_per_ton,
            high: band.high_ft2_per_ton,
            template_id: band.template_id,
            template_version: band.template_version,
            source: band.source,
            inside: cfa / tons >= band.low_ft2_per_ton && cfa / tons <= band.high_ft2_per_ton,
          }
        : null,
  };

  // ------------------------------------------------------------------ design conditions
  const mj = b.systems.hvac.hvac_sizing_control.manualj_inputs;
  const mjP = "building.systems.hvac.hvac_sizing_control.manualj_inputs";
  const ctl = b.systems.hvac.hvac_control;
  const dc = out.results.design_conditions;
  const dcRows: LabeledCell[] = [];
  const overrides: ReportModel["design_conditions"]["overrides"] = [];
  const push = (label: string, c: Cell | null) => c && dcRows.push(labeled(label, c));
  if (dc) {
    push("Weather station", runCell(text(`${dc.station.name}, ${dc.station.state} (${dc.station.station_key})`), "results.design_conditions.station"));
    push("Weather dataset", runCell(text(`${fi.weather.library} ${fi.weather.version}; design data: ${dc.station.design_conditions_title}`), "frozen_input.weather"));
    push("Station elevation", runCell(printed(dc.station.elevation_ft, "elevation_ft"), "results.design_conditions.station.elevation_ft"));
    push("Atmospheric pressure (standard, at elevation)", runCell(printed(dc.pressure_psi, "pressure_psi"), "results.design_conditions.pressure_psi"));
  }
  push("Outdoor heating design (99 % dry bulb)", fieldCell(mj.heating_design_temperature, `${mjP}.heating_design_temperature`, "temperature_f"));
  push("Outdoor cooling design (1 % dry bulb)", fieldCell(mj.cooling_design_temperature, `${mjP}.cooling_design_temperature`, "temperature_f"));
  if (dc) push("Coincident wet bulb (station, 1 %)", runCell(printed(dc.station.cooling_mcwb_1_f, "temperature_f"), "results.design_conditions.station.cooling_mcwb_1_f"));
  push("Daily temperature range", fieldCell(mj.daily_temperature_range, `${mjP}.daily_temperature_range`));
  if (dc) push("Daily range (station)", runCell(printed(dc.station.daily_range_f, "temperature_difference_f"), "results.design_conditions.station.daily_range_f"));
  if (ctl) {
    push("Indoor heating setpoint", fieldCell(ctl.heating_setpoint, "building.systems.hvac.hvac_control.heating_setpoint", "temperature_f"));
    push("Indoor cooling setpoint", fieldCell(ctl.cooling_setpoint, "building.systems.hvac.hvac_control.cooling_setpoint", "temperature_f"));
  }
  if (isField(mj.humidity_setpoint) && typeof mj.humidity_setpoint.value === "number") {
    dcRows.push(labeled("Indoor relative humidity (cooling)", { value: printed(mj.humidity_setpoint.value * 100, "percent"), state: mj.humidity_setpoint.state, source: mj.humidity_setpoint.source, path: `${mjP}.humidity_setpoint` }));
  }
  if (dc) {
    push("Heating temperature difference", runCell(printed(dc.htd_f, "temperature_difference_f"), "results.design_conditions.htd_f"));
    push("Cooling temperature difference", runCell(printed(dc.ctd_f, "temperature_difference_f"), "results.design_conditions.ctd_f"));
    push("Design grains difference (outdoor − indoor)", runCell(printed(dc.design_grains, "grains"), "results.design_conditions.design_grains"));
    const station = [
      ["Outdoor heating design", dc.station.heating_db_99_f, mj.heating_design_temperature, `${mjP}.heating_design_temperature`],
      ["Outdoor cooling design", dc.station.cooling_db_1_f, mj.cooling_design_temperature, `${mjP}.cooling_design_temperature`],
    ] as const;
    for (const [label, sv, f] of station) {
      if (isField(f) && typeof f.value === "number" && Math.abs(f.value - sv) > 0.005) {
        overrides.push({ label, station: `${printed(sv, "temperature_f").text} °F`, used: `${printed(f.value, "temperature_f").text} °F`, state: f.state, source: f.source });
      }
    }
  }
  const design_conditions = { recorded: dc !== undefined, rows: dcRows, overrides };

  // ------------------------------------------------------------------ provenance
  const fields = collectFields(a).filter(({ path }) => !path.startsWith("workedge"));
  const counts = Object.fromEntries(PROVENANCE_STATES.map((s) => [s, 0])) as Record<ProvenanceState, number>;
  const inputs: LabeledCell[] = [];
  for (const { path, field } of fields) {
    const f = field as unknown as AnyField;
    counts[f.state] += 1;
    const c = fieldCell(f, `${path}`, ruleFor(f));
    if (c) inputs.push(labeled(path, c));
  }
  const bySource = new Map<string, number>();
  for (const c of inputs) {
    if (c.state !== "defaulted") continue;
    const key = sourceGroup(c.source ?? "");
    bySource.set(key, (bySource.get(key) ?? 0) + 1);
  }
  const provenance: ReportModel["provenance"] = {
    total: inputs.length,
    counts,
    measured_or_documented: inputs.filter((c) => c.state === "measured" || c.state === "documented"),
    assumed: inputs.filter((c) => c.state === "assumed"),
    defaulted_by_source: [...bySource].map(([source, count]) => ({ source, count })).sort((x, y) => y.count - x.count || x.source.localeCompare(y.source)),
  };

  // ------------------------------------------------------------------ construction components
  const e = b.enclosure;
  /** Elements with the path each sits at, so a filtered list keeps its true paths. */
  const at = <T,>(list: readonly T[], base: string, keep: (x: T) => boolean = () => true) =>
    list.flatMap((el, i) => (keep(el) ? [{ el: el as unknown as Record<string, unknown> & { id?: string }, path: `${base}[${i}]` }] : []));
  const table = (title: string, items: { el: Record<string, unknown> & { id?: string }; path: string }[], cols: [string, string, RoundingRuleId?][], empty?: string): Table => ({
    title,
    columns: ["Component", ...cols.map(([label]) => label)],
    rows: items.map(({ el, path }) => ({ id: el.id ?? path, cells: cols.map(([, key, rule]) => fieldCell(get(el, key), `${path}.${key}`, rule)) })),
    ...(empty ? { empty } : {}),
  });
  const FLOORS = "building.enclosure.floors";
  const ducts = b.systems.hvac.hvac_distributions.flatMap((d, di) => d.ducts.map((x, xi) => ({ ...x, id: `${d.id} / ${x.id}`, _path: `building.systems.hvac.hvac_distributions[${di}].ducts[${xi}]` })));
  const leakage = b.systems.hvac.hvac_distributions.flatMap((d, di) =>
    d.duct_leakage_measurements.map((m, mi) => ({ ...m, id: `${d.id} / leakage ${mi + 1}`, _path: `building.systems.hvac.hvac_distributions[${di}].duct_leakage_measurements[${mi}]` })),
  );
  const pathTable = (title: string, list: ({ id: string; _path: string } & Record<string, unknown>)[], cols: [string, string, RoundingRuleId?][], empty: string): Table => ({
    title,
    columns: ["Component", ...cols.map(([l]) => l)],
    rows: list.map((r) => ({ id: r.id, cells: cols.map(([, key, rule]) => fieldCell(get(r, key), `${r._path}.${key}`, rule)) })),
    empty,
  });
  const construction: Table[] = [
    table("Walls", at(e.walls, "building.enclosure.walls"), [
      ["Exterior side", "exterior_adjacent_to"],
      ["Type", "wall_type"],
      ["Siding", "siding"],
      ["Gross area (ft²)", "area", "area_ft2"],
      ["Assembly R", "insulation_assembly_r_value", "r_value"],
      ["Azimuth (°)", "azimuth", "azimuth_deg"],
    ]),
    table("Windows", at(e.windows, "building.enclosure.windows"), [
      ["Area (ft²)", "area", "area_ft2"],
      ["U-factor", "ufactor", "u_value"],
      ["SHGC", "shgc", "shgc"],
      ["Azimuth (°)", "azimuth", "azimuth_deg"],
      ["Interior shading", "interior_shading"],
    ]),
    table("Doors", at(e.doors, "building.enclosure.doors"), [
      ["Area (ft²)", "area", "area_ft2"],
      ["R-value", "r_value", "r_value"],
      ["Azimuth (°)", "azimuth", "azimuth_deg"],
    ]),
    table("Ceilings", at(e.floors, FLOORS, isCeilingLike), [
      ["Above", "exterior_adjacent_to"],
      ["Area (ft²)", "area", "area_ft2"],
      ["Assembly R", "insulation_assembly_r_value", "r_value"],
    ], "None."),
    table("Floors", at(e.floors, FLOORS, (f) => !isCeilingLike(f)), [
      ["Below", "exterior_adjacent_to"],
      ["Area (ft²)", "area", "area_ft2"],
      ["Assembly R", "insulation_assembly_r_value", "r_value"],
    ], "None (slab on grade)."),
    table("Roofs", at(e.roofs, "building.enclosure.roofs"), [
      ["Below", "interior_adjacent_to"],
      ["Area (ft²)", "area", "area_ft2"],
      ["Assembly R", "insulation_assembly_r_value", "r_value"],
      ["Radiant barrier", "radiant_barrier"],
    ], "None."),
    table("Slabs", at(e.slabs, "building.enclosure.slabs"), [
      ["Space above", "interior_adjacent_to"],
      ["Area (ft²)", "area", "area_ft2"],
      ["Exposed perimeter (ft)", "exposed_perimeter", "length_ft"],
      ["Perimeter insulation R", "perimeter_insulation_r_value", "r_value"],
      ["Under-slab insulation R", "under_slab_insulation_r_value", "r_value"],
    ], "None."),
    {
      title: "Air leakage",
      columns: ["Component", "Leakage", "Test pressure (Pa)"],
      rows: [
        {
          id: e.air_infiltration.id,
          cells: [
            fieldCell(e.air_infiltration.air_leakage, "building.enclosure.air_infiltration.air_leakage", ruleFor(e.air_infiltration.air_leakage as unknown as AnyField)),
            fieldCell(e.air_infiltration.house_pressure, "building.enclosure.air_infiltration.house_pressure", "count"),
          ],
        },
      ],
    },
    pathTable("Ducts", ducts, [
      ["Supply or return", "duct_type"],
      ["Location", "duct_location"],
      ["Insulation R (nominal)", "duct_insulation_r_value", "r_value"],
      ["Share of side's area", "duct_fraction_area", "factor"],
    ], "No ducts (ductless or none recorded)."),
    pathTable("Duct leakage", leakage, [
      ["Supply or return", "duct_type"],
      ["Leakage (fraction of fan flow, or CFM25)", "value", "factor"],
      ["Measured as", "total_or_to_outside"],
    ], "None."),
    { title: "Mechanical ventilation", columns: ["Component"], rows: [], empty: "None recorded in the assessment; no ventilation load is included." },
  ];
  // Leakage values carry their own unit (fraction or CFM25); print with the unit's rule.
  const leakTable = construction.find((x) => x.title === "Duct leakage")!;
  leakTable.rows.forEach((row, i) => {
    const m = leakage[i]!;
    const f = m.value as unknown as AnyField;
    row.cells[1] = fieldCell(f, `${m._path}.value`, f.unit === "fraction" ? "factor" : ruleFor(f));
  });

  // ------------------------------------------------------------------ load worksheet
  const recorded = out.results.components.every((c) => c.component_kind === "aed_excursion" || c.detail !== undefined);
  const rows: WorksheetRow[] = out.results.components.map((c) => {
    const d = c.detail;
    const slab = c.component_kind === "slab";
    const notes: string[] = [];
    if (d?.ach50 !== undefined) notes.push(`${printed(d.ach50, "ach50").text} ACH50`);
    if (d?.cfm_heating !== undefined) notes.push(`heating ${printed(d.cfm_heating, "cfm").text} CFM`);
    if (d?.cfm_cooling !== undefined) notes.push(`cooling ${printed(d.cfm_cooling, "cfm").text} CFM`);
    if (d?.occupants !== undefined) notes.push(`${printed(d.occupants, "count").text} occupants`);
    if (d?.shgc !== undefined) notes.push(`SHGC ${printed(d.shgc, "shgc").text}`);
    for (const s of d?.duct_sides ?? []) {
      const leak = s.leakage_to_outside.unit === "fraction" ? `${printed(s.leakage_to_outside.value * 100, "percent").text} %` : `${printed(s.leakage_to_outside.value, "leakage_cfm").text} ${s.leakage_to_outside.unit.toUpperCase()}`;
      notes.push(
        s.surface_area_ft2 === 0
          ? `${s.duct_type}: inside conditioned space, leakage to outside ${leak}`
          : `${s.duct_type}: ${s.location}, ${printed(s.surface_area_ft2, "area_ft2").text} ft², effective R ${s.effective_r_value === null ? "—" : printed(s.effective_r_value, "r_value").text}, leakage to outside ${leak}`,
      );
    }
    if (c.component_kind === "aed_excursion") notes.push("adequate exposure diversity excursion on the window loads");
    const htmUnit = slab ? "Btu/h per ft" : "Btu/h per ft²";
    return {
      component_id: c.component_id,
      kind: c.component_kind,
      method_id: c.method_id,
      adjacent_to: d?.adjacent_to ?? null,
      azimuth: d?.azimuth_deg !== undefined ? printed(d.azimuth_deg, "azimuth_deg") : null,
      size: slab ? (d?.perimeter_ft !== undefined ? printed(d.perimeter_ft, "length_ft") : null) : d?.area_ft2 !== undefined ? printed(d.area_ft2, "area_ft2") : null,
      conductance: slab ? (d?.f_value !== undefined ? printed(d.f_value, "f_value") : null) : d?.u_value !== undefined ? printed(d.u_value, "u_value") : null,
      htm_heating: d?.htm_heating !== undefined ? printed(d.htm_heating, "htm", htmUnit) : null,
      htm_cooling: d?.htm_cooling !== undefined ? printed(d.htm_cooling, "htm", htmUnit) : null,
      heating: printed(c.heating_sensible ?? 0, "btuh"),
      cooling_sensible: printed(c.cooling_sensible ?? 0, "btuh"),
      cooling_latent: printed(c.cooling_latent ?? 0, "btuh"),
      notes,
    };
  });
  const worksheet = {
    recorded,
    rows,
    totals: { heating: printed(totals.heating_sensible, "btuh"), cooling_sensible: printed(totals.cooling_sensible, "btuh"), cooling_latent: printed(totals.cooling_latent, "btuh") },
  };

  return {
    report_model_version: REPORT_MODEL_VERSION,
    meta,
    home,
    totals: t,
    sanity,
    design_conditions,
    provenance,
    construction,
    worksheet,
    inputs,
    warnings: out.warnings.map((w) => ({ code: w.code, message: w.message })),
    excluded: EXCLUDED_PAGES,
    notices: NOTICES,
  };
}

function isCeilingLike(f: { floor_or_ceiling?: { value: unknown } | undefined; exterior_adjacent_to: { value: unknown } }): boolean {
  if (f.floor_or_ceiling) return f.floor_or_ceiling.value === "ceiling";
  return typeof f.exterior_adjacent_to.value === "string" && f.exterior_adjacent_to.value.startsWith("attic");
}

/** Group default sources for the customer page: by template, weather library, OpenStudio-HPXML default, or the citation's lead. */
export function sourceGroup(source: string): string {
  const tpl = /^template:([^\s(]+)/.exec(source);
  if (tpl) return `Era template ${tpl[1]}`;
  if (source.startsWith("weather:")) return "Weather library (ASHRAE design conditions)";
  if (source.includes("OpenStudio-HPXML")) return "OpenStudio-HPXML published defaults";
  if (/^ADR-\d+/.test(source)) return "RhoeFlow design policy (decision log)";
  if (source.startsWith("RHOE.") || source.startsWith("quick pass")) return "Quick-pass defaults";
  const lead = source.split(/[:;(]/)[0]!.trim();
  return lead.length > 80 ? `${lead.slice(0, 77)}...` : lead;
}

export type { PrintedNumber };
