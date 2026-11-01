import { z } from "zod";
import { connectionStatus, disconnect, saveConnection } from "@rhoeflow/connections";
import { connectionConfig, connectionRepo } from "../../../../lib/connections";
import { requireContext } from "../../../../lib/context";
import { handler, json, parseBody } from "../../../../lib/http";

/**
 * This account's WorkEdge connection (ADR-038).
 * GET: whether it is connected, the key's last four characters, and whether the caller may manage it.
 * PUT { api_key }: admins only; checks the key with WorkEdge again, encrypts it for this account, saves it.
 * DELETE: admins only; removes the stored key.
 * The key is never returned by any of these.
 */
const SaveBody = z.object({ api_key: z.string().min(1).max(600) }).strict();

export const GET = handler(async () => {
  const rc = await requireContext();
  return json(await connectionStatus(connectionRepo(rc), rc.ctx));
});

export const PUT = handler(async (req: Request) => {
  const rc = await requireContext();
  const { api_key } = await parseBody(req, SaveBody);
  return json(await saveConnection(connectionRepo(rc), rc.ctx, connectionConfig(), api_key));
});

export const DELETE = handler(async () => {
  const rc = await requireContext();
  return json(await disconnect(connectionRepo(rc), rc.ctx));
});
