import { AcceptRevisionRequestSchema, AssessmentIdParamSchema, acceptRevision } from "@rhoeflow/store";
import { requireContext } from "../../../../../lib/context";
import { handler, json, parseBody, type Params } from "../../../../../lib/http";

/** POST /api/assessments/:id/accept: freeze the draft as the next revision (DAT-004). */
export const POST = handler(async (req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  const id = AssessmentIdParamSchema.parse((await params).id);
  const body = await parseBody(req, AcceptRevisionRequestSchema);
  return json(await acceptRevision(deps, ctx, id, body), 201);
});
