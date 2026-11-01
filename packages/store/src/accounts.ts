import type { AccountRole, StoreContext } from "./context.js";
import { StoreError } from "./errors.js";

/**
 * RhoeFlow accounts, members, invites and profiles (ADR-039). An account is a company using
 * RhoeFlow; people are RhoeFlow logins (Supabase Auth). The database is the real guard
 * (`supabase/migrations/20261101110000_rhoe_accounts.up.sql`); `MemoryAccountsDb` mirrors the same
 * rules so these services are tested without one. Every call acts for one signed-in user.
 */

export const ACCOUNT_ROLES = ["admin", "member"] as const;

export interface Whoami {
  account_id: string;
  account_name: string;
  role: AccountRole;
}

export interface MyAccount {
  account_id: string;
  name: string;
  role: AccountRole;
}

export interface MemberView {
  user_id: string;
  email: string;
  full_name: string | null;
  role: AccountRole;
  joined_at: string;
}

export interface InviteView {
  invite_id: string;
  email: string;
  role: AccountRole;
  invited_at: string;
}

export interface Profile {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  current_account_id: string | null;
}

/** Narrow operations, each acting for `user` (the session's user id). */
export interface AccountsDb {
  whoami(user: string): Promise<Whoami | null>;
  myAccounts(user: string): Promise<MyAccount[]>;
  /** False when nothing changed (not an admin of that account). */
  rename(user: string, account_id: string, name: string): Promise<boolean>;
  /** The current account's members. */
  members(user: string): Promise<MemberView[]>;
  /** Throws `conflict` with reason `last_admin` when it would leave no admin. */
  setRole(user: string, account_id: string, member: string, role: AccountRole): Promise<boolean>;
  removeMember(user: string, account_id: string, member: string): Promise<boolean>;
  /** Pending invites of the account (admins only; others get an empty list). */
  invites(user: string, account_id: string): Promise<InviteView[]>;
  /** Throws `conflict` when the email already has a pending invite, `forbidden` for non-admins. */
  invite(user: string, account_id: string, email: string, role: AccountRole): Promise<InviteView>;
  revokeInvite(user: string, account_id: string, invite_id: string): Promise<boolean>;
  /** Accepts every pending invite for the user's confirmed email; returns how many. */
  acceptMyInvites(user: string): Promise<number>;
  profile(user: string): Promise<Profile | null>;
  saveProfile(user: string, patch: { full_name: string | null; phone: string | null }): Promise<Profile>;
  /** Throws `forbidden` when the user is not a member of that account. */
  switchAccount(user: string, account_id: string): Promise<void>;
}

function requireUser(ctx: StoreContext): string {
  if (!ctx.user_id) throw new StoreError("forbidden", "sign in first", { reason: "no_session", http: 401 });
  return ctx.user_id;
}

function requireAdmin(ctx: StoreContext): string {
  const user = requireUser(ctx);
  if (ctx.role !== "admin") throw new StoreError("forbidden", "only this account's admins can do that", { reason: "not_admin" });
  return user;
}

export function parseRole(raw: unknown): AccountRole {
  if (raw === "admin" || raw === "member") return raw;
  throw new StoreError("invalid_request", "role must be admin or member", { reason: "invalid_role" });
}

/** Lower-cased, trimmed, and shaped like an address. Supabase Auth checks the rest. */
export function normalizeEmail(raw: unknown): string {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new StoreError("invalid_request", "enter a valid email address", { reason: "invalid_email" });
  }
  return email;
}

function cleanText(raw: unknown, max: number, what: string): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") throw new StoreError("invalid_request", `${what} must be text`);
  const v = raw.trim();
  if (v.length > max) throw new StoreError("invalid_request", `${what} is too long (at most ${max} characters)`);
  return v === "" ? null : v;
}

export function normalizeAccountName(raw: unknown): string {
  const name = cleanText(raw, 120, "the account name");
  if (!name) throw new StoreError("invalid_request", "the account needs a name", { reason: "invalid_name" });
  return name;
}

export async function renameAccount(db: AccountsDb, ctx: StoreContext, raw: unknown): Promise<string> {
  const user = requireAdmin(ctx);
  const name = normalizeAccountName(raw);
  if (!(await db.rename(user, ctx.account_id, name))) throw new StoreError("forbidden", "only this account's admins can rename it", { reason: "not_admin" });
  return name;
}

export async function listMembers(db: AccountsDb, ctx: StoreContext): Promise<MemberView[]> {
  requireUser(ctx);
  return db.members(requireUser(ctx));
}

export async function changeRole(db: AccountsDb, ctx: StoreContext, member: string, rawRole: unknown): Promise<void> {
  const user = requireAdmin(ctx);
  const role = parseRole(rawRole);
  if (!(await db.setRole(user, ctx.account_id, member, role))) throw new StoreError("not_found", "that person is not in this account");
}

