import { seedTemplates } from "@rhoeflow/store";
import { requireContext } from "../../../../lib/context";
import { handler, json } from "../../../../lib/http";

/** POST /api/templates/seed: load the repo's seven templates as version 1 (idempotent). Editors only. */
export const POST = handler(async () => {
  const { ctx, deps } = await requireContext();
  return json(await seedTemplates(deps, ctx));
});
