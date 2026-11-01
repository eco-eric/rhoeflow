import { isJobStoreError, type JobStore } from "@rhoeflow/jobstore";
import { WorkEdgeJobStore, checkWorkEdgeKey, type KeyCheck } from "@rhoeflow/jobstore-workedge";
import { StoreError, type StoreContext } from "@rhoeflow/store";
import { MasterKeyError, open, seal, type Sealed } from "./crypto.js";

/**
 * Each account's own WorkEdge connection (ADR-038). An account is the session's
 * `workedge_team_id` (ADR-028, ADR-031); one connection per account; the key is stored only as
 * ciphertext and decrypted for one request at a time. Nothing here ever returns the key.
 */

export type CredentialKind = "api_key" | "oauth";

/** One row of `rhoe.workedge_connections`. */
export interface ConnectionRow extends Sealed {
  workedge_team_id: string;
  credential_kind: CredentialKind;
  /** Last four characters of the key, for display only. */
  key_hint: string;
  connected_by: string | null;
  connected_at: string;
  last_checked_at: string;
}

/** Storage for connection rows and the admin grant list. Row-level security is the real guard in Supabase. */
export interface ConnectionRepo {
  get(team_id: string): Promise<ConnectionRow | null>;
  /** Insert or replace the account's one row. */
  put(row: ConnectionRow): Promise<void>;
  remove(team_id: string): Promise<void>;
  isAdmin(team_id: string, user_id: string): Promise<boolean>;
}

export interface ConnectionConfig {
  /** `RHOE_CONNECTION_KEY`, the one master secret (ADR-038 decision 4). */
  master_key: string | undefined;
  /** `WORKEDGE_MCP_URL`, one value for every account (ADR-038 decision 8). */
  mcp_url: string | undefined;
  fetch?: typeof fetch;
  now?: () => Date;
}

/** What any member of the account may see. Never the key. */
export interface ConnectionStatus {
  connected: boolean;
  credential_kind: CredentialKind | null;
  key_hint: string | null;
  connected_by: string | null;
  connected_at: string | null;
  last_checked_at: string | null;
  /** Whether the caller may connect, replace or disconnect. */
  can_manage: boolean;
}

function nowIso(cfg: ConnectionConfig): string {
  return (cfg.now ?? (() => new Date()))().toISOString();
}

function requireUser(ctx: StoreContext): string {
  if (!ctx.user_id) throw new StoreError("forbidden", "sign in first", { reason: "no_user" });
  return ctx.user_id;
}

async function requireAdmin(repo: ConnectionRepo, ctx: StoreContext): Promise<string> {
  const user = requireUser(ctx);
  if (!(await repo.isAdmin(ctx.team_id, user))) {
    throw new StoreError("forbidden", "only this account's admins can connect or disconnect WorkEdge", { reason: "not_connection_admin" });
  }
  return user;
}

function requireMcpUrl(cfg: ConnectionConfig): string {
  if (!cfg.mcp_url || !/^https:\/\//.test(cfg.mcp_url)) {
    throw new StoreError("unavailable", "the server is not configured for WorkEdge (WORKEDGE_MCP_URL missing)", { reason: "misconfigured" });
  }
  return cfg.mcp_url;
}

function masterError(e: unknown): never {
  if (e instanceof MasterKeyError) {
    // The message names the setting, never a value.
    throw new StoreError("unavailable", `the server is not configured to store WorkEdge keys: ${e.message}`, { reason: "misconfigured" });
  }
  throw e;
}

/**
 * A WorkEdge key as pasted: starts with `sk_` (Jose, 2026-10-29), no spaces, a sane length. The
 * real check is WorkEdge accepting it.
 */
export function normalizeKey(raw: unknown): string {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!/^sk_[^\s]{8,500}$/.test(key)) {
    throw new StoreError("invalid_request", "that does not look like a WorkEdge API key (it starts with sk_)", { reason: "invalid_key_format" });
  }
  return key;
}

function hint(key: string): string {
  return key.slice(-4);
}

export async function connectionStatus(repo: ConnectionRepo, ctx: StoreContext): Promise<ConnectionStatus> {
  const [row, can_manage] = await Promise.all([repo.get(ctx.team_id), ctx.user_id ? repo.isAdmin(ctx.team_id, ctx.user_id) : Promise.resolve(false)]);
  return {
    connected: row !== null,
    credential_kind: row?.credential_kind ?? null,
    key_hint: row?.key_hint ?? null,
    connected_by: row?.connected_by ?? null,
    connected_at: row?.connected_at ?? null,
    last_checked_at: row?.last_checked_at ?? null,
    can_manage,
  };
}

