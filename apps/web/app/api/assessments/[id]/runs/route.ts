import { AssessmentIdParamSchema, CreateRunRequestSchema, createRun, listRuns } from "@rhoeflow/store";
import { requireContext } from "../../../../../lib/context";
import { handler, json, parseBody, type Params } from "../../../../../lib/http";

/** GET /api/assessments/:id/runs */
export const GET = handler(async (_req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  const id = AssessmentIdParamSchema.parse((await params).id);
  return json({ runs: await listRuns(deps, ctx, id) });
});

/**
 * POST /api/assessments/:id/runs: a frozen run (C3). Idempotent on `idempotency_key` and on
 * content; a repeated request returns the existing run with 200, a new one 201.
 */
export const POST = handler(async (req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  const id = AssessmentIdParamSchema.parse((await params).id);
  const body = await parseBody(req, CreateRunRequestSchema);
  const existing = await deps.db.runs.findByIdempotencyKey(ctx.team_id, id, body.idempotency_key);
  const run = await createRun(deps, ctx, id, body);
  return json(run, existing ? 200 : 201);
});
