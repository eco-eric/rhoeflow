import { MemoryConnectionRepo, type ConnectionConfig, type ConnectionRepo } from "@rhoeflow/connections";
import { supabaseConnectionRepo } from "@rhoeflow/connections/supabase";
import { DEV_CONTEXT } from "./dev";
import type { RequestContext } from "./context";

/**
 * Each account's own WorkEdge connection (ADR-038). The repo is the signed-in user's Supabase
 * client, so row-level security decides who reads and writes it; the development memory store gets
 * an in-memory repo whose development user is an admin.
 */
const g = globalThis as { __rhoeDevConnections?: MemoryConnectionRepo };

export function connectionRepo(rc: RequestContext): ConnectionRepo {
  if (!rc.client) {
    if (!g.__rhoeDevConnections) {
      g.__rhoeDevConnections = new MemoryConnectionRepo();
      g.__rhoeDevConnections.grantAdmin(DEV_CONTEXT.account_id, DEV_CONTEXT.user_id!);
    }
    return g.__rhoeDevConnections;
  }
  return supabaseConnectionRepo(rc.client);
}

/**
 * `WORKEDGE_MCP_URL` is a plain variable in wrangler.jsonc (one WorkEdge for every account);
 * `RHOE_CONNECTION_KEY` is the one Worker secret that encrypts every account's key. Neither is
 * `NEXT_PUBLIC_`, so neither reaches a browser (SEC-002).
 */
export function connectionConfig(): ConnectionConfig {
  return { master_key: process.env["RHOE_CONNECTION_KEY"], mcp_url: process.env["WORKEDGE_MCP_URL"] };
}
