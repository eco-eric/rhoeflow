import { ArchiveJobRequestSchema, JobIdParamSchema, setJobArchived } from "@rhoeflow/store";
import { requireContext } from "../../../../../lib/context";
import { handler, json, parseBody, type Params } from "../../../../../lib/http";

/**
 * POST /api/jobs/:id/archive {archived: true | false}: archive one of the account's jobs or bring
 * it back (ADR-042). Any member may; nothing is deleted and the job can still be opened.
 */
export const POST = handler(async (req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  const body = await parseBody(req, ArchiveJobRequestSchema);
  return json(await setJobArchived(deps, ctx, JobIdParamSchema.parse((await params).id), body.archived));
});
