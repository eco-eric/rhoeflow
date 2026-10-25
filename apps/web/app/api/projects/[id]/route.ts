import { requireContext } from "../../../../lib/context";
import { handler, json, type Params } from "../../../../lib/http";
import { readJob } from "../../../../lib/jobstore";

/** GET /api/projects/:id: the WorkEdge project and property behind a deep link (D1; standard §3 entry A). */
export const GET = handler(async (_req: Request, { params }: Params<"id">) => {
  const { ctx } = await requireContext();
  return json(await readJob(ctx, (await params).id));
});
