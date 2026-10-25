import { AssessmentIdParamSchema, CreateScenarioRequestSchema, createScenario, listScenarios } from "@rhoeflow/store";
import { requireContext } from "../../../../../lib/context";
import { handler, json, parseBody, type Params } from "../../../../../lib/http";

/** GET /api/assessments/:id/scenarios */
export const GET = handler(async (_req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  const id = AssessmentIdParamSchema.parse((await params).id);
  return json({ scenarios: await listScenarios(deps, ctx, id) });
});

/** POST /api/assessments/:id/scenarios (C5; SCN-001) */
export const POST = handler(async (req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  const id = AssessmentIdParamSchema.parse((await params).id);
  const body = await parseBody(req, CreateScenarioRequestSchema);
  return json(await createScenario(deps, ctx, id, body), 201);
});
