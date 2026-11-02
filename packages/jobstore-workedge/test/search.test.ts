import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkEdgeJobStore, listProjectsCaps, resetListProjectsCaps } from "../src/index.js";

const MCP = "https://we.example.supabase.co/functions/v1/mcp";
const TEAM = "team-1";
type Project = { id: string; name: string; status?: string };

/** A stand-in WorkEdge MCP server with `tools/list` and `list_projects`. */
function fake(projects: Project[], schema: Record<string, unknown> | null) {
  const calls: Record<string, unknown>[] = [];
  const fetchSpy = vi.fn<typeof fetch>(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: { name?: string; arguments?: Record<string, unknown> } };
    if (body.method === "tools/list") {
      if (!schema) return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Method not found" } });
      return Response.json({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "list_projects", inputSchema: { properties: schema } }] } });
    }
    const args = body.params.arguments ?? {};
    calls.push(args);
    let rows = projects;
    const q = (args["query"] ?? args["search"]) as string | undefined;
    if (q) rows = rows.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    if (args["status"]) rows = rows.filter((p) => (p.status ?? "active") === args["status"]);
    const start = args["cursor"] ? Number(args["cursor"]) : 0;
    const limit = Number(args["limit"] ?? 50);
    const page = rows.slice(start, start + limit);
    const result = { projects: page, next_cursor: start + limit < rows.length ? String(start + limit) : null };
    return Response.json({ jsonrpc: "2.0", id: body.id, result: { structuredContent: result, content: [{ type: "text", text: JSON.stringify(result) }] } });
  });
  return { calls, store: new WorkEdgeJobStore({ mcp_url: MCP, api_key: "k", team_id: TEAM, fetch: fetchSpy }) };
}

const many = (n: number): Project[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: i === 437 ? "Jamie Lopez garage mini split" : `Job ${i}` }));

describe("searchProjects (ADR-041)", () => {
  afterEach(() => resetListProjectsCaps());

  it("reads what list_projects takes from tools/list", () => {
    expect(listProjectsCaps([{ name: "list_projects", inputSchema: { properties: { search: {}, status: {}, limit: {} } } }])).toEqual({ search: "search", archived: { arg: "status", kind: "status" } });
    expect(listProjectsCaps([{ name: "list_projects", inputSchema: { properties: { limit: {}, cursor: {} } } }])).toEqual({ search: null, archived: null });
    expect(listProjectsCaps([])).toEqual({ search: null, archived: null });
  });

  it("matches names itself when WorkEdge has no search, reading pages of 200", async () => {
    const { store, calls } = fake(many(900), { limit: {}, cursor: {} });
    const r = await store.searchProjects({ team_id: TEAM }, { query: "lopez GARAGE" });
    expect(r.items.map((p) => p.id)).toEqual(["p437"]);
    expect(r.complete).toBe(true);
    expect(r.show_applied).toBe(false);
    expect(calls).toHaveLength(5);
    expect(calls.every((a) => a["limit"] === 200)).toBe(true);
  });

  it("says the search was partial when the account has more than 2,000 jobs", async () => {
    const { store, calls } = fake(many(2500), null);
    const r = await store.searchProjects({ team_id: TEAM }, { query: "job 1" });
    expect(calls).toHaveLength(10);
    expect(r.complete).toBe(false);
    expect(r.items).toHaveLength(25);
    expect(r.next_cursor).toBe("25");
  });

  it("filters archived jobs locally when the list carries a status", async () => {
    const { store } = fake(
      [
        { id: "a", name: "Smith ranch", status: "active" },
        { id: "b", name: "Smith two-story", status: "archived" },
      ],
      { limit: {} },
    );
    expect((await store.searchProjects({ team_id: TEAM }, { query: "smith" })).items.map((p) => p.id)).toEqual(["a"]);
    const arch = await store.searchProjects({ team_id: TEAM }, { query: "smith", show: "archived" });
    expect(arch.items.map((p) => p.id)).toEqual(["b"]);
    expect(arch.show_applied).toBe(true);
  });

  it("uses WorkEdge's own search and status arguments once it offers them", async () => {
    const { store, calls } = fake(
      [
        { id: "a", name: "Smith ranch", status: "active" },
        { id: "b", name: "Smith two-story", status: "archived" },
        { id: "c", name: "Jones", status: "archived" },
      ],
      { search: { type: "string" }, status: { enum: ["active", "archived"] }, limit: {}, cursor: {} },
    );
    const r = await store.searchProjects({ team_id: TEAM }, { query: "smith", show: "archived" });
    expect(calls).toEqual([{ search: "smith", limit: 25, status: "archived" }]);
    expect(r.items.map((p) => p.id)).toEqual(["b"]);
    expect(r.show_applied).toBe(true);
  });

  it("refuses another account's team", async () => {
    const { store } = fake([], null);
    await expect(store.searchProjects({ team_id: "other" }, { query: "x" })).rejects.toMatchObject({ code: "forbidden" });
  });
});
