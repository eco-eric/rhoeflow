import { describe, expect, it, vi } from "vitest";
import { JobStoreError } from "@rhoeflow/jobstore";
import { WORKEDGE_CALLS, WorkEdgeJobStore, checkWorkEdgeKey, equipmentKind, parseAddress } from "../src/index.js";

const TEAM = "team-a";
const ctx = { team_id: TEAM };
const MCP = "https://workedge.test/functions/v1/mcp";
const KEY = "sk_test_0123456789abcdef";
const P1 = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-01T12:00:00Z");

type Handler = (args: Record<string, unknown>) => unknown;

/** A stand-in for WorkEdge's MCP server: one handler per tool, replies shaped like the real server's. */
function fakeWorkEdge(tools: Record<string, Handler>, opts: { status?: number } = {}) {
  const calls: { name: string; args: Record<string, unknown>; headers: Headers; url: string }[] = [];
  const fetchSpy = vi.fn<typeof fetch>(async (input, init) => {
    const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: { name: string; arguments: Record<string, unknown> } };
    calls.push({ name: body.params.name, args: body.params.arguments, headers: new Headers(init?.headers), url: String(input) });
    if (opts.status) return new Response(JSON.stringify({ error: "x" }), { status: opts.status });
    const h = tools[body.params.name];
    if (!h) return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32602, message: `Unknown tool: ${body.params.name}` } });
    try {
      const result = h(body.params.arguments);
      return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result } });
    } catch (e) {
      return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: (e as Error).message }], isError: true } });
    }
  });
  return { fetchSpy, calls };
}

function store(fetchSpy: typeof fetch) {
  return new WorkEdgeJobStore({ mcp_url: MCP, api_key: KEY, team_id: TEAM, fetch: fetchSpy, now: () => NOW });
}

