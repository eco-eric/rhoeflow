import { accountsDb } from "../../../../lib/accounts";
import { requireSignedIn } from "../../../../lib/context";
import { handler, json } from "../../../../lib/http";

/**
 * POST /api/me/invites: accept every pending invite for this login's confirmed email (ADR-039).
 * Called after each sign-in; the database checks the address is confirmed.
 */
export const POST = handler(async () => {
  const who = await requireSignedIn();
  const db = accountsDb(who);
  const accepted = await db.acceptMyInvites(who.user_id);
  return json({ accepted, account: await db.whoami(who.user_id) });
});
