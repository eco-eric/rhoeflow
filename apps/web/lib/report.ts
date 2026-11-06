import { buildReport, isReportError, type ReportModel } from "@rhoeflow/report";
import type { ReportSatellite } from "@rhoeflow/report-html";
import { RunIdParamSchema, StoreError, getAssessment, getJob, getJobSite, getRun, jobAddress, readRunArtifact } from "@rhoeflow/store";
import { requireContext } from "./context";
import { readWorkEdgeJob } from "./jobstore";
import { reportSatellite } from "./report-satellite";

/**
 * The report model for one frozen run (WO-03 E1; RPT-001, RPT-002, WTH-001), shared by the
 * `/r/<run id>` page and its PDF (E2, ADR-037) so both print the same numbers. It reads only the
 * run row and the run's stored `output.json` (hash-checked against the run's artifact record),
 * never the live assessment. The address line is the RhoeFlow job's (ADR-040), or for a linked job
 * with no address of its own, the WorkEdge property read through the JobStore at render time
 * (ADR-031). A report refusal becomes a 409 StoreError.
 */
export async function loadReportModel(runId: string): Promise<ReportModel> {
  return (await loadReport(runId)).model;
}

/**
 * The report model plus what is read at render time beside it, none of it stored: the customer's
 * name and the address line for the PDF's download name, and the satellite view of the house
 * (Esri, or USDA NAIP, ADR-044) from the job's looked-up point, or null when there is no point or no picture.
 */
export async function loadReport(runId: string): Promise<{ model: ReportModel; customer_name: string | null; address: string | null; satellite: ReportSatellite | null }> {
  const rc = await requireContext();
  const { ctx, deps } = rc;
  const run_id = RunIdParamSchema.parse(runId);
  const run = await getRun(deps, ctx, run_id);
  const file = await readRunArtifact(deps, ctx, run_id, "output.json");
  const actual = await sha256Hex(file.bytes);
  if (actual !== file.sha256) throw new StoreError("conflict", `output.json of run ${run_id} does not match its recorded hash; the report is not rendered`);
  const output: unknown = JSON.parse(new TextDecoder().decode(file.bytes));
  const [customer_name, satellite] = await Promise.all([customerName(rc, run.assessment_id), satelliteOf(rc, run.assessment_id)]);
  const property_label = await addressLine(rc, run.assessment_id, projectIdOf(output));
  let model: ReportModel;
  try {
    model = buildReport({
      run: { run_id: run.run_id, assessment_id: run.assessment_id, revision: run.revision, status: run.status, stale: run.stale, stale_reason: run.stale_reason },
      output,
      ...(property_label ? { property_label } : {}),
    });
  } catch (e) {
    if (isReportError(e)) throw new StoreError("conflict", e.message, { reason: e.code });
    throw e;
  }
  return { model, customer_name, address: property_label?.text ?? null, satellite };
}

/** The satellite view around the job's looked-up point, as on the job page's map (ADR-044), or null. */
async function satelliteOf(rc: Awaited<ReturnType<typeof requireContext>>, assessment_id: string): Promise<ReportSatellite | null> {
  const { ctx, deps } = rc;
  try {
    const site = await getJobSite(deps, ctx, (await getAssessment(deps, ctx, assessment_id)).job_id);
    if (!site || site.lat === null || site.lon === null) return null;
    return await reportSatellite(site.lat, site.lon);
  } catch {
    return null;
  }
}

/** The RhoeFlow job's customer name (ADR-040), or null when the job has none or can't be read. */
async function customerName(rc: Awaited<ReturnType<typeof requireContext>>, assessment_id: string): Promise<string | null> {
  const { ctx, deps } = rc;
  try {
    const job = await getJob(deps, ctx, (await getAssessment(deps, ctx, assessment_id)).job_id);
    return job.customer_name?.trim() || null;
  } catch {
    return null;
  }
}

async function addressLine(rc: Awaited<ReturnType<typeof requireContext>>, assessment_id: string, projectId: string | null): Promise<{ text: string; source: string } | undefined> {
  const { ctx, deps } = rc;
  try {
    const job = await getJob(deps, ctx, (await getAssessment(deps, ctx, assessment_id)).job_id);
    const text = jobAddress(job);
    if (text) return { text, source: "RhoeFlow job, read at render time" };
  } catch {
    // Fall through to WorkEdge.
  }
  if (!projectId) return undefined;
  try {
    const job = await readWorkEdgeJob(rc, projectId);
    if (job.property) return { text: job.property.address.text, source: `WorkEdge property ${job.property.id}, read at render time` };
  } catch {
    // WorkEdge unreachable: the report still renders, without the address line.
  }
  return undefined;
}

function projectIdOf(output: unknown): string | null {
  const id = (output as { frozen_input?: { assessment?: { workedge?: { project_id?: unknown } } } })?.frozen_input?.assessment?.workedge?.project_id;
  return typeof id === "string" ? id : null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await globalThis.crypto.subtle.digest("SHA-256", bytes.slice());
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
