import { ENGINE_NAME } from "@rhoeflow/calc";
import type { WeatherRef } from "./weather.js";
import { nowIso, type StoreContext, type StoreDeps } from "./context.js";
import { StoreError } from "./errors.js";
import type { CalcRunRow, RunFingerprint } from "./records.js";

/**
 * Dependency fingerprints and stale marking (REV-002; WO-03 C4; plan §Frozen runs). A run is
 * frozen; what can change is the world around it: the assessment gets a new accepted revision,
 * a scenario is edited, the weather library or engine is re-pinned, a template gets a new
 * version. Each of those marks exactly the runs carrying the old value stale, visibly, and a
 * stale run cannot feed a new report.
 */
export function fingerprintFor(args: {
  content_hash: string;
  scenario_id: string | null;
  scenario_version: number | null;
  weather: WeatherRef;
  engine_version: string;
  method_ids: readonly string[];
  template_id: string | null;
  template_version: string | null;
}): RunFingerprint {
  return {
    inputs: args.scenario_id ? `${args.content_hash}+scenario:${args.scenario_id}@${args.scenario_version}` : args.content_hash,
    weather: `${args.weather.library}@${args.weather.version}`,
    methods: `${ENGINE_NAME}@${args.engine_version}[${[...args.method_ids].sort().join(",")}]`,
    template: args.template_id ? `${args.template_id}@${args.template_version ?? "repo"}` : null,
  };
}

/** Mark every fresh run of the team that matches `where` stale. Returns how many changed. */
export async function markStaleWhere(deps: StoreDeps, ctx: StoreContext, where: (run: CalcRunRow) => boolean, reason: string): Promise<number> {
  const fresh = await deps.db.runs.listFresh(ctx.team_id);
  const ids = fresh.filter(where).map((r) => r.run_id);
  if (ids.length === 0) return 0;
  return deps.db.runs.markStale(ctx.team_id, ids, reason, nowIso(deps));
}

/** A new accepted revision supersedes every run on an earlier revision of that assessment. */
export function markStaleForNewRevision(deps: StoreDeps, ctx: StoreContext, assessment_id: string, new_revision: number) {
  return markStaleWhere(deps, ctx, (r) => r.assessment_id === assessment_id && r.revision < new_revision, `inputs changed: revision ${new_revision} accepted`);
}

/** An edited scenario supersedes the runs that froze its previous version. */
export function markStaleForScenarioEdit(deps: StoreDeps, ctx: StoreContext, scenario_id: string, new_version: number) {
  return markStaleWhere(deps, ctx, (r) => r.scenario_id === scenario_id && (r.scenario_version ?? 0) < new_version, `scenario edited: version ${new_version}`);
}

/** A re-pinned weather library supersedes every run that used the old pin. */
export function markStaleForWeatherPin(deps: StoreDeps, ctx: StoreContext, old: WeatherRef, newVersion: string) {
  return markStaleWhere(deps, ctx, (r) => r.fingerprint?.weather === `${old.library}@${old.version}`, `weather library ${old.library} re-pinned ${old.version} -> ${newVersion}`);
}

/** A new engine version supersedes every run computed by an older one. */
export function markStaleForEngineVersion(deps: StoreDeps, ctx: StoreContext, current_engine_version: string) {
  return markStaleWhere(deps, ctx, (r) => r.engine_version !== current_engine_version, `engine ${ENGINE_NAME} is now ${current_engine_version}`);
}

/** Reports render only from a fresh `ok` run (REV-001, REV-002). */
export function assertRunCanFeedReport(run: CalcRunRow): void {
  if (run.status !== "ok") throw new StoreError("invalid_request", `run ${run.run_id} has status ${run.status}; only an ok run can feed a report`, { status: run.status });
  if (run.stale) throw new StoreError("stale", `run ${run.run_id} is stale (${run.stale_reason ?? "reason not recorded"}); run again before issuing a report`, { stale_reason: run.stale_reason });
}
