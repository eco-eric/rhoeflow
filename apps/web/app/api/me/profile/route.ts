import { z } from "zod";
import { getProfile, saveProfile } from "@rhoeflow/store";
import { accountsDb } from "../../../../lib/accounts";
import { requireContext } from "../../../../lib/context";
import { handler, json, parseBody } from "../../../../lib/http";

/**
 * GET /api/me/profile and PATCH { full_name?, phone? } (ADR-039). Email and password changes go
 * from the browser straight to Supabase Auth, never through this server.
 */
const Body = z.object({ full_name: z.string().max(200).nullable().optional(), phone: z.string().max(60).nullable().optional() }).strict();

export const GET = handler(async () => {
  const rc = await requireContext();
  return json(await getProfile(accountsDb(rc), rc.ctx));
});

export const PATCH = handler(async (req: Request) => {
  const rc = await requireContext();
  return json(await saveProfile(accountsDb(rc), rc.ctx, await parseBody(req, Body)));
});
