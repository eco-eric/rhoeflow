import { AssessmentIdParamSchema, SaveDraftRequestSchema, getAssessment, saveDraft } from "@rhoeflow/store";
import { requireContext } from "../../../../lib/context";
import { handler, json, parseBody, type Params } from "../../../../lib/http";

/** GET /api/assessments/:id */
export const GET = handler(async (_req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  const id = AssessmentIdParamSchema.parse((await params).id);
  return json(await getAssessment(deps, ctx, id));
});

/** PUT /api/assessments/:id: save the draft; 412 when `expected_draft_version` is behind. */
export const PUT = handler(async (req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  const id = AssessmentIdParamSchema.parse((await params).id);
  const body = await parseBody(req, SaveDraftRequestSchema);
  return json(await saveDraft(deps, ctx, id, body));
});