async function checkWithWorkEdge(cfg: ConnectionConfig, key: string): Promise<KeyCheck> {
  try {
    return await checkWorkEdgeKey({ mcp_url: requireMcpUrl(cfg), api_key: key, ...(cfg.fetch ? { fetch: cfg.fetch } : {}) });
  } catch (e) {
    if (isJobStoreError(e)) {
      if (e.code === "unauthorized") throw new StoreError("invalid_request", "WorkEdge did not accept that key. Check it is active in WorkEdge, Settings, Integrations, API Keys.", { reason: "key_refused" });
      if (e.code === "rate_limited") throw new StoreError("unavailable", "WorkEdge's hourly limit for that key is used up; try again later", { reason: "rate_limited" });
      throw new StoreError("unavailable", "WorkEdge could not be reached to check the key; try again", { reason: "workedge_unavailable" });
    }
    throw e;
  }
}

/** Step 1 of connecting: shows the admin what the key sees. Stores nothing. */
export async function previewKey(repo: ConnectionRepo, ctx: StoreContext, cfg: ConnectionConfig, raw_key: unknown): Promise<KeyCheck & { key_hint: string }> {
  await requireAdmin(repo, ctx);
  const key = normalizeKey(raw_key);
  return { ...(await checkWithWorkEdge(cfg, key)), key_hint: hint(key) };
}

/** Step 2: checks the key again, encrypts it for this account and saves it, replacing any earlier key. */
export async function saveConnection(repo: ConnectionRepo, ctx: StoreContext, cfg: ConnectionConfig, raw_key: unknown): Promise<ConnectionStatus> {
  const user = await requireAdmin(repo, ctx);
  const key = normalizeKey(raw_key);
  await checkWithWorkEdge(cfg, key);
  const sealed = await seal(cfg.master_key, ctx.team_id, key).catch(masterError);
  const now = nowIso(cfg);
  await repo.put({ workedge_team_id: ctx.team_id, credential_kind: "api_key", ...sealed, key_hint: hint(key), connected_by: user, connected_at: now, last_checked_at: now });
  return connectionStatus(repo, ctx);
}

export async function disconnect(repo: ConnectionRepo, ctx: StoreContext): Promise<ConnectionStatus> {
  await requireAdmin(repo, ctx);
  await repo.remove(ctx.team_id);
  return connectionStatus(repo, ctx);
}

/**
 * The JobStore for this request, built with the calling account's own key (ADR-038 decision 5).
 * An account that has not connected WorkEdge gets a clear `unavailable` naming the fix.
 */
export async function jobStoreForAccount(repo: ConnectionRepo, ctx: StoreContext, cfg: ConnectionConfig): Promise<JobStore> {
  const mcp_url = requireMcpUrl(cfg);
  const row = await repo.get(ctx.team_id);
  if (!row) throw new StoreError("unavailable", "this account has not connected WorkEdge yet; an admin connects it under Settings, WorkEdge", { reason: "workedge_not_connected" });
  if (row.credential_kind !== "api_key") throw new StoreError("unavailable", "Sign in with WorkEdge is not available yet; reconnect with an API key", { reason: "credential_kind_unsupported" });
  let api_key: string;
  try {
    api_key = await open(cfg.master_key, ctx.team_id, row);
  } catch (e) {
    if (e instanceof MasterKeyError) masterError(e);
    throw new StoreError("unavailable", "the stored WorkEdge key cannot be read; an admin reconnects WorkEdge", { reason: "connection_unreadable" });
  }
  return new WorkEdgeJobStore({ mcp_url, api_key, team_id: ctx.team_id, ...(cfg.fetch ? { fetch: cfg.fetch } : {}) });
}

/** In-memory repo for tests and the development store; mirrors the SQL rules in the migration. */
export class MemoryConnectionRepo implements ConnectionRepo {
  readonly rows = new Map<string, ConnectionRow>();
  readonly admins = new Set<string>();

  grantAdmin(team_id: string, user_id: string): void {
    this.admins.add(`${team_id}\u0000${user_id}`);
  }
  async get(team_id: string) {
    const r = this.rows.get(team_id);
    return r ? { ...r } : null;
  }
  async put(row: ConnectionRow) {
    this.rows.set(row.workedge_team_id, { ...row });
  }
  async remove(team_id: string) {
    this.rows.delete(team_id);
  }
  async isAdmin(team_id: string, user_id: string) {
    return this.admins.has(`${team_id}\u0000${user_id}`);
  }
}
