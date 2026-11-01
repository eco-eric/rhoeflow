import { revokeInvite } from "@rhoeflow/store";
import { accountsDb } from "../../../../../lib/accounts";
import { requireContext } from "../../../../../lib/context";
import { handler, json, type Params } from "../../../../../lib/http";

/** DELETE /api/account/invites/:inviteId: admins withdraw an invite before it is used (ADR-039). */
export const DELETE = handler(async (_req: Request, { params }: Params<"inviteId">) => {
  const rc = await requireContext();
  await revokeInvite(accountsDb(rc), rc.ctx, (await params).inviteId);
  return json({ ok: true });
});