async function failure(p: Promise<unknown>): Promise<JobStoreError> {
  const e = await p.then(
    () => {
      throw new Error("expected a failure");
    },
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(JobStoreError);
  return e as JobStoreError;
}

const GET_PROJECT = {
  project: { id: P1, name: "Jamie garage mini split", status: "active", created_at: "2026-10-20T15:00:00Z", photo_count: 3 },
  property: { id: "prop-1", name: "Jamie house", address: "123 Main St, Dallas, TX 75201", property_type: "residential" },
  primary_contact: { id: "cust-1", name: "Jamie" },
  secondary_contact: null,
  counts: { photos: 3, videos: 0, notes: 0, reports: 0, equipment: 1 },
};

describe("WorkEdgeJobStore over MCP (ADR-031, ADR-038)", () => {
  it("sends the account's key only in the Authorization header, as a JSON-RPC tools/call", async () => {
    const { fetchSpy, calls } = fakeWorkEdge({ get_project: () => GET_PROJECT });
    await store(fetchSpy).getProject(ctx, P1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(MCP);
    expect(calls[0]!.url).not.toContain(KEY);
    expect(calls[0]!.headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(calls[0]!.name).toBe("get_project");
    expect(calls[0]!.args).toEqual({ project_id: P1 });
  });

  it("maps get_project to Project and keeps the property for getProperty", async () => {
    const { fetchSpy, calls } = fakeWorkEdge({ get_project: () => GET_PROJECT });
    const s = store(fetchSpy);
    const project = await s.getProject(ctx, P1);
    expect(project).toEqual({ id: P1, team_id: TEAM, property_id: "prop-1", customer_id: "cust-1", name: "Jamie garage mini split", status: "active", created_at: "2026-10-20T15:00:00Z" });
    const property = await s.getProperty(ctx, "prop-1");
    expect(property.address).toEqual({ text: "123 Main St, Dallas, TX 75201", line1: "123 Main St", line2: null, city: "Dallas", state: "TX", postal_code: "75201" });
    expect(property.year_built).toBeNull();
    expect(property.conditioned_floor_area_ft2).toBeNull();
    expect(property.property_type).toBe("residential");
    expect(calls).toHaveLength(1);
  });

  it("getProperty without a prior project read uses WorkEdge's api-properties with the same key", async () => {
    const seen: { url: string; method: string | undefined; key: string | null; auth: string | null }[] = [];
    const f = vi.fn<typeof fetch>(async (input, init) => {
      const h = new Headers(init?.headers);
      seen.push({ url: String(input), method: init?.method, key: h.get("x-api-key"), auth: h.get("authorization") });
      return Response.json({ property: { id: "prop-1", name: "Smith home", address: "123 Main St, Plano, TX 75023", property_type: "residential", latitude: 33, longitude: -96.7 } });
    });
    const s = store(f);
    const p = await s.getProperty(ctx, "prop-1");
    expect(p).toMatchObject({ id: "prop-1", team_id: TEAM, address: { text: "123 Main St, Plano, TX 75023", city: "Plano", state: "TX", postal_code: "75023" } });
    expect(seen).toEqual([{ url: "https://workedge.test/functions/v1/api-properties/prop-1", method: "GET", key: KEY, auth: null }]);
    await s.getProperty(ctx, "prop-1");
    expect(f).toHaveBeenCalledTimes(1); // second read served from the request cache
  });

  it("getProperty maps WorkEdge's 404 to not_found and 401 to unauthorized", async () => {
    const notFound = vi.fn<typeof fetch>(async () => Response.json({ error: "Property not found" }, { status: 404 }));
    expect((await failure(store(notFound).getProperty(ctx, "nope"))).code).toBe("not_found");
    const refused = vi.fn<typeof fetch>(async () => Response.json({ error: "Invalid or inactive API key" }, { status: 401 }));
    const e = await failure(store(refused).getProperty(ctx, "prop-1"));
    expect(e.code).toBe("unauthorized");
    expect(e.message).not.toContain(KEY);
  });

  it("a project with no property maps to property_id null", async () => {
    const { fetchSpy } = fakeWorkEdge({ get_project: () => ({ ...GET_PROJECT, property: null, primary_contact: null }) });
    const p = await store(fetchSpy).getProject(ctx, P1);
    expect(p.property_id).toBeNull();
    expect(p.customer_id).toBeNull();
  });

  it("lists photos with paging passed through and signed links that expire with WorkEdge's", async () => {
    const { fetchSpy, calls } = fakeWorkEdge({
      list_photos: (a) => ({
        photos: [
          { id: "ph-1", timestamp: "2026-10-20T15:01:00Z", gps_coordinates: { latitude: 32.78, longitude: -96.8 }, caption: "Attic", url: "https://cdn.test/project-photos/a/ph-1.JPG?token=t", ai_description: "x" },
          { id: "ph-2", timestamp: null, gps_coordinates: null, caption: null, url: null },
        ],
        next_cursor: a["cursor"] ? null : "NTA=",
        url_expires_in_seconds: 3600,
      }),
    });
    const s = store(fetchSpy);
    const page = await s.listPhotos(ctx, P1, { limit: 500 });
    expect(calls[0]!.args).toEqual({ project_id: P1, limit: 200 });
    expect(page.next_cursor).toBe("NTA=");
    expect(page.items[0]).toEqual({
      id: "ph-1", kind: "photo", project_id: P1, category: null, caption: "Attic", captured_at: "2026-10-20T15:01:00Z",
      content_type: "image/jpeg", exif: null, gps: { lat: 32.78, lng: -96.8 }, transcript: null,
      signed_url: { url: "https://cdn.test/project-photos/a/ph-1.JPG?token=t", expires_at: "2026-11-01T13:00:00.000Z" },
    });
    expect(page.items[1]!.signed_url).toBeNull();
    expect(page.items[1]!.gps).toBeNull();
    const next = await s.listPhotos(ctx, P1, { cursor: "NTA=" });
    expect(calls[1]!.args).toEqual({ project_id: P1, limit: 50, cursor: "NTA=" });
    expect(next.next_cursor).toBeNull();
  });

  it("refuses a photo category filter instead of silently returning nothing", async () => {
    const { fetchSpy } = fakeWorkEdge({});
    expect((await failure(store(fetchSpy).listPhotos(ctx, P1, { category: "Attic / insulation" }))).code).toBe("not_implemented");
  });

  it("lists videos", async () => {
    const { fetchSpy } = fakeWorkEdge({
      list_videos: () => ({ videos: [{ id: "v-1", title: "Walkthrough", caption: null, timestamp: "2026-10-20T15:05:00Z", video_url: "https://cdn.test/v-1.mp4?t=1", transcript_status: "ready" }], next_cursor: null }),
    });
    const page = await store(fetchSpy).listVideos(ctx, P1);
    expect(page.items[0]).toMatchObject({ id: "v-1", kind: "video", caption: "Walkthrough", content_type: "video/mp4", transcript: null });
  });

  it("lists equipment by project or by property and reads nameplate links", async () => {
    const { fetchSpy, calls } = fakeWorkEdge({
      list_equipment: () => ({
        equipment: [
          { id: "eq-1", equipment_type: "Heat Pump", manufacturer: "Mitsubishi", model_number: "MXZ-3C24NA", serial_number: "S1", installed_date: "2019-05-02", project_id: P1, property_id: "prop-1", photos: [{ photo_id: "ph-9", link_type: "nameplate" }, { photo_id: "ph-8", link_type: "install" }] },
          { id: "eq-2", equipment_type: null, manufacturer: null, model_number: null, serial_number: null, installed_date: null, project_id: null, property_id: null },
        ],
      }),
    });
    const s = store(fetchSpy);
    const page = await s.listEquipment(ctx, { project_id: P1 });
    expect(calls[0]!.args).toEqual({ project_id: P1 });
    expect(page.next_cursor).toBeNull();
    expect(page.items[0]).toEqual({ id: "eq-1", project_id: P1, property_id: "prop-1", kind: "outdoor_unit", manufacturer: "Mitsubishi", model: "MXZ-3C24NA", serial: "S1", installed_year: 2019, nameplate_media_ids: ["ph-9"], source: null });
    expect(page.items[1]).toMatchObject({ kind: "other", installed_year: null, project_id: P1, nameplate_media_ids: [] });
    await s.listEquipment(ctx, { project_id: P1, property_id: "prop-1" });
    expect(calls[1]!.args).toEqual({ property_id: "prop-1" });
    expect((await s.listEquipment(ctx, { project_id: P1 }, { cursor: "x" })).items).toEqual([]);
  });

  it("maps WorkEdge failures to error codes callers branch on, without echoing the key", async () => {
    for (const [status, code] of [[401, "unauthorized"], [429, "rate_limited"], [500, "unavailable"], [403, "forbidden"]] as const) {
      const { fetchSpy } = fakeWorkEdge({}, { status });
      const err = await failure(store(fetchSpy).getProject(ctx, P1));
      expect(err.code).toBe(code);
      expect(err.message).not.toContain(KEY);
    }
    const nf = fakeWorkEdge({
      get_project: () => {
        throw new Error(`Project ${P1} not found`);
      },
    });
    expect((await failure(store(nf.fetchSpy).getProject(ctx, P1))).code).toBe("not_found");
    const down = vi.fn<typeof fetch>(() => Promise.reject(new TypeError("fetch failed")));
    expect((await failure(store(down).getProject(ctx, P1))).code).toBe("unavailable");
  });

  it("refuses a request from another account than the one the key belongs to", async () => {
    const { fetchSpy } = fakeWorkEdge({ get_project: () => GET_PROJECT });
    expect((await failure(store(fetchSpy).getProject({ team_id: "team-b" }, P1))).code).toBe("forbidden");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("writes validate the ADR-030 source, then wait on KAN-125, and never call WorkEdge", async () => {
    const { fetchSpy } = fakeWorkEdge({});
    const s = store(fetchSpy);
    const wb = { source: "rhoeflow" as const, assessment_id: "asmt-1", run_id: "run-1" };
    const bad = await failure(s.addNote(ctx, { ...wb, source: "other" as never, project_id: P1, body: "b", run_url: "https://rhoeflow.pro/r/1" }));
    expect(bad.code).toBe("invalid_request");
    for (const p of [
      s.saveReport(ctx, { ...wb, project_id: P1, report_type: "engineering", title: "t", file_name: "r.pdf", content_type: "application/pdf", content: new Uint8Array([1]) }),
      s.addNote(ctx, { ...wb, project_id: P1, body: "b", run_url: "https://rhoeflow.pro/r/1" }),
      s.upsertEquipment(ctx, { ...wb, project_id: P1, property_id: null, equipment_id: null, kind: "outdoor_unit", manufacturer: null, model: null, serial: null, installed_year: null, nameplate_media_ids: [] }),
      s.uploadMedia(ctx, { project_id: P1, kind: "photo", category: "Attic / insulation", caption: null, assessment_id: "asmt-1", file_name: "a.jpg", content_type: "image/jpeg", content: new Uint8Array([1]), captured_at: null, metadata: null }),
    ]) {
      const err = await failure(p);
      expect(err.code).toBe("not_implemented");
      expect(err.message).toMatch(/KAN-125/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lists the account's jobs a page at a time", async () => {
    const { fetchSpy, calls } = fakeWorkEdge({ list_projects: () => ({ projects: [{ id: "a", name: "Job A" }, { id: "b", name: "Job B" }], next_cursor: "Mg==" }) });
    expect(await store(fetchSpy).listProjects(ctx, { limit: 2, cursor: "MA==" })).toEqual({ items: [{ id: "a", name: "Job A" }, { id: "b", name: "Job B" }], next_cursor: "Mg==" });
    expect(calls[0]!.args).toEqual({ limit: 2, cursor: "MA==" });
  });

  it("refuses to list another account's jobs", async () => {
    const { fetchSpy } = fakeWorkEdge({ list_projects: () => ({ projects: [], next_cursor: null }) });
    expect((await failure(store(fetchSpy).listProjects({ team_id: "someone-else" }))).code).toBe("forbidden");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("documents the nine operations and the job list with their availability", () => {
    expect(Object.keys(WORKEDGE_CALLS).sort()).toEqual(["addNote", "getProject", "getProperty", "listEquipment", "listPhotos", "listProjects", "listVideos", "saveReport", "searchProjects", "uploadMedia", "upsertEquipment"]);
    expect(WORKEDGE_CALLS["listPhotos"]!.availability).toBe("mcp-live");
    expect(WORKEDGE_CALLS["uploadMedia"]!.availability).toBe("kan-125-pending");
  });

  it("refuses a non-https WorkEdge address", () => {
    expect(() => new WorkEdgeJobStore({ mcp_url: "http://workedge.test/mcp", api_key: KEY, team_id: TEAM })).toThrow(/https/);
  });
});

describe("checkWorkEdgeKey (ADR-038 decision 6)", () => {
  it("returns up to five project names the key sees", async () => {
    const { fetchSpy, calls } = fakeWorkEdge({ list_projects: () => ({ projects: [{ id: "a", name: "Job A" }, { id: "b", name: "Job B" }], next_cursor: "NQ==" }) });
    expect(await checkWorkEdgeKey({ mcp_url: MCP, api_key: KEY, fetch: fetchSpy })).toEqual({ sample_projects: ["Job A", "Job B"], more: true });
    expect(calls[0]!.args).toEqual({ limit: 5 });
  });

  it("a refused key is unauthorized", async () => {
    const { fetchSpy } = fakeWorkEdge({}, { status: 401 });
    expect((await failure(checkWorkEdgeKey({ mcp_url: MCP, api_key: KEY, fetch: fetchSpy }))).code).toBe("unauthorized");
  });
});

describe("address and equipment mapping", () => {
  it("parses common US address text and keeps anything else as text only", () => {
    expect(parseAddress("4500 Oak Lawn Ave, Suite 2, Dallas, TX 75219-1234")).toEqual({ text: "4500 Oak Lawn Ave, Suite 2, Dallas, TX 75219-1234", line1: "4500 Oak Lawn Ave", line2: "Suite 2", city: "Dallas", state: "TX", postal_code: "75219-1234" });
    expect(parseAddress("12 Elm St, Plano, TX 75024, USA").city).toBe("Plano");
    expect(parseAddress("Lot 7 behind the barn")).toEqual({ text: "Lot 7 behind the barn", line1: "Lot 7 behind the barn", line2: null, city: null, state: null, postal_code: null });
  });

  it("maps free-text equipment types conservatively", () => {
    expect(equipmentKind("AC Unit")).toBe("outdoor_unit");
    expect(equipmentKind("Furnace")).toBe("furnace");
    expect(equipmentKind("Mini Split Indoor Head")).toBe("indoor_unit");
    expect(equipmentKind("Air Handler")).toBe("air_handler");
    expect(equipmentKind("Smart Thermostat")).toBe("thermostat");
    expect(equipmentKind("Water Heater")).toBe("other");
    expect(equipmentKind(null)).toBe("other");
  });
});
