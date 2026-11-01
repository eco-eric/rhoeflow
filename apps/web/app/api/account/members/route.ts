import { listMembers } from "@rhoeflow/store";
import { accountsDb } from "../../../../lib/accounts";
import { requireContext } from "../../../../lib/context";
import { handler, json } from "../../../../lib/http";

/** GET /api/account/members: everyone in the current account, with name, email, role and joined date. */
export const GET = handler(async () => {
  const rc = await requireContext();
  return json({ members: await listMembers(accountsDb(rc), rc.ctx), me: rc.ctx.user_id, role: rc.ctx.role ?? "member" });
});
