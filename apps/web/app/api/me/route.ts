import { accountsDb } from "../../../lib/accounts";
import { requireSignedIn } from "../../../lib/context";
import { handler, json } from "../../../lib/http";

/**
 * GET /api/me: the signed-in login, the account it is acting for (null when it belongs to none),
 * every account it belongs to, and its profile (ADR-039). 401 without a session.
 */
export const GET = handler(async () => {
  const who = await requireSignedIn();
  const db = accountsDb(who);
  const [account, accounts, profile] = await Promise.all([db.whoami(who.user_id), db.myAccounts(who.user_id), db.profile(who.user_id)]);
  return json({ user: { id: who.user_id, email: who.email }, account, accounts, profile });
});
