import { describe, expect, it } from "vitest";
import {
  MemoryAccountsDb,
  StoreError,
  changeRole,
  getProfile,
  inviteMember,
  listInvites,
  listMembers,
  normalizeEmail,
  removeMember,
  renameAccount,
  revokeInvite,
  saveProfile,
  switchAccount,
  type AccountsDb,
  type StoreContext,
} from "../src/index.js";

// Mirrors supabase/tests/accounts.sql on the in-memory database (ADR-039).
const A = "user-admin";
const M = "user-member";
const O = "user-outsider";
const I = "user-invited";
const U = "user-unconfirmed";
const B = "user-b-admin";

function setup() {
  const db = new MemoryAccountsDb();
  db.addUser(A, "a@example.com");
  db.addUser(M, "m@example.com");
  db.addUser(O, "o@example.com");
  db.addUser(I, "i@example.com");
  db.addUser(U, "u@example.com", false);
  db.addUser(B, "b@example.com");
  db.addAccount("acct-a", "Truficient");
  db.addAccount("acct-b", "Other Co");
  db.addMember("acct-a", A, "admin");
  db.addMember("acct-a", M, "member");
  db.addMember("acct-b", B, "admin");
  return db;
}

/** The context the web layer builds: whoever the database says the user acts as. */
async function ctxFor(db: AccountsDb, user: string): Promise<StoreContext> {
  const w = await db.whoami(user);
  return { account_id: w?.account_id ?? "", user_id: user, ...(w ? { role: w.role } : {}) };
}

async function code(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return e instanceof StoreError ? `${e.code}${e.details?.["reason"] ? `:${String(e.details["reason"])}` : ""}` : String(e);
  }
}

