import { z } from "zod";
import { inviteMember, listInvites } from "@rhoeflow/store";
import { accountsDb } from "../../../../lib/accounts";
import { requireContext } from "../../../../lib/context";
import { handler, json, parseBody } from "../../../../lib/http";

/**
 * GET /api/account/invites: pending invites (admins only see them). POST { email, role }: admins
 * invite an email (ADR-039). RhoeFlow sends no email itself: the admin passes on the sign-up link.
 */
const Body = z.object({ email: z.string().max(320), role: z.string() }).strict();

export const GET = handler(async () => {
  const rc = await requireContext();
  return json({ invites: await listInvites(accountsDb(rc), rc.ctx) });
});

export const POST = handler(async (req: Request) => {
  const rc = await requireContext();
  const { email, role } = await parseBody(req, Body);
  return json(await inviteMember(accountsDb(rc), rc.ctx, email, role), 201);
});
