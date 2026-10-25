import { CreateTemplateRequestSchema, createTemplate, listTemplates } from "@rhoeflow/store";
import { requireContext } from "../../../lib/context";
import { handler, json, parseBody } from "../../../lib/http";

/** GET /api/templates: the team's template store (C7). */
export const GET = handler(async () => {
  const { ctx, deps } = await requireContext();
  return json({ templates: await listTemplates(deps, ctx) });
});

/** POST /api/templates: a new template (from scratch or a copy). Editors only. */
export const POST = handler(async (req: Request) => {
  const { ctx, deps } = await requireContext();
  const body = await parseBody(req, CreateTemplateRequestSchema);
  return json(await createTemplate(deps, ctx, body), 201);
});
