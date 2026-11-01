import { z } from "zod";
import { switchAccount } from "@rhoeflow/store";
import { accountsDb } from "../../../../lib/accounts";
import { requireContext } from "../../../../lib/context";
import { handler, json, parseBody } from "../../../../lib/http";

/** PUT /api/me/account { account_id }: act for another account this login belongs to (ADR-039). */
const Body = z.object({ account_id: z.string().min(1).max(100) }).strict();

export const PUT = handler(async (req: Request) => {
  const rc = await requireContext();
  const { account_id } = await parseBody(req, Body);
  const db = accountsDb(rc);
  await switchAccount(db, rc.ctx, account_id);
  return json({ account: await db.whoami(rc.ctx.user_id!) });
});
