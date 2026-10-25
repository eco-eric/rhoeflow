import { affectedAssessments, canEditTemplates, templateDetail } from "@rhoeflow/store";
import { requireContext } from "../../../../lib/context";
import { handler, json, type Params } from "../../../../lib/http";

/**
 * GET /api/templates/:id: the stored row, the current payload, every version, the open
 * assessments that picked it (D9: shown before a new version is saved) and whether this user may
 * edit. A template not yet in the store returns the repo copy with `template: null`.
 */
export const GET = handler(async (_req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  const id = (await params).id;
  const [detail, affected, can_edit] = await Promise.all([templateDetail(deps, ctx, id), affectedAssessments(deps, ctx, id), canEditTemplates(deps, ctx)]);
  return json({ ...detail, affected, can_edit });
});