describe("accounts (ADR-039)", () => {
  it("a login with no account has no account", async () => {
    const db = setup();
    expect(await db.whoami(O)).toBeNull();
    expect(await db.myAccounts(O)).toEqual([]);
    expect(await db.acceptMyInvites(O)).toBe(0);
  });

  it("a member uses the account but cannot manage it", async () => {
    const db = setup();
    const m = await ctxFor(db, M);
    expect(m).toMatchObject({ account_id: "acct-a", role: "member" });
    expect((await listMembers(db, m)).map((x) => x.email)).toEqual(["a@example.com", "m@example.com"]);
    expect(await code(renameAccount(db, m, "x"))).toBe("forbidden:not_admin");
    expect(await code(changeRole(db, m, M, "admin"))).toBe("forbidden:not_admin");
    expect(await code(inviteMember(db, m, "x@example.com", "member"))).toBe("forbidden:not_admin");
    expect(await code(removeMember(db, m, A))).toBe("forbidden:not_admin");
    expect(await listInvites(db, m)).toEqual([]);
    // even bypassing the service check, the database rule refuses
    expect(await db.setRole(M, "acct-a", M, "admin")).toBe(false);
    expect(await db.rename(M, "acct-a", "x")).toBe(false);
  });

  it("the admin renames, invites and changes roles; the last admin stays", async () => {
    const db = setup();
    const a = await ctxFor(db, A);
    expect(await renameAccount(db, a, "  Truficient Energy Solutions ")).toBe("Truficient Energy Solutions");
    expect((await db.whoami(A))?.account_name).toBe("Truficient Energy Solutions");
    await inviteMember(db, a, "I@Example.com", "member");
    expect(await code(inviteMember(db, a, "i@example.com", "admin"))).toBe("conflict:already_invited");
    expect(await code(inviteMember(db, a, "m@example.com", "member"))).toBe("conflict:already_member");
    expect(await code(inviteMember(db, a, "not an email", "member"))).toBe("invalid_request:invalid_email");
    expect(await code(inviteMember(db, a, "x@example.com", "owner"))).toBe("invalid_request:invalid_role");
    expect(await code(changeRole(db, a, A, "member"))).toBe("conflict:last_admin");
    expect(await code(removeMember(db, a, A))).toBe("conflict:last_admin");
    await changeRole(db, a, M, "admin");
    await changeRole(db, a, A, "member");
    expect((await db.whoami(A))?.role).toBe("member");
  });

  it("invites are accepted only by the confirmed address, once, and not after withdrawal", async () => {
    const db = setup();
    const a = await ctxFor(db, A);
    await inviteMember(db, a, "i@example.com", "member");
    const u = await inviteMember(db, a, "u@example.com", "member");
    expect(await db.acceptMyInvites(U)).toBe(0);
    await revokeInvite(db, a, u.invite_id);
    expect(await code(revokeInvite(db, a, u.invite_id))).toBe("not_found");
    db.users.get(U)!.confirmed = true;
    expect(await db.acceptMyInvites(U)).toBe(0);
    expect(await db.acceptMyInvites(I)).toBe(1);
    expect(await db.acceptMyInvites(I)).toBe(0);
    expect(await db.whoami(I)).toMatchObject({ account_id: "acct-a", role: "member" });
    expect((await getProfile(db, await ctxFor(db, I))).current_account_id).toBe("acct-a");
    expect(await listInvites(db, a)).toEqual([]);
  });

  it("another account's admin cannot touch this one", async () => {
    const db = setup();
    const b = await ctxFor(db, B);
    expect((await listMembers(db, b)).map((x) => x.email)).toEqual(["b@example.com"]);
    expect(await db.setRole(B, "acct-a", A, "member")).toBe(false);
    expect(await db.rename(B, "acct-a", "x")).toBe(false);
    expect(await db.invites(B, "acct-a")).toEqual([]);
    expect(await code(db.invite(B, "acct-a", "z@example.com", "member"))).toBe("forbidden:not_admin");
    expect(await db.removeMember(B, "acct-a", M)).toBe(false);
  });

  it("switching accounts needs membership, and removal takes effect at once", async () => {
    const db = setup();
    db.addMember("acct-b", M, "member");
    const m = await ctxFor(db, M);
    expect(await code(switchAccount(db, m, "acct-zzz"))).toBe("forbidden:not_member");
    await switchAccount(db, m, "acct-b");
    expect((await db.whoami(M))?.account_id).toBe("acct-b");
    expect((await db.myAccounts(M)).map((x) => x.name)).toEqual(["Other Co", "Truficient"]);
    await removeMember(db, await ctxFor(db, B), M);
    expect((await db.whoami(M))?.account_id).toBe("acct-a");
  });

  it("anyone may leave, except the last admin", async () => {
    const db = setup();
    await removeMember(db, await ctxFor(db, M), M);
    expect(await db.whoami(M)).toBeNull();
    expect(await code(removeMember(db, await ctxFor(db, B), B))).toBe("conflict:last_admin");
  });

  it("profile keeps a name and phone, trimmed and checked", async () => {
    const db = setup();
    const a = await ctxFor(db, A);
    const p = await saveProfile(db, a, { full_name: "  Eric  ", phone: "(214) 555-0100" });
    expect(p).toMatchObject({ full_name: "Eric", phone: "(214) 555-0100" });
    expect(await code(saveProfile(db, a, { phone: "call me" }))).toBe("invalid_request");
    expect(await code(saveProfile(db, a, { full_name: "x".repeat(121) }))).toBe("invalid_request");
    expect((await saveProfile(db, a, { full_name: "", phone: null })).full_name).toBeNull();
    expect((await listMembers(db, a)).find((x) => x.user_id === A)?.full_name).toBeNull();
  });

  it("no session is refused", async () => {
    const db = setup();
    expect(await code(getProfile(db, { account_id: "", user_id: null }))).toBe("forbidden:no_session");
    expect(normalizeEmail(" Eric@EcoSourceIQ.com ")).toBe("eric@ecosourceiq.com");
  });
});
