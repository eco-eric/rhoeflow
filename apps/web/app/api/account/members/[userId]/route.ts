import { z } from "zod";
import { changeRole, removeMember } from "@rhoeflow/store";
import { accountsDb } from "../../../../../lib/accounts";
import { requireContext } from "../../../../../lib/context";
import { handler, json, parseBody, type Params } from "../../../../../lib/http";

/**
 * PATCH /api/account/members/:userId { role }: admins change a role.
 * DELETE: admins remove someone; anyone may remove themselves. The last admin always stays (ADR-039).
 */
const Body = z.object({ role: z.string() }).strict();

export const PATCH = handler(async (req: Request, { params }: Params<"userId">) => {
  const rc = await requireContext();
  const { role } = await parseBody(req, Body);
  await changeRole(accountsDb(rc), rc.ctx, (await params).userId, role);
  return json({ ok: true });
});

export const DELETE = handler(async (_req: Request, { params }: Params<"userId">) => {
  const rc = await requireContext();
  await removeMember(accountsDb(rc), rc.ctx, (await params).userId);
  return json({ ok: true });
});
