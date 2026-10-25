import type { SupabaseClient } from "@supabase/supabase-js";
import { StoreError, type StoreContext, type StoreDeps } from "@rhoeflow/store";
import { createSupabaseStore } from "@rhoeflow/store/supabase";
import { serverEnv } from "./env";
import { DEV_CONTEXT, devDeps, devMemoryEnabled } from "./dev";
import { supabaseForRequest } from "./supabase-server";

export interface RequestContext {
  ctx: StoreContext;
  deps: StoreDeps;
  /** The signed-in user's Supabase client; null only in the development memory store. */
  client: SupabaseClient | null;
}

/**
 * Who is calling (SEC-001). The team id comes from the session's `app_metadata.workedge_team_id`,
 * the same claim `rhoe.current_team_id()` reads in the database, so the API and the row-level
 * security policies cannot disagree. WO-03 A1 confirms the claim path; this and the SQL function
 * are the two places to change if it differs. No session is 401; a session without a team is 403.
 *
 * Template edit rights are decided by the grant list in the database (owner decision 5); a role
 * claim, if A1 finds one, would be mapped onto `template_editor` here.
 */
export async function requireContext(): Promise<RequestContext> {
  if (devMemoryEnabled()) return { ctx: DEV_CONTEXT, deps: devDeps(), client: null };
  const client = await supabaseForRequest();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new StoreError("forbidden", "sign in to WorkEdge first", { reason: "no_session", http: 401 });
  const meta = (data.user.app_metadata ?? {}) as Record<string, unknown>;
  const team = typeof meta["workedge_team_id"] === "string" ? (meta["workedge_team_id"] as string) : null;
  if (!team) throw new StoreError("forbidden", "this sign-in carries no WorkEdge team; ask the office to link your account", { reason: "no_team" });
  const env = serverEnv();
  return {
    ctx: { team_id: team, user_id: data.user.id },
    deps: createSupabaseStore(client, { runs_bucket: env.runsBucket }),
    client,
  };
}