/** Admins remove anyone; anyone may remove themselves (leave). The last admin can do neither. */
export async function removeMember(db: AccountsDb, ctx: StoreContext, member: string): Promise<void> {
  const user = requireUser(ctx);
  if (member !== user && ctx.role !== "admin") throw new StoreError("forbidden", "only this account's admins can remove people", { reason: "not_admin" });
  if (!(await db.removeMember(user, ctx.account_id, member))) throw new StoreError("not_found", "that person is not in this account");
}

export async function listInvites(db: AccountsDb, ctx: StoreContext): Promise<InviteView[]> {
  const user = requireUser(ctx);
  if (ctx.role !== "admin") return [];
  return db.invites(user, ctx.account_id);
}

export async function inviteMember(db: AccountsDb, ctx: StoreContext, rawEmail: unknown, rawRole: unknown): Promise<InviteView> {
  const user = requireAdmin(ctx);
  const email = normalizeEmail(rawEmail);
  const role = parseRole(rawRole);
  const members = await db.members(user);
  if (members.some((m) => m.email.toLowerCase() === email)) {
    throw new StoreError("conflict", `${email} is already in this account`, { reason: "already_member" });
  }
  return db.invite(user, ctx.account_id, email, role);
}

export async function revokeInvite(db: AccountsDb, ctx: StoreContext, invite_id: string): Promise<void> {
  const user = requireAdmin(ctx);
  if (!(await db.revokeInvite(user, ctx.account_id, invite_id))) throw new StoreError("not_found", "that invite is not pending");
}

export async function getProfile(db: AccountsDb, ctx: StoreContext): Promise<Profile> {
  const user = requireUser(ctx);
  return (await db.profile(user)) ?? { user_id: user, full_name: null, phone: null, current_account_id: null };
}

export async function saveProfile(db: AccountsDb, ctx: StoreContext, body: { full_name?: unknown; phone?: unknown }): Promise<Profile> {
  const user = requireUser(ctx);
  const full_name = cleanText(body.full_name, 120, "your name");
  const phone = cleanText(body.phone, 40, "the phone number");
  if (phone && !/^[0-9+().\-\s]{7,40}$/.test(phone)) throw new StoreError("invalid_request", "the phone number has characters a phone number does not use");
  return db.saveProfile(user, { full_name, phone });
}

export async function switchAccount(db: AccountsDb, ctx: StoreContext, account_id: unknown): Promise<void> {
  const user = requireUser(ctx);
  if (typeof account_id !== "string" || account_id === "") throw new StoreError("invalid_request", "pick an account");
  await db.switchAccount(user, account_id);
}

// -------------------------------------------------------------------------------------------
// In-memory mirror of the SQL rules (tests and the development memory store).
// -------------------------------------------------------------------------------------------

interface MemUser {
  user_id: string;
  email: string;
  confirmed: boolean;
}
interface MemMember {
  account_id: string;
  user_id: string;
  role: AccountRole;
  joined_at: string;
}
interface MemInvite {
  invite_id: string;
  account_id: string;
  email: string;
  role: AccountRole;
  invited_by: string;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

export class MemoryAccountsDb implements AccountsDb {
  readonly users = new Map<string, MemUser>();
  readonly accounts = new Map<string, { account_id: string; name: string }>();
  readonly membersRows: MemMember[] = [];
  readonly invitesRows: MemInvite[] = [];
  readonly profiles = new Map<string, Profile>();
  #clock = Date.parse("2026-11-01T12:00:00Z");
  #n = 0;

  #now(): string {
    this.#clock += 1000;
    return new Date(this.#clock).toISOString();
  }

