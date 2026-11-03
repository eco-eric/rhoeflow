import { CreateJobRequestSchema, JobShowSchema, createJob, listJobs } from "@rhoeflow/store";
import { requireContext } from "../../../lib/context";
import { handler, json, parseBody } from "../../../lib/http";

/**
 * GET /api/jobs?before=<created_at>&show=active|archived|all&q=<words>: the account's own jobs,
 * newest first (ADR-040), active by default, searched by name, customer and address (ADR-042).
 */
export const GET = handler(async (req: Request) => {
  const { ctx, deps } = await requireContext();
  const sp = new URL(req.url).searchParams;
  const show = JobShowSchema.catch("active").parse(sp.get("show") ?? "active");
  return json(await listJobs(deps, ctx, { before: sp.get("before"), show, q: sp.get("q") }));
});

/** POST /api/jobs: start a job in RhoeFlow from a customer name and an address (ADR-040). */
export const POST = handler(async (req: Request) => {
  const { ctx, deps } = await requireContext();
  const body = await parseBody(req, CreateJobRequestSchema);
  return json(await createJob(deps, ctx, body), 201);
});
