import { buildBundle, contentHash, prepareInput, runCalculation, CALC_INPUT_VERSION, ENGINE_NAME, ENGINE_VERSION, type CalcInputInput } from "@rhoeflow/calc";
import { sanityBandCheck } from "@rhoeflow/templates";
import { getAssessment, getRevision } from "./assessments.js";
import { newId, nowIso, type StoreContext, type StoreDeps } from "./context.js";
import type { CreateRunRequest } from "./contracts.js";
import { StoreError, isStoreError } from "./errors.js";
import { fingerprintFor } from "./fingerprints.js";
import { safePathSegment } from "./limits.js";
import type { CalcRunRow, RunArtifactRow } from "./records.js";
import { applyOverrides, getScenario } from "./scenarios.js";
import { resolvePinnedTemplate } from "./templates.js";
import { weatherRefFor } from "./weather.js";

/**
 * Frozen runs on the server (WO-03 C3; DAT-004, ENG-008, API-002). A run freezes one accepted
 * revision (plus a scenario's overrides), runs the engine, and writes the artifact bundle to
 * object storage. The row keeps the input hash, engine version, method ids, weather pin and
 * fingerprints. Requests are idempotent twice over: by the caller's key, and by content (an
 * `ok` run on the same input hash with the same engine is returned, not repeated).
 *
 * The phone may run the engine locally for a live preview labeled "preview, not a run"; nothing
 * here is involved in that.
 */

/** A run still `running` after this long is presumed dead and marked `timed_out` (API-002). */
export const RUN_TIMEOUT_MS = 2 * 60_000;

export async function createRun(deps: StoreDeps, ctx: StoreContext, assessment_id: string, req: CreateRunRequest): Promise<CalcRunRow> {
  const prior = await deps.db.runs.findByIdempotencyKey(ctx.team_id, assessment_id, req.idempotency_key);
  if (prior) return prior;

  const a = await getAssessment(deps, ctx, assessment_id);
  const revision = req.revision ?? a.revision;
  if (revision < 1) throw new StoreError("invalid_request", "accept a revision before running");
  if (revision > a.revision) throw new StoreError("not_found", `revision ${revision} does not exist yet (latest is ${a.revision})`);
  const rev = await getRevision(deps, ctx, assessment_id, revision);

  const scenario = req.scenario_id ? await getScenario(deps, ctx, req.scenario_id) : null;
  if (scenario && scenario.assessment_id !== assessment_id) throw new StoreError("invalid_request", `scenario ${scenario.scenario_id} belongs to another assessment`);
  const assessment = scenario ? applyOverrides(rev.snapshot, scenario.overrides) : rev.snapshot;

  const template = assessment.template_id ? await resolvePinnedTemplate(deps, ctx, assessment.template_id, assessment.template_version ?? null) : null;
  const band = template ? sanityBandCheck(template.template, template.version ?? undefined) : undefined;

  const raw: CalcInputInput = {
    calc_input_version: CALC_INPUT_VERSION,
    requested_engine: { name: ENGINE_NAME, version: ENGINE_VERSION },
    method_ids: [],
    weather: weatherRefFor(assessment),
    scenario: scenario ? { id: scenarioElementId(scenario.scenario_id), name: scenario.name, overrides: scenario.overrides } : { id: "baseline", name: "Baseline", overrides: [] },
    assessment,
    ...(band ? { checks: { sanity_band: band } } : {}),
  };
  const prepared = prepareInput(raw);
  if (!prepared.ok) {
    // Nothing ran, so nothing is recorded as a run: the structured issues go back to the caller (ENG-007, D5).
    throw new StoreError("invalid_request", "the frozen inputs cannot run; resolve the listed fields", { issues: prepared.issues });
  }
  const input = prepared.input;
  const input_hash = await contentHash(input);

  const accepted = await deps.db.runs.findAccepted(ctx.team_id, assessment_id, input_hash, ENGINE_VERSION);
  if (accepted) return accepted;

  const at = nowIso(deps);
  const run_id = newId(deps);
  let row: CalcRunRow;
  try {
    row = await deps.db.runs.insert({
      run_id,
      assessment_id,
      workedge_team_id: ctx.team_id,
      revision,
      scenario_id: scenario?.scenario_id ?? null,
      scenario_version: scenario?.scenario_version ?? null,
      idempotency_key: req.idempotency_key,
      status: "running",
      requested_at: at,
      started_at: at,
      finished_at: null,
      engine_name: ENGINE_NAME,
      engine_version: ENGINE_VERSION,
      weather: input.weather,
      template_id: assessment.template_id ?? null,
      template_version: assessment.template_version ?? null,
      input_hash,
      method_ids: [],
      fingerprint: null,
      stale: false,
      stale_reason: null,
      stale_at: null,
      totals: null,
      warnings: [],
      errors: [],
      bundle_prefix: null,
      requested_by: ctx.user_id,
    });
  } catch (e) {
    // A concurrent request with the same key got there first (UNIQUE assessment_id, idempotency_key).
    if (isStoreError(e) && e.code === "conflict") {
      const raced = await deps.db.runs.findByIdempotencyKey(ctx.team_id, assessment_id, req.idempotency_key);
      if (raced) return raced;
    }
    throw e;
  }

  try {
    const output = await runCalculation(input, { run_id, ...(deps.now ? { now: deps.now } : {}) });
    const bundle = await buildBundle(input, output);
    const prefix = `${safePathSegment(ctx.team_id)}/${safePathSegment(assessment_id)}/${safePathSegment(run_id)}`;
    const artifacts: RunArtifactRow[] = [];
    for (const f of bundle.files) {
      const storage_path = `${prefix}/${f.path}`;
      await deps.artifacts.put(storage_path, f.bytes, f.content_type);
      const m = bundle.manifest.files.find((x) => x.path === f.path);
      artifacts.push({
        run_id,
        workedge_team_id: ctx.team_id,
        path: f.path,
        sha256: m?.sha256 ?? (await sha256(f.bytes)),
        bytes: f.bytes.byteLength,
        content_type: f.content_type,
        storage_bucket: deps.artifacts.bucket,
        storage_path,
      });
    }
    await deps.db.artifacts.insertMany(artifacts);
    const fingerprint = fingerprintFor({
      content_hash: rev.content_hash,
      scenario_id: scenario?.scenario_id ?? null,
      scenario_version: scenario?.scenario_version ?? null,
      weather: input.weather,
      engine_version: output.manifest.engine.version,
      method_ids: output.manifest.method_ids,
      template_id: assessment.template_id ?? null,
      template_version: assessment.template_version ?? null,
    });
    const done = await deps.db.runs.transition(ctx.team_id, run_id, ["running"], {
      status: output.status,
      finished_at: nowIso(deps),
      engine_version: output.manifest.engine.version,
      method_ids: output.manifest.method_ids,
      fingerprint,
      totals: output.results.building,
      warnings: output.warnings,
      errors: output.errors,
      bundle_prefix: prefix,
    });
    // null: the run was cancelled or timed out while computing; the frozen row wins and the result is discarded.
    return done ?? (await deps.db.runs.get(ctx.team_id, run_id)) ?? row;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const failed = await deps.db.runs.transition(ctx.team_id, run_id, ["running"], {
      status: "error",
      finished_at: nowIso(deps),
      errors: [{ code: "RUN_FAILED", message }],
    });
    return failed ?? (await deps.db.runs.get(ctx.team_id, run_id)) ?? row;
  }
}

