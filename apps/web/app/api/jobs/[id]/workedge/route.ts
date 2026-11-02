import { JobIdParamSchema, LinkJobRequestSchema, StoreError, getJob, linkJobToWorkEdge } from "@rhoeflow/store";
import { requireContext } from "../../../../../lib/context";
import { handler, json, parseBody, type Params } from "../../../../../lib/http";
import { projectIdFrom, readWorkEdgeJob } from "../../../../../lib/jobstore";

/**
 * POST /api/jobs/:id/workedge: link a RhoeFlow job to a WorkEdge job, once (ADR-040). The WorkEdge
 * job is read with the account's own key first (ADR-038), so only a job the account's WorkEdge team
 * has can be linked, and its property comes from WorkEdge, not from the request.
 */
export const POST = handler(async (req: Request, { params }: Params<"id">) => {
  const rc = await requireContext();
  const job_id = JobIdParamSchema.parse((await params).id);
  const body = await parseBody(req, LinkJobRequestSchema);
  const project_id = projectIdFrom(body.workedge_project_id);
  if (!project_id) throw new StoreError("invalid_request", "that isn't a WorkEdge job link or id");
  await getJob(rc.deps, rc.ctx, job_id);
  const we = await readWorkEdgeJob(rc, project_id);
  return json(await linkJobToWorkEdge(rc.deps, rc.ctx, job_id, { project_id: we.project.id, property_id: we.project.property_id ?? we.property?.id ?? null }));
});
