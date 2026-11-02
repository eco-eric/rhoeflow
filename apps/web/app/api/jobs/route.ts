import { CreateJobRequestSchema, createJob, listJobs } from "@rhoeflow/store";
import { requireContext } from "../../../lib/context";
import { handler, json, parseBody } from "../../../lib/http";

/** GET /api/jobs?before=<created_at>: the account's own jobs, newest first (ADR-040). */
export const GET = handler(async (req: Request) => {
  const { ctx, deps } = await requireContext();
  const before = new URL(req.url).searchParams.get("before");
  return json(await listJobs(deps, ctx, { before }));
});

/** POST /api/jobs: start a job in RhoeFlow from a customer name and an address (ADR-040). */
export const POST = handler(async (req: Request) => {
  const { ctx, deps } = await requireContext();
  const body = await parseBody(req, CreateJobRequestSchema);
  return json(await createJob(deps, ctx, body), 201);
});
