import { z } from "zod";
import { previewKey } from "@rhoeflow/connections";
import { connectionConfig, connectionRepo } from "../../../../../lib/connections";
import { requireContext } from "../../../../../lib/context";
import { handler, json, parseBody } from "../../../../../lib/http";

/**
 * POST /api/connections/workedge/check { api_key }: admins only. Asks WorkEdge which projects the
 * pasted key sees, so the admin can confirm it is this account's before saving (ADR-038
 * decision 6). Stores nothing.
 */
const Body = z.object({ api_key: z.string().min(1).max(600) }).strict();

export const POST = handler(async (req: Request) => {
  const rc = await requireContext();
  const { api_key } = await parseBody(req, Body);
  return json(await previewKey(connectionRepo(rc), rc.ctx, connectionConfig(), api_key));
});
