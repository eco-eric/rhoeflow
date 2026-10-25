import { collectFields, getFieldAtPath, setFieldAtPath, type Assessment } from "@rhoeflow/schema";
import { CalcInputSchema, CalcOutputSchema, type CalcInput, type CalcOutput, type ScenarioOverride } from "@rhoeflow/calc";
import { getAssessment, getRevision } from "./assessments.js";
import { newId, nowIso, type StoreContext, type StoreDeps } from "./context.js";
import type { CreateScenarioRequest, UpdateScenarioRequest } from "./contracts.js";
import { StoreError } from "./errors.js";
import { markStaleForScenarioEdit } from "./fingerprints.js";
import type { CalcRunRow, ScenarioRow } from "./records.js";
import { readRunArtifact } from "./runs.js";

/**
 * Scenarios (WO-03 C5; SCN-001, SCN-002, QST-003). A scenario is the frozen baseline plus
 * explicit overrides, each with a source and a rationale. The baseline is never edited. The
 * comparison lists changed fields with their sources and the load changes, labels non-reference
 * inputs, and converts nothing to energy bills.
 */

type FieldLike = { value: unknown; unit?: string; state: string; source: string };

/** Check every override against a snapshot: the path must hold a field and the unit must agree. */
export function checkOverrides(snapshot: Assessment, overrides: readonly ScenarioOverride[]): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  const seen = new Set<string>();
  overrides.forEach((o, i) => {
    const at = `overrides[${i}]`;
    if (seen.has(o.path)) issues.push({ path: at, message: `path "${o.path}" appears twice` });
    seen.add(o.path);
    const target = getFieldAtPath(snapshot, o.path) as FieldLike | undefined;
    if (!target) {
      issues.push({ path: at, message: `"${o.path}" is not an input field of the accepted assessment` });
      return;
    }
    if (target.unit !== undefined && o.field.unit !== target.unit) issues.push({ path: at, message: `"${o.path}" is in ${target.unit}; the override must use the same unit (no conversion here)` });
    if (target.unit === undefined && o.field.unit !== undefined) issues.push({ path: at, message: `"${o.path}" carries no unit` });
    if (target.value !== null && typeof target.value !== typeof o.field.value) issues.push({ path: at, message: `"${o.path}" holds a ${typeof target.value}, not a ${typeof o.field.value}` });
  });
  return issues;
}

/** The baseline snapshot with the overrides applied; the baseline itself is untouched. */
export function applyOverrides(snapshot: Assessment, overrides: readonly ScenarioOverride[]): Assessment {
  let out = snapshot;
  for (const o of overrides) {
    const f = { value: o.field.value, state: o.field.state, source: o.field.source, evidence: o.field.evidence, ...(o.field.note ? { note: o.field.note } : {}), ...(o.field.unit ? { unit: o.field.unit } : {}) };
    out = setFieldAtPath(out, o.path, f);
  }
  return out;
}

export async function createScenario(deps: StoreDeps, ctx: StoreContext, assessment_id: string, req: CreateScenarioRequest): Promise<ScenarioRow> {
  const a = await getAssessment(deps, ctx, assessment_id);
  if (a.revision < 1) throw new StoreError("invalid_request", "accept a revision before creating scenarios against it");
  const base = await getRevision(deps, ctx, assessment_id, a.revision);
  const issues = checkOverrides(base.snapshot, req.overrides);
  if (issues.length > 0) throw new StoreError("invalid_request", "overrides do not fit the accepted assessment", { issues });
  const at = nowIso(deps);
  return deps.db.scenarios.insert({
    scenario_id: newId(deps),
    assessment_id,
    workedge_team_id: ctx.team_id,
    name: req.name,
    overrides: req.overrides,
    scenario_version: 1,
    created_at: at,
    updated_at: at,
    created_by: ctx.user_id,
  });
}

export async function updateScenario(deps: StoreDeps, ctx: StoreContext, scenario_id: string, req: UpdateScenarioRequest): Promise<{ scenario: ScenarioRow; stale_runs: number }> {
  const s = await getScenario(deps, ctx, scenario_id);
  const a = await getAssessment(deps, ctx, s.assessment_id);
  const base = await getRevision(deps, ctx, s.assessment_id, a.revision);
  const issues = checkOverrides(base.snapshot, req.overrides);
  if (issues.length > 0) throw new StoreError("invalid_request", "overrides do not fit the accepted assessment", { issues });
  const updated = await deps.db.scenarios.update(ctx.team_id, scenario_id, req.expected_scenario_version, { name: req.name, overrides: req.overrides, updated_at: nowIso(deps) });
  if (!updated) throw new StoreError("precondition_failed", `scenario is at version ${s.scenario_version}, not ${req.expected_scenario_version}`, { scenario_version: s.scenario_version });
  const stale_runs = await markStaleForScenarioEdit(deps, ctx, scenario_id, updated.scenario_version);
  return { scenario: updated, stale_runs };
}

export async function getScenario(deps: StoreDeps, ctx: StoreContext, scenario_id: string): Promise<ScenarioRow> {
  const s = await deps.db.scenarios.get(ctx.team_id, scenario_id);
  if (!s) throw new StoreError("not_found", `scenario ${scenario_id} not found`);
  return s;
}

export function listScenarios(deps: StoreDeps, ctx: StoreContext, assessment_id: string): Promise<ScenarioRow[]> {
  return deps.db.scenarios.listByAssessment(ctx.team_id, assessment_id);
}

export const COMPARISON_NOTICE = "Design-load comparison only: differences in Btu/h at design conditions. Not converted to energy use, cost, savings or comfort (SCN-002).";

