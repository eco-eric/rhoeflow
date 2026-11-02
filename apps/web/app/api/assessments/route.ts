import { CreateOrResumeAssessmentRequestSchema, createOrResumeAssessment } from "@rhoeflow/store";
import { requireContext } from "../../../lib/context";
import { handler, json, parseBody } from "../../../lib/http";

/** POST /api/assessments: create or resume the open assessment of one of the account's jobs (C2; ADR-040). */
export const POST = handler(async (req: Request) => {
  const { ctx, deps } = await requireContext();
  const body = await parseBody(req, CreateOrResumeAssessmentRequestSchema);
  const r = await createOrResumeAssessment(deps, ctx, body);
  return json(r, r.resumed ? 200 : 201);
});
