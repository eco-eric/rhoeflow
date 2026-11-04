import { notFound } from "next/navigation";
import type { Property } from "@rhoeflow/jobstore";
import { JobIdParamSchema, getJob, getJobSite, isStoreError, jobAddress } from "@rhoeflow/store";
import { houseView } from "../../../lib/house";
import { requirePageContext } from "../../../lib/session";
import { readWorkEdgeJob } from "../../../lib/jobstore";
import { FieldApp } from "./field-app";
import { LinkWorkEdge } from "./link-workedge";
import { ArchiveJobButton } from "../../../components/archive-job-button";

export const dynamic = "force-dynamic";

/**
 * One load calc job (ADR-040): RhoeFlow's own job, made in RhoeFlow or for a WorkEdge job. The
 * client creates or resumes the job's one open assessment. When the job is linked, the WorkEdge
 * property is read through the JobStore (ADR-031) so its facts can prefill answers as documented;
 * if WorkEdge can't be reached the job still opens.
 */
export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const rc = await requirePageContext(`/j/${encodeURIComponent(jobId)}`);
  const id = JobIdParamSchema.safeParse(jobId);
  if (!id.success) notFound();
  let job;
  try {
    job = await getJob(rc.deps, rc.ctx, id.data);
  } catch (e) {
    if (isStoreError(e) && e.code === "not_found") notFound();
    throw e;
  }
  let property: Property | null = null;
  if (job.workedge_project_id) {
    try {
      property = (await readWorkEdgeJob(rc, job.workedge_project_id)).property;
    } catch {
      // WorkEdge unreachable or disconnected: the job opens with RhoeFlow's own address.
    }
  }
  // House facts (ADR-043): what was looked up before; the page looks the house up the first time it opens.
  const house = houseView(await getJobSite(rc.deps, rc.ctx, job.job_id).catch(() => null), job.city);
  const archived = job.archived_at !== null;
  return (
    <FieldApp
      job={{ job_id: job.job_id, name: job.name, address: jobAddress(job), workedge_project_id: job.workedge_project_id }}
      property={property}
      house={house}
      linkSlot={job.workedge_project_id ? null : <LinkWorkEdge jobId={job.job_id} />}
      notice={
        archived ? (
          <div className="notice" role="status">
            <span>This load calc is archived, so it isn&apos;t in your list. You can still work on it.</span>
            <ArchiveJobButton jobId={job.job_id} jobName={job.name} archived variant="button" />
          </div>
        ) : null
      }
    />
  );
}
