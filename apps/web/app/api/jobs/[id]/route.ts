import { JobIdParamSchema, UpdateJobRequestSchema, getJob, updateJob } from "@rhoeflow/store";
import { requireContext } from "../../../../lib/context";
import { handler, json, parseBody, type Params } from "../../../../lib/http";

/** GET /api/jobs/:id: one of the account's jobs (ADR-040). */
export const GET = handler(async (_req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  return json(await getJob(deps, ctx, JobIdParamSchema.parse((await params).id)));
});

/** PATCH /api/jobs/:id: change the job's name, customer or address. The WorkEdge link is not edited here. */
export const PATCH = handler(async (req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  const body = await parseBody(req, UpdateJobRequestSchema);
  return json(await updateJob(deps, ctx, JobIdParamSchema.parse((await params).id), body));
});
