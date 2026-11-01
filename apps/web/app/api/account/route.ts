import { z } from "zod";
import { renameAccount } from "@rhoeflow/store";
import { accountsDb } from "../../../lib/accounts";
import { requireContext } from "../../../lib/context";
import { handler, json, parseBody } from "../../../lib/http";

/** GET /api/account: the current account and the caller's role. PATCH { name }: admins rename it (ADR-039). */
const Body = z.object({ name: z.string().max(200) }).strict();

export const GET = handler(async () => {
  const rc = await requireContext();
  return json({ account_id: rc.ctx.account_id, name: rc.account_name, role: rc.ctx.role ?? "member" });
});

export const PATCH = handler(async (req: Request) => {
  const rc = await requireContext();
  const { name } = await parseBody(req, Body);
  return json({ account_id: rc.ctx.account_id, name: await renameAccount(accountsDb(rc), rc.ctx, name), role: rc.ctx.role ?? "member" });
});
