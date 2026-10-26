import { buildReport, isReportError, type ReportModel } from "@rhoeflow/report";
import { RunIdParamSchema, StoreError, getRun, isStoreError, readRunArtifact } from "@rhoeflow/store";
import { requireContext } from "../../../lib/context";
import { readJob } from "../../../lib/jobstore";
import { ReportView } from "./report-view";

export const dynamic = "force-dynamic";

/**
 * The report for one frozen run (WO-03 E1; RPT-001, RPT-002, WTH-001). It reads only the run row
 * and the run's stored `output.json` (hash-checked against the run's artifact record), never the
 * live assessment. The property line is read through the JobStore at render time and is not
 * stored (ADR-028, ADR-031). The PDF of this page is E2.
 */
export default async function ReportPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  let model: ReportModel;
  try {
    const { ctx, deps } = await requireContext();
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
        const job = await readJob(ctx, projectId);
        if (job.property) {
          const ad = job.property.address;
          property_label = { text: [ad.line1, ad.line2, `${ad.city}, ${ad.state} ${ad.postal_code}`].filter(Boolean).join(", "), source: `WorkEdge property ${job.property.id}, read at render time` };
        }
      } catch {
        // WorkEdge unreachable: the report still renders, without the address line.
      }
    }
    model = buildReport({
      run: { run_id: run.run_id, assessment_id: run.assessment_id, revision: run.revision, status: run.status, stale: run.stale, stale_reason: run.stale_reason },
      output,
      ...(property_label ? { property_label } : {}),
    });
  } catch (e) {
    const message =
      isStoreError(e) || isReportError(e)
        ? e.message
        : e instanceof Error && e.name === "ZodError"
          ? `"${runId}" is not a run id.`
          : "Something went wrong rendering this report.";
    return (
      <main className="wrap">
        <h1>RhoeFlow Pro</h1>
        <div className="issue error" role="alert">
          {message}
        </div>
        <p className="muted">Run {runId}</p>
      </main>
    );
  }
  return <ReportView model={model} />;
}

function projectIdOf(output: unknown): string | null {
  const id = (output as { frozen_input?: { assessment?: { workedge?: { project_id?: unknown } } } })?.frozen_input?.assessment?.workedge?.project_id;
  return typeof id === "string" ? id : null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await globalThis.crypto.subtle.digest("SHA-256", bytes.slice());
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
