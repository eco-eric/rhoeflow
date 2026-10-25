import { CreateTemplateRequestSchema, canEditTemplates, createTemplate, currentTemplates, listTemplates } from "@rhoeflow/store";
import { requireContext } from "../../../lib/context";
import { handler, json, parseBody } from "../../../lib/http";

/**
 * GET /api/templates: the team's stored templates (C7), the templates a tech can pick now
 * (stored current versions, or the repo set until seeded) and whether this user may edit (D9).
 */
export const GET = handler(async () => {
  const { ctx, deps } = await requireContext();
  const [templates, current, can_edit] = await Promise.all([listTemplates(deps, ctx), currentTemplates(deps, ctx), canEditTemplates(deps, ctx)]);
  return json({ templates, current, can_edit });
});

/** POST /api/templates: a new template (from scratch or a copy). Editors only. */
export const POST = handler(async (req: Request) => {
  const { ctx, deps } = await requireContext();
  const body = await parseBody(req, CreateTemplateRequestSchema);
  return json(await createTemplate(deps, ctx, body), 201);
});
