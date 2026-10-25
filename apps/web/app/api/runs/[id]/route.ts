import { RunIdParamSchema, getRun, listRunArtifacts } from "@rhoeflow/store";
import { requireContext } from "../../../../lib/context";
import { handler, json, type Params } from "../../../../lib/http";

/** GET /api/runs/:id: the frozen run row and its artifact list (ENG-008). */
export const GET = handler(async (_req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  const id = RunIdParamSchema.parse((await params).id);
  const run = await getRun(deps, ctx, id);
  const artifacts = await listRunArtifacts(deps, ctx, id);
  return json({ run, artifacts });
});
