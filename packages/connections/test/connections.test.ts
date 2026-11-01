import { describe, expect, it, vi } from "vitest";
import { StoreError } from "@rhoeflow/store";
import {
  MemoryConnectionRepo,
  connectionStatus,
  disconnect,
  jobStoreForAccount,
  normalizeKey,
  previewKey,
  saveConnection,
  seal,
  open,
  type ConnectionConfig,
} from "../src/index.js";

const MASTER = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));
const OTHER_MASTER = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => 200 - i)));
const MCP = "https://workedge.test/functions/v1/mcp";
const KEY = "sk_live_abcdefghijklmnop1234";
const TEAM = "team-a";
const ADMIN = "user-admin";
const MEMBER = "user-member";
const NOW = new Date("2026-11-01T12:00:00Z");

function fakeWorkEdge(opts: { status?: number } = {}) {
  const seen: { auth: string | null; tool: string }[] = [];
  const f = vi.fn<typeof fetch>(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { id: number; params: { name: string; arguments: Record<string, unknown> } };
    seen.push({ auth: new Headers(init?.headers).get("authorization"), tool: body.params.name });
    if (opts.status) return new Response("{}", { status: opts.status });
    const result =
      body.params.name === "list_projects"
        ? { projects: [{ id: "p1", name: "Smith HVAC replacement" }, { id: "p2", name: "Jones load calc" }], next_cursor: null }
        : { project: { id: "p1", name: "Smith HVAC replacement", status: "active", created_at: "2026-10-01T00:00:00Z" }, property: null, primary_contact: null, counts: {} };
    return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result } });
  });
  return { f, seen };
}

function setup(opts: { status?: number } = {}) {
  const repo = new MemoryConnectionRepo();
  repo.grantAdmin(TEAM, ADMIN);
  const we = fakeWorkEdge(opts);
  const cfg: ConnectionConfig = { master_key: MASTER, mcp_url: MCP, fetch: we.f, now: () => NOW };
  return { repo, cfg, we };
}

const admin = { account_id: TEAM, user_id: ADMIN };
const member = { account_id: TEAM, user_id: MEMBER };

async function storeError(p: Promise<unknown>): Promise<StoreError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(StoreError);
    return e as StoreError;
  }
  throw new Error("expected a StoreError");
}

