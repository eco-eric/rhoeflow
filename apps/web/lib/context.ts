import type { SupabaseClient } from "@supabase/supabase-js";
import { StoreError, type StoreContext, type StoreDeps } from "@rhoeflow/store";
import { createSupabaseStore, supabaseAccountsDb } from "@rhoeflow/store/supabase";
import { serverEnv } from "./env";
import { DEV_CONTEXT, DEV_EMAIL, devAccounts, devDeps, devMemoryEnabled } from "./dev";
import { supabaseForRequest } from "./supabase-server";

export interface RequestContext {
  ctx: StoreContext;
  deps: StoreDeps;
  /** The signed-in user's Supabase client; null only in the development memory store. */
  client: SupabaseClient | null;
  /** The signed-in login's email and the account's name, for the header and the settings pages. */
  email: string;
  account_name: string;
}

/** A signed-in login, with or without an account (the "no account yet" page needs the email). */
export interface SignedIn {
  client: SupabaseClient | null;
  user_id: string;
  email: string;
}

/** No session is 401 (`no_session`); the screens send the person to /sign-in. */
export async function requireSignedIn(): Promise<SignedIn> {
  if (devMemoryEnabled()) return { client: null, user_id: DEV_CONTEXT.user_id!, email: DEV_EMAIL };
  const client = await supabaseForRequest();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new StoreError("forbidden", "sign in to RhoeFlow first", { reason: "no_session", http: 401 });
  return { client, user_id: data.user.id, email: data.user.email ?? "" };
}

/**
 * Who is calling and for which account (SEC-001, ADR-039). The account and role come from
 * `rhoe.whoami()`, the same `rhoe.current_account_id()` every row-level security policy uses, so the
 * API and the database cannot disagree, and removing someone takes effect on their next request.
 * No session is 401; a login that belongs to no account is 403 with reason `no_account`.
 */
export async function requireContext(): Promise<RequestContext> {
  if (devMemoryEnabled()) {
    const w = await devAccounts().whoami(DEV_CONTEXT.user_id!);
    return { ctx: { ...DEV_CONTEXT, ...(w ? { account_id: w.account_id, role: w.role } : {}) }, deps: devDeps(), client: null, email: DEV_EMAIL, account_name: w?.account_name ?? "Development account" };
  }
  const who = await requireSignedIn();
  const client = who.client!;
  const w = await supabaseAccountsDb(client).whoami(who.user_id);
  if (!w) throw new StoreError("forbidden", "this login is not part of a RhoeFlow account yet; ask your company's RhoeFlow admin to invite this email", { reason: "no_account" });
  const env = serverEnv();
  return {
    ctx: { account_id: w.account_id, user_id: who.user_id, role: w.role },
    deps: createSupabaseStore(client, { runs_bucket: env.runsBucket }),
    client,
    email: who.email,
    account_name: w.account_name,
  };
}
