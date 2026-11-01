import type { SupabaseClient } from "@supabase/supabase-js";
import { StoreError } from "@rhoeflow/store";
import type { ConnectionRepo, ConnectionRow } from "./service.js";

/**
 * Supabase adapter for `rhoe.workedge_connections` and `rhoe.connection_admins` (migration
 * 20261101120000). The client is the signed-in user's, so row-level security decides who may
 * read and write; no service-role key (ADR-031). Members can read their account's row, which holds
 * only ciphertext; only admins can write it.
 */
const SCHEMA = "rhoe";
const COLUMNS = "workedge_team_id, credential_kind, ciphertext, iv, key_version, key_hint, connected_by, connected_at, last_checked_at";

function fail(what: string, error: { code?: string; message: string }): never {
  if (error.code === "42501") throw new StoreError("forbidden", `${what}: not allowed for this sign-in`, { pg: error.code });
  throw new StoreError("unavailable", `${what}: ${error.message}`, error.code ? { pg: error.code } : undefined);
}

function asRow(r: Record<string, unknown>): ConnectionRow {
  const kind = r["credential_kind"];
  if (kind !== "api_key" && kind !== "oauth") throw new StoreError("unavailable", "workedge_connections: unexpected credential kind");
  return {
    workedge_team_id: String(r["workedge_team_id"]),
    credential_kind: kind,
    ciphertext: String(r["ciphertext"]),
    iv: String(r["iv"]),
    key_version: Number(r["key_version"]),
    key_hint: String(r["key_hint"]),
    connected_by: r["connected_by"] == null ? null : String(r["connected_by"]),
    connected_at: String(r["connected_at"]),
    last_checked_at: String(r["last_checked_at"]),
  };
}

export function supabaseConnectionRepo(client: SupabaseClient): ConnectionRepo {
  const db = client.schema(SCHEMA);
  return {
    async get(team_id) {
      const { data, error } = await db.from("workedge_connections").select(COLUMNS).eq("workedge_team_id", team_id).maybeSingle();
      if (error) fail("read WorkEdge connection", error);
      return data ? asRow(data as Record<string, unknown>) : null;
    },
    async put(row) {
      const { error } = await db.from("workedge_connections").upsert(row, { onConflict: "workedge_team_id" });
      if (error) fail("save WorkEdge connection", error);
    },
    async remove(team_id) {
      const { error } = await db.from("workedge_connections").delete().eq("workedge_team_id", team_id);
      if (error) fail("remove WorkEdge connection", error);
    },
    async isAdmin(team_id, user_id) {
      const { data, error } = await db.from("connection_admins").select("workedge_user_id").eq("workedge_team_id", team_id).eq("workedge_user_id", user_id).maybeSingle();
      if (error) fail("read connection admins", error);
      return data !== null;
    },
  };
}