describe("crypto", () => {
  it("round-trips, and binds the ciphertext to the account and the master key", async () => {
    const s = await seal(MASTER, TEAM, KEY);
    expect(s.ciphertext).not.toContain("sk_");
    expect(await open(MASTER, TEAM, s)).toBe(KEY);
    await expect(open(MASTER, "team-b", s)).rejects.toThrow();
    await expect(open(OTHER_MASTER, TEAM, s)).rejects.toThrow();
  });
  it("uses a fresh IV each time", async () => {
    const [a, b] = await Promise.all([seal(MASTER, TEAM, KEY), seal(MASTER, TEAM, KEY)]);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
  it("refuses a missing or short master key without echoing it", async () => {
    await expect(seal(undefined, TEAM, KEY)).rejects.toThrow("RHOE_CONNECTION_KEY is not set");
    await expect(seal(btoa("short"), TEAM, KEY)).rejects.toThrow("must be 32 bytes");
  });
});

describe("normalizeKey", () => {
  it("trims a pasted key and rejects anything that is not sk_", () => {
    expect(normalizeKey(`  ${KEY}\n`)).toBe(KEY);
    expect(() => normalizeKey("pk_123456789")).toThrow(StoreError);
    expect(() => normalizeKey("sk_ has spaces in it")).toThrow(StoreError);
    expect(() => normalizeKey(undefined)).toThrow(StoreError);
  });
});

describe("connecting an account", () => {
  it("previews the projects the key sees and stores nothing", async () => {
    const { repo, cfg, we } = setup();
    const r = await previewKey(repo, admin, cfg, KEY);
    expect(r).toEqual({ sample_projects: ["Smith HVAC replacement", "Jones load calc"], more: false, key_hint: "1234" });
    expect(we.seen[0]).toEqual({ auth: `Bearer ${KEY}`, tool: "list_projects" });
    expect(repo.rows.size).toBe(0);
  });

  it("saves only ciphertext and the last four characters", async () => {
    const { repo, cfg } = setup();
    const status = await saveConnection(repo, admin, cfg, KEY);
    expect(status).toMatchObject({ connected: true, credential_kind: "api_key", key_hint: "1234", connected_by: ADMIN, can_manage: true, connected_at: NOW.toISOString() });
    const row = repo.rows.get(TEAM)!;
    expect(JSON.stringify(row)).not.toContain(KEY);
    expect(JSON.stringify(status)).not.toContain(KEY);
    expect(await open(MASTER, TEAM, row)).toBe(KEY);
  });

  it("lets only the account's admins connect, preview or disconnect", async () => {
    const { repo, cfg } = setup();
    expect((await storeError(previewKey(repo, member, cfg, KEY))).code).toBe("forbidden");
    expect((await storeError(saveConnection(repo, member, cfg, KEY))).code).toBe("forbidden");
    expect((await storeError(saveConnection(repo, { account_id: "team-b", user_id: ADMIN }, cfg, KEY))).code).toBe("forbidden");
    await saveConnection(repo, admin, cfg, KEY);
    expect((await storeError(disconnect(repo, member))).code).toBe("forbidden");
    expect((await storeError(saveConnection(repo, { account_id: TEAM, user_id: null }, cfg, KEY))).details?.["reason"]).toBe("no_user");
  });

  it("does not save a key WorkEdge refuses", async () => {
    const { repo, cfg } = setup({ status: 401 });
    const e = await storeError(saveConnection(repo, admin, cfg, KEY));
    expect(e.code).toBe("invalid_request");
    expect(e.details?.["reason"]).toBe("key_refused");
    expect(e.message).not.toContain(KEY);
    expect(repo.rows.size).toBe(0);
  });

  it("reports a used-up hourly limit separately", async () => {
    const { repo, cfg } = setup({ status: 429 });
    expect((await storeError(previewKey(repo, admin, cfg, KEY))).details?.["reason"]).toBe("rate_limited");
  });

  it("names the missing setting when the server is not configured", async () => {
    const { repo, cfg } = setup();
    const e = await storeError(saveConnection(repo, admin, { ...cfg, master_key: undefined }, KEY));
    expect(e.code).toBe("unavailable");
    expect(e.message).toContain("RHOE_CONNECTION_KEY");
    expect((await storeError(previewKey(repo, admin, { ...cfg, mcp_url: undefined }, KEY))).details?.["reason"]).toBe("misconfigured");
  });

  it("shows members the status without letting them manage it", async () => {
    const { repo, cfg } = setup();
    expect(await connectionStatus(repo, member)).toMatchObject({ connected: false, can_manage: false });
    await saveConnection(repo, admin, cfg, KEY);
    expect(await connectionStatus(repo, member)).toMatchObject({ connected: true, key_hint: "1234", can_manage: false });
  });

  it("disconnects", async () => {
    const { repo, cfg } = setup();
    await saveConnection(repo, admin, cfg, KEY);
    expect(await disconnect(repo, admin)).toMatchObject({ connected: false, key_hint: null });
    expect(repo.rows.size).toBe(0);
  });
});

describe("jobStoreForAccount", () => {
  it("reads WorkEdge with the calling account's own key", async () => {
    const { repo, cfg, we } = setup();
    await saveConnection(repo, admin, cfg, KEY);
    const js = await jobStoreForAccount(repo, member, cfg);
    const p = await js.getProject({ team_id: member.account_id, user_id: member.user_id }, "p1");
    expect(p.name).toBe("Smith HVAC replacement");
    expect(p.team_id).toBe(TEAM);
    expect(we.seen.at(-1)).toEqual({ auth: `Bearer ${KEY}`, tool: "get_project" });
  });

  it("keeps accounts apart", async () => {
    const { repo, cfg } = setup();
    repo.grantAdmin("team-b", "user-b");
    await saveConnection(repo, admin, cfg, KEY);
    await saveConnection(repo, { account_id: "team-b", user_id: "user-b" }, cfg, "sk_live_teamBkey_zzzz9999");
    const { seen } = fakeWorkEdge();
    const spy = fakeWorkEdge();
    const js = await jobStoreForAccount(repo, { account_id: "team-b", user_id: null }, { ...cfg, fetch: spy.f });
    await js.getProject({ team_id: "team-b" }, "p1");
    expect(spy.seen[0]!.auth).toBe("Bearer sk_live_teamBkey_zzzz9999");
    expect(seen).toHaveLength(0);
    await expect(js.getProject({ team_id: TEAM }, "p1")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("refuses a row moved onto another account", async () => {
    const { repo, cfg } = setup();
    await saveConnection(repo, admin, cfg, KEY);
    repo.rows.set("team-b", { ...repo.rows.get(TEAM)!, account_id: "team-b" });
    expect((await storeError(jobStoreForAccount(repo, { account_id: "team-b", user_id: null }, cfg))).details?.["reason"]).toBe("connection_unreadable");
  });

  it("says plainly when the account has not connected WorkEdge", async () => {
    const { repo, cfg } = setup();
    const e = await storeError(jobStoreForAccount(repo, member, cfg));
    expect(e.code).toBe("unavailable");
    expect(e.details?.["reason"]).toBe("workedge_not_connected");
  });

  it("is ready for Sign in with WorkEdge rows without reading them yet", async () => {
    const { repo, cfg } = setup();
    await saveConnection(repo, admin, cfg, KEY);
    repo.rows.set(TEAM, { ...repo.rows.get(TEAM)!, credential_kind: "oauth" });
    expect((await storeError(jobStoreForAccount(repo, member, cfg))).details?.["reason"]).toBe("credential_kind_unsupported");
  });
});
