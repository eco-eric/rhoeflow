import type { WorkEdgeId } from "@rhoeflow/schema";
import type { StoreDb } from "./db.js";
import type { ObjectStorage } from "./object-storage.js";

/**
 * Who is acting. Built by the HTTP layer from the Supabase session (standard §7): the team from
 * the JWT claim that row-level security also reads, the user id when there is one. Never from a
 * request body.
 */
export interface StoreContext {
  team_id: WorkEdgeId;
  user_id: string | null;
  /** Set by the session layer when A1 finds a role that may edit templates; otherwise the grant list decides. */
  template_editor?: boolean;
}

export interface StoreDeps {
  db: StoreDb;
  /** Bucket for artifact bundles (`rhoe-runs`). */
  artifacts: ObjectStorage;
  now?: () => Date;
  newId?: () => string;
}

export function nowIso(deps: StoreDeps): string {
  return (deps.now ?? (() => new Date()))().toISOString();
}

export function newId(deps: StoreDeps): string {
  return (deps.newId ?? (() => globalThis.crypto.randomUUID()))();
}
