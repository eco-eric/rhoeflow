import type { StoreDb } from "./db.js";
import type { ObjectStorage } from "./object-storage.js";

/**
 * Who is acting (ADR-039). Built by the HTTP layer from the signed-in session: the RhoeFlow
 * account the database resolves for the user (`rhoe.current_account_id()`, the same function
 * row-level security uses) and the user id. Never from a request body.
 */
export interface StoreContext {
  account_id: string;
  user_id: string | null;
  /** The user's role in the account; absent in tests that do not need it. */
  role?: AccountRole;
  /** The account's name, for sources that cite an account setting (ADR-047); set by the session layer. */
  account_name?: string;
  /** Set by the session layer for account admins; otherwise the template-editor grant list decides. */
  template_editor?: boolean;
}

export type AccountRole = "admin" | "member";

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