/** Scenario rows are UUIDs; CalcInput scenario ids are element-id slugs that must start with a letter. */
export function scenarioElementId(scenario_id: string): string {
  return `scenario-${scenario_id.replace(/[^A-Za-z0-9_-]/g, "")}`.slice(0, 64);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const d = await globalThis.crypto.subtle.digest("SHA-256", bytes.slice());
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getRun(deps: StoreDeps, ctx: StoreContext, run_id: string): Promise<CalcRunRow> {
  const r = await deps.db.runs.get(ctx.team_id, run_id);
  if (!r) throw new StoreError("not_found", `run ${run_id} not found`);
  return r;
}

export function listRuns(deps: StoreDeps, ctx: StoreContext, assessment_id: string): Promise<CalcRunRow[]> {
  return deps.db.runs.listByAssessment(ctx.team_id, assessment_id);
}

/** Cancel a queued or running run. A finished run is never changed (API-002). */
export async function cancelRun(deps: StoreDeps, ctx: StoreContext, run_id: string): Promise<CalcRunRow> {
  const r = await getRun(deps, ctx, run_id);
  const cancelled = await deps.db.runs.transition(ctx.team_id, run_id, ["queued", "running"], { status: "cancelled", finished_at: nowIso(deps) });
  if (!cancelled) throw new StoreError("conflict", `run ${run_id} is already ${r.status}; it cannot be cancelled`, { status: r.status });
  return cancelled;
}

/** Mark runs stuck in `running` past the timeout as `timed_out`; the caller may retry with a new key. */
export async function reapTimedOutRuns(deps: StoreDeps, ctx: StoreContext, timeout_ms = RUN_TIMEOUT_MS): Promise<CalcRunRow[]> {
  const cutoff = new Date((deps.now ?? (() => new Date()))().getTime() - timeout_ms).toISOString();
  const stuck = await deps.db.runs.listRunningSince(ctx.team_id, cutoff);
  const out: CalcRunRow[] = [];
  for (const r of stuck) {
    const t = await deps.db.runs.transition(ctx.team_id, r.run_id, ["running"], { status: "timed_out", finished_at: nowIso(deps), errors: [{ code: "RUN_TIMED_OUT", message: `no result after ${timeout_ms} ms` }] });
    if (t) out.push(t);
  }
  return out;
}

/** Read one artifact of a run. The path must be one the run recorded; nothing else in the bucket is reachable. */
export async function readRunArtifact(deps: StoreDeps, ctx: StoreContext, run_id: string, path: string): Promise<{ bytes: Uint8Array; content_type: string; sha256: string }> {
  await getRun(deps, ctx, run_id);
  const rows = await deps.db.artifacts.listByRun(ctx.team_id, run_id);
  const row = rows.find((r) => r.path === path);
  if (!row) throw new StoreError("not_found", `run ${run_id} has no artifact "${path}"`, { available: rows.map((r) => r.path) });
  const obj = await deps.artifacts.get(row.storage_path);
  if (!obj) throw new StoreError("unavailable", `artifact ${path} of run ${run_id} is missing from storage`);
  return { ...obj, sha256: row.sha256 };
}

export function listRunArtifacts(deps: StoreDeps, ctx: StoreContext, run_id: string): Promise<RunArtifactRow[]> {
  return deps.db.artifacts.listByRun(ctx.team_id, run_id);
}
