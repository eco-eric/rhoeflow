import { RunIdParamSchema, UpdateScenarioRequestSchema, getScenario, updateScenario } from "@rhoeflow/store";
import { requireContext } from "../../../../lib/context";
import { handler, json, parseBody, type Params } from "../../../../lib/http";

/** GET /api/scenarios/:id */
export const GET = handler(async (_req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  return json(await getScenario(deps, ctx, RunIdParamSchema.parse((await params).id)));
});

/** PUT /api/scenarios/:id: replace name and overrides; marks the scenario's runs stale (REV-002). */
export const PUT = handler(async (req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  const id = RunIdParamSchema.parse((await params).id);
  const body = await parseBody(req, UpdateScenarioRequestSchema);
  return json(await updateScenario(deps, ctx, id, body));
});