  /** Test and seed helpers (the SQL equivalents are Supabase Auth and supabase/seed/first_account.sql). */
  addUser(user_id: string, email: string, confirmed = true): void {
    this.users.set(user_id, { user_id, email: email.toLowerCase(), confirmed });
  }
  addAccount(account_id: string, name: string): void {
    this.accounts.set(account_id, { account_id, name });
  }
  addMember(account_id: string, user_id: string, role: AccountRole): void {
    this.membersRows.push({ account_id, user_id, role, joined_at: this.#now() });
  }

  // rhoe.current_account_id()
  #current(user: string): string | null {
    const mine = this.membersRows.filter((m) => m.user_id === user);
    if (mine.length === 0) return null;
    const picked = this.profiles.get(user)?.current_account_id;
    const hit = mine.find((m) => m.account_id === picked);
    if (hit) return hit.account_id;
    return [...mine].sort((a, b) => a.joined_at.localeCompare(b.joined_at) || a.account_id.localeCompare(b.account_id))[0]!.account_id;
  }
  #role(user: string, account_id: string | null): AccountRole | null {
    if (!account_id) return null;
    return this.membersRows.find((m) => m.account_id === account_id && m.user_id === user)?.role ?? null;
  }
  // RLS: writes only in the current account, only as its admin
  #adminOf(user: string, account_id: string): boolean {
    return this.#current(user) === account_id && this.#role(user, account_id) === "admin";
  }
  // trigger account_members_keep_admin
  #keepsAdmin(account_id: string, leaving: string): void {
    const others = this.membersRows.some((m) => m.account_id === account_id && m.role === "admin" && m.user_id !== leaving);
    if (!others) throw new StoreError("conflict", "an account must keep at least one admin", { reason: "last_admin" });
  }

  async whoami(user: string) {
    const account_id = this.#current(user);
    const role = this.#role(user, account_id);
    if (!account_id || !role) return null;
    return { account_id, account_name: this.accounts.get(account_id)!.name, role };
  }
  async myAccounts(user: string) {
    return this.membersRows
      .filter((m) => m.user_id === user)
      .map((m) => ({ account_id: m.account_id, name: this.accounts.get(m.account_id)!.name, role: m.role }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  async rename(user: string, account_id: string, name: string) {
    if (!this.#adminOf(user, account_id)) return false;
    this.accounts.get(account_id)!.name = name;
    return true;
  }
  async members(user: string) {
    const account_id = this.#current(user);
    if (!account_id) return [];
    return this.membersRows
      .filter((m) => m.account_id === account_id)
      .map((m) => ({ user_id: m.user_id, email: this.users.get(m.user_id)?.email ?? "", full_name: this.profiles.get(m.user_id)?.full_name ?? null, role: m.role, joined_at: m.joined_at }));
  }
  async setRole(user: string, account_id: string, member: string, role: AccountRole) {
    if (!this.#adminOf(user, account_id)) return false;
    const row = this.membersRows.find((m) => m.account_id === account_id && m.user_id === member);
    if (!row) return false;
    if (row.role === "admin" && role !== "admin") this.#keepsAdmin(account_id, member);
    row.role = role;
    return true;
  }
  async removeMember(user: string, account_id: string, member: string) {
    if (this.#current(user) !== account_id) return false;
    if (member !== user && !this.#adminOf(user, account_id)) return false;
    const i = this.membersRows.findIndex((m) => m.account_id === account_id && m.user_id === member);
    if (i < 0) return false;
    if (this.membersRows[i]!.role === "admin") this.#keepsAdmin(account_id, member);
    this.membersRows.splice(i, 1);
    return true;
  }
  async invites(user: string, account_id: string) {
    if (!this.#adminOf(user, account_id)) return [];
    return this.invitesRows
      .filter((x) => x.account_id === account_id && !x.accepted_at && !x.revoked_at)
      .map(({ invite_id, email, role, invited_at }) => ({ invite_id, email, role, invited_at }));
  }
  async invite(user: string, account_id: string, email: string, role: AccountRole) {
    if (!this.#adminOf(user, account_id)) throw new StoreError("forbidden", "only this account's admins can invite people", { reason: "not_admin" });
    // unique index account_invites_one_pending
    if (this.invitesRows.some((x) => x.account_id === account_id && x.email === email && !x.accepted_at && !x.revoked_at)) {
      throw new StoreError("conflict", `${email} already has a pending invite`, { reason: "already_invited" });
    }
    const row: MemInvite = { invite_id: `inv-${++this.#n}`, account_id, email, role, invited_by: user, invited_at: this.#now(), accepted_at: null, revoked_at: null };
    this.invitesRows.push(row);
    return { invite_id: row.invite_id, email, role, invited_at: row.invited_at };
  }
  async revokeInvite(user: string, account_id: string, invite_id: string) {
    if (!this.#adminOf(user, account_id)) return false;
    const row = this.invitesRows.find((x) => x.invite_id === invite_id && x.account_id === account_id && !x.accepted_at && !x.revoked_at);
    if (!row) return false;
    row.revoked_at = this.#now();
    return true;
  }
  // rhoe.accept_my_invites()
  async acceptMyInvites(user: string) {
    const u = this.users.get(user);
    if (!u || !u.confirmed) return 0;
    if (!this.profiles.has(user)) this.profiles.set(user, { user_id: user, full_name: null, phone: null, current_account_id: null });
    let n = 0;
    let first: string | null = null;
    for (const inv of this.invitesRows.filter((x) => x.email === u.email && !x.accepted_at && !x.revoked_at)) {
      if (!this.membersRows.some((m) => m.account_id === inv.account_id && m.user_id === user)) this.addMember(inv.account_id, user, inv.role);
      inv.accepted_at = this.#now();
      first ??= inv.account_id;
      n++;
    }
    const p = this.profiles.get(user)!;
    if (first && !p.current_account_id) p.current_account_id = first;
    return n;
  }
  async profile(user: string) {
    const p = this.profiles.get(user);
    return p ? { ...p } : null;
  }
  async saveProfile(user: string, patch: { full_name: string | null; phone: string | null }) {
    const p = this.profiles.get(user) ?? { user_id: user, full_name: null, phone: null, current_account_id: null };
    const next = { ...p, ...patch };
    this.profiles.set(user, next);
    return { ...next };
  }
  // trigger profiles_guard
  async switchAccount(user: string, account_id: string) {
    if (!this.membersRows.some((m) => m.account_id === account_id && m.user_id === user)) {
      throw new StoreError("forbidden", "you are not a member of that account", { reason: "not_member" });
    }
    const p = this.profiles.get(user) ?? { user_id: user, full_name: null, phone: null, current_account_id: null };
    this.profiles.set(user, { ...p, current_account_id: account_id });
  }
}
