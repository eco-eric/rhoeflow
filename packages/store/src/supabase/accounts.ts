import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountsDb, InviteView, MemberView, MyAccount, Profile, Whoami } from "../accounts.js";
import type { AccountRole } from "../context.js";
import { StoreError } from "../errors.js";

/**
 * Supabase adapter for accounts, members, invites and profiles (ADR-039;
 * migration 20261101110000_rhoe_accounts). The client is the signed-in user's, so row-level
 * security and the `security definer` functions decide everything; the `user` argument is only
 * used where a filter on the caller's own rows is needed. No service-role key (ADR-031).
 */
type PgError = { code?: string; message: string; hint?: string };

function fail(what: string, error: PgError): never {
  if (error.code === "42501") throw new StoreError("forbidden", `${what}: not allowed for this sign-in`, { pg: error.code });
  if (error.code === "23505") throw new StoreError("conflict", `${what}: already exists`, { pg: error.code });
  if (error.code === "P0001") {
    const last = error.hint === "last_admin" || /at least one admin/.test(error.message);
    throw new StoreError("conflict", last ? "an account must keep at least one admin" : error.message, { pg: error.code, ...(last ? { reason: "last_admin" } : {}) });
  }
  if (error.code === "23514") throw new StoreError("invalid_request", `${what}: ${error.message}`, { pg: error.code });
  throw new StoreError("unavailable", `${what}: ${error.message}`, error.code ? { pg: error.code } : undefined);
}

function role(v: unknown): AccountRole {
  if (v === "admin" || v === "member") return v;
  throw new StoreError("unavailable", "accounts: unexpected role from the database");
}

export function supabaseAccountsDb(client: SupabaseClient): AccountsDb {
  const db = client.schema("rhoe");
  return {
    async whoami(): Promise<Whoami | null> {
      const { data, error } = await db.rpc("whoami");
      if (error) fail("read your account", error);
      const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
      if (!r || r["account_id"] == null || r["role"] == null) return null;
      return { account_id: String(r["account_id"]), account_name: String(r["account_name"]), role: role(r["role"]) };
    },
    async myAccounts(user): Promise<MyAccount[]> {
      const { data, error } = await db.from("account_members").select("account_id, role, accounts(name)").eq("user_id", user);
      if (error) fail("list your accounts", error);
      return ((data ?? []) as Record<string, unknown>[])
        .map((r) => {
          const acc = r["accounts"] as { name?: unknown } | { name?: unknown }[] | null;
          const name = Array.isArray(acc) ? acc[0]?.name : acc?.name;
          return { account_id: String(r["account_id"]), name: String(name ?? ""), role: role(r["role"]) };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async rename(_user, account_id, name) {
      const { data, error } = await db.from("accounts").update({ name }).eq("account_id", account_id).select("account_id");
      if (error) fail("rename the account", error);
      return (data ?? []).length === 1;
    },
    async members(): Promise<MemberView[]> {
      const { data, error } = await db.rpc("account_member_list");
      if (error) fail("list members", error);
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        user_id: String(r["user_id"]),
        email: String(r["email"] ?? ""),
        full_name: r["full_name"] == null ? null : String(r["full_name"]),
        role: role(r["role"]),
        joined_at: String(r["joined_at"]),
      }));
    },
    async setRole(_user, account_id, member, r) {
      const { data, error } = await db.from("account_members").update({ role: r }).eq("account_id", account_id).eq("user_id", member).select("user_id");
      if (error) fail("change the role", error);
      return (data ?? []).length === 1;
    },
    async removeMember(_user, account_id, member) {
      const { data, error } = await db.from("account_members").delete().eq("account_id", account_id).eq("user_id", member).select("user_id");
      if (error) fail("remove the member", error);
      return (data ?? []).length === 1;
    },
    async invites(_user, account_id): Promise<InviteView[]> {
      const { data, error } = await db
        .from("account_invites")
        .select("invite_id, email, role, invited_at")
        .eq("account_id", account_id)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .order("invited_at");
      if (error) fail("list invites", error);
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ invite_id: String(r["invite_id"]), email: String(r["email"]), role: role(r["role"]), invited_at: String(r["invited_at"]) }));
    },
    async invite(user, account_id, email, r): Promise<InviteView> {
      const { data, error } = await db
        .from("account_invites")
        .insert({ account_id, email, role: r, invited_by: user })
        .select("invite_id, email, role, invited_at")
        .single();
      if (error) {
        if (error.code === "23505") throw new StoreError("conflict", `${email} already has a pending invite`, { reason: "already_invited" });
        fail("create the invite", error);
      }
      const row = data as Record<string, unknown>;
      return { invite_id: String(row["invite_id"]), email: String(row["email"]), role: role(row["role"]), invited_at: String(row["invited_at"]) };
    },
    async revokeInvite(_user, account_id, invite_id) {
      const { data, error } = await db
        .from("account_invites")
        .update({ revoked_at: new Date().toISOString() })
        .eq("account_id", account_id)
        .eq("invite_id", invite_id)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .select("invite_id");
      if (error) fail("withdraw the invite", error);
      return (data ?? []).length === 1;
    },
    async acceptMyInvites() {
      const { data, error } = await db.rpc("accept_my_invites");
      if (error) fail("accept invites", error);
      return Number(data ?? 0);
    },
    async profile(user): Promise<Profile | null> {
      const { data, error } = await db.from("profiles").select("user_id, full_name, phone, current_account_id").eq("user_id", user).maybeSingle();
      if (error) fail("read your profile", error);
      return (data as Profile | null) ?? null;
    },
    async saveProfile(user, patch): Promise<Profile> {
      const { data, error } = await db
        .from("profiles")
        .upsert({ user_id: user, ...patch }, { onConflict: "user_id" })
        .select("user_id, full_name, phone, current_account_id")
        .single();
      if (error) fail("save your profile", error);
      return data as Profile;
    },
    async switchAccount(user, account_id) {
      const { error } = await db.from("profiles").upsert({ user_id: user, current_account_id: account_id }, { onConflict: "user_id" });
      if (error) {
        if (error.code === "P0001") throw new StoreError("forbidden", "you are not a member of that account", { reason: "not_member" });
        fail("switch account", error);
      }
    },
  };
}
