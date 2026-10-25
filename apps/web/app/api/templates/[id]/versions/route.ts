import { CreateTemplateVersionRequestSchema, createTemplateVersion, listTemplateVersions } from "@rhoeflow/store";
import { requireContext } from "../../../../../lib/context";
import { handler, json, parseBody, type Params } from "../../../../../lib/http";

/** GET /api/templates/:id/versions */
export const GET = handler(async (_req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  return json({ versions: await listTemplateVersions(deps, ctx, (await params).id) });
});

/** POST /api/templates/:id/versions: a new immutable version; lists affected open assessments and stale runs (C7, REV-002). */
export const POST = handler(async (req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  const body = await parseBody(req, CreateTemplateVersionRequestSchema);
  return json(await createTemplateVersion(deps, ctx, (await params).id, body), 201);
});
