import { RunIdParamSchema, cancelRun } from "@rhoeflow/store";
import { requireContext } from "../../../../../lib/context";
import { handler, json, type Params } from "../../../../../lib/http";

/** POST /api/runs/:id/cancel: only a queued or running run; a finished run is never changed (API-002). */
export const POST = handler(async (_req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  return json(await cancelRun(deps, ctx, RunIdParamSchema.parse((await params).id)));
});
