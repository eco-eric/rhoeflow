import { StoreError, seedTemplates } from "@rhoeflow/store";
import { requireContext } from "../../../../lib/context";
import { handler, json } from "../../../../lib/http";

/** POST /api/templates/seed: load the repo's seven templates as version 1 (idempotent). Editors only. */
export const POST = handler(async () => {
  const { ctx, deps } = await requireContext();
  if (!ctx.user_id || !(await deps.db.templateEditors.isEditor(ctx.team_id, ctx.user_id))) {
    throw new StoreError("forbidden", "only a template editor may seed the store");
  }
  return json(await seedTemplates(deps, ctx));
});
