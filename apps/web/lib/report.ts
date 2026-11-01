import { buildReport, isReportError, type ReportModel } from "@rhoeflow/report";
import { RunIdParamSchema, StoreError, getRun, readRunArtifact } from "@rhoeflow/store";
import { requireContext } from "./context";
import { readJob } from "./jobstore";

/**
 * The report model for one frozen run (WO-03 E1; RPT-001, RPT-002, WTH-001), shared by the
 * `/r/<run id>` page and its PDF (E2, ADR-037) so both print the same numbers. It reads only the
 * run row and the run's stored `output.json` (hash-checked against the run's artifact record),
 * never the live assessment. The property line is read through the JobStore at render time and is
 * not stored (ADR-028, ADR-031). A report refusal becomes a 409 StoreError.
 */
export async function loadReportModel(runId: string): Promise<ReportModel> {
  const rc = await requireContext();
  const { ctx, deps } = rc;
  const run_id = RunIdParamSchema.parse(runId);
  const run = await getRun(deps, ctx, run_id);
  const file = await readRunArtifact(deps, ctx, run_id, "output.json");
  const actual = await sha256Hex(file.bytes);
  if (actual !== file.sha256) throw new StoreError("conflict", `output.json of run ${run_id} does not match its recorded hash; the report is not rendered`);
  const output: unknown = JSON.parse(new TextDecoder().decode(file.bytes));
  const projectId = projectIdOf(output);
  let property_label: { text: string; source: string } | undefined;
  if (projectId) {
    try {
      const job = await readJob(rc, projectId);
      if (job.property) {
        const ad = job.property.address;
        property_label = { text: ad.text, source: `WorkEdge property ${job.property.id}, read at render time` };
      }
    } catch {
      // WorkEdge unreachable: the report still renders, without the address line.
    }
  }
  try {
    return buildReport({
      run: { run_id: run.run_id, assessment_id: run.assessment_id, revision: run.revision, status: run.status, stale: run.stale, stale_reason: run.stale_reason },
      output,
      ...(property_label ? { property_label } : {}),
    });
  } catch (e) {
    if (isReportError(e)) throw new StoreError("conflict", e.message, { reason: e.code });
    throw e;
  }
}

function projectIdOf(output: unknown): string | null {
  const id = (output as { frozen_input?: { assessment?: { workedge?: { project_id?: unknown } } } })?.frozen_input?.assessment?.workedge?.project_id;
  return typeof id === "string" ? id : null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await globalThis.crypto.subtle.digest("SHA-256", bytes.slice());
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
