import { newId, nowIso, type StoreContext, type StoreDeps } from "./context.js";
import type { IssueReportRequest } from "./contracts.js";
import { assertRunCanFeedReport } from "./fingerprints.js";
import type { ReportRow } from "./records.js";
import { getRun } from "./runs.js";

/**
 * Report revisions (REV-001; WO-03 C4 guard, filled in by Track E). A report is issued from one
 * fresh `ok` run and never changes; a numeric change needs a new run and a new report revision.
 * Rendering and the PDF arrive in E1/E2; the write-back to WorkEdge in E3 (ADR-030).
 */
export async function issueReport(deps: StoreDeps, ctx: StoreContext, req: IssueReportRequest & { storage_path?: string | null; content_hash?: string | null }): Promise<ReportRow> {
  const run = await getRun(deps, ctx, req.run_id);
  assertRunCanFeedReport(run);
  const existing = await deps.db.reports.listByAssessment(ctx.team_id, run.assessment_id);
  const report_revision = existing.reduce((m, r) => Math.max(m, r.report_revision), 0) + 1;
  return deps.db.reports.insert({
    report_id: newId(deps),
    assessment_id: run.assessment_id,
    workedge_team_id: ctx.team_id,
    run_id: run.run_id,
    report_revision,
    report_type: req.report_type,
    issued_at: nowIso(deps),
    issued_by: ctx.user_id,
    storage_path: req.storage_path ?? null,
    content_hash: req.content_hash ?? null,
    write_back_status: "queued",
    workedge_report_id: null,
  });
}

export function listReports(deps: StoreDeps, ctx: StoreContext, assessment_id: string): Promise<ReportRow[]> {
  return deps.db.reports.listByAssessment(ctx.team_id, assessment_id);
}