export interface ChangedField {
  path: string;
  /** `design` or `customer_preference` from the override; `revision_change` when the runs froze different revisions. */
  label: "design" | "customer_preference" | "revision_change";
  rationale: string | null;
  from: FieldLike;
  to: FieldLike;
}

export interface LoadDelta {
  baseline: number;
  scenario: number;
  delta: number;
  unit: "Btu/h";
}

export interface RunComparison {
  baseline: { run_id: string; revision: number; scenario_id: string | null; engine_version: string; weather: string };
  scenario: { run_id: string; revision: number; scenario_id: string | null; engine_version: string; weather: string };
  /** False where the two runs differ on something other than the overrides; the comparison is then not like for like. */
  same_basis: { revision: boolean; weather: boolean; engine: boolean; methods: boolean };
  changed_fields: ChangedField[];
  /** Paths whose override is a customer preference, not a reference design input (QST-003). */
  non_reference_inputs: string[];
  loads: { heating_sensible: LoadDelta; cooling_sensible: LoadDelta; cooling_latent: LoadDelta; cooling_total: LoadDelta };
  components: { component_id: string; component_kind: string; heating_sensible: LoadDelta | null; cooling_sensible: LoadDelta | null; cooling_latent: LoadDelta | null }[];
  notice: typeof COMPARISON_NOTICE;
}

async function frozen(deps: StoreDeps, ctx: StoreContext, run: CalcRunRow): Promise<{ input: CalcInput; output: CalcOutput }> {
  if (run.status !== "ok") throw new StoreError("invalid_request", `run ${run.run_id} is ${run.status}; only ok runs compare`);
  const dec = new TextDecoder();
  const input = CalcInputSchema.parse(JSON.parse(dec.decode((await readRunArtifact(deps, ctx, run.run_id, "frozen-input.json")).bytes)));
  const output = CalcOutputSchema.parse(JSON.parse(dec.decode((await readRunArtifact(deps, ctx, run.run_id, "output.json")).bytes)));
  return { input, output };
}

function delta(b: number, s: number): LoadDelta {
  return { baseline: b, scenario: s, delta: s - b, unit: "Btu/h" };
}

/** Compare two frozen runs of the same assessment from their artifact bundles, never from live rows. */
export async function compareRuns(deps: StoreDeps, ctx: StoreContext, baseline_run_id: string, scenario_run_id: string): Promise<RunComparison> {
  const [b, s] = await Promise.all([deps.db.runs.get(ctx.team_id, baseline_run_id), deps.db.runs.get(ctx.team_id, scenario_run_id)]);
  if (!b) throw new StoreError("not_found", `run ${baseline_run_id} not found`);
  if (!s) throw new StoreError("not_found", `run ${scenario_run_id} not found`);
  if (b.assessment_id !== s.assessment_id) throw new StoreError("invalid_request", "runs belong to different assessments");
  const [fb, fs] = await Promise.all([frozen(deps, ctx, b), frozen(deps, ctx, s)]);

  const overrides = new Map(fs.input.scenario.overrides.map((o) => [o.path, o]));
  const before = new Map(collectFields(fb.input.assessment).map((v) => [v.path, v.field as FieldLike]));
  const changed_fields: ChangedField[] = [];
  for (const v of collectFields(fs.input.assessment)) {
    const prev = before.get(v.path);
    const next = v.field as FieldLike;
    if (!prev) continue;
    if (prev.value === next.value && prev.unit === next.unit && prev.state === next.state && prev.source === next.source) continue;
    const o = overrides.get(v.path);
    changed_fields.push({ path: v.path, label: o?.label ?? "revision_change", rationale: o?.rationale ?? null, from: pick(prev), to: pick(next) });
  }

  const tb = fb.output.results.building!;
  const ts = fs.output.results.building!;
  const byId = new Map(fb.output.results.components.map((c) => [c.component_id, c]));
  const components = fs.output.results.components.map((c) => {
    const p = byId.get(c.component_id);
    const d = (x: number | null | undefined, y: number | null) => (x == null || y == null ? null : delta(x, y));
    return { component_id: c.component_id, component_kind: c.component_kind, heating_sensible: d(p?.heating_sensible, c.heating_sensible), cooling_sensible: d(p?.cooling_sensible, c.cooling_sensible), cooling_latent: d(p?.cooling_latent, c.cooling_latent) };
  });

  return {
    baseline: { run_id: b.run_id, revision: b.revision, scenario_id: b.scenario_id, engine_version: b.engine_version, weather: `${b.weather.library}@${b.weather.version}` },
    scenario: { run_id: s.run_id, revision: s.revision, scenario_id: s.scenario_id, engine_version: s.engine_version, weather: `${s.weather.library}@${s.weather.version}` },
    same_basis: {
      revision: b.revision === s.revision,
      weather: b.fingerprint?.weather === s.fingerprint?.weather,
      engine: b.engine_version === s.engine_version,
      methods: b.fingerprint?.methods === s.fingerprint?.methods,
    },
    changed_fields,
    non_reference_inputs: changed_fields.filter((c) => c.label === "customer_preference").map((c) => c.path),
    loads: {
      heating_sensible: delta(tb.heating_sensible, ts.heating_sensible),
      cooling_sensible: delta(tb.cooling_sensible, ts.cooling_sensible),
      cooling_latent: delta(tb.cooling_latent, ts.cooling_latent),
      cooling_total: delta(tb.cooling_sensible + tb.cooling_latent, ts.cooling_sensible + ts.cooling_latent),
    },
    components,
    notice: COMPARISON_NOTICE,
  };
}

function pick(f: FieldLike): FieldLike {
  return { value: f.value, state: f.state, source: f.source, ...(f.unit !== undefined ? { unit: f.unit } : {}) };
}
