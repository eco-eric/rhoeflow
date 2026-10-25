import { describe, expect, it } from "vitest";
import { JobStoreError, isLocalMediaId } from "@rhoeflow/jobstore";
import { LocalJobStore, MemoryMediaStorage, SupabaseMediaStorage, type SupabaseStorageLike } from "../src/index.js";

const ctx = { team_id: "we_team_1" };
const ids = ["aaaaaaaa-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-000000000002"];

function makeStore() {
  const storage = new MemoryMediaStorage();
  let i = 0;
  const store = new LocalJobStore({ storage, id: () => ids[i++ % ids.length]!, now: () => new Date("2026-10-24T12:00:00Z") });
  return { storage, store };
}

const photo = {
  project_id: "we_project_1",
  kind: "photo" as const,
  category: "Attic / insulation",
  caption: "blown cellulose, tape in frame",
  assessment_id: "0f1e2d3c-4b5a-4968-8777-66554433aa11",
  file_name: "IMG_0001.jpg",
  content_type: "image/jpeg",
  content: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
  captured_at: "2026-10-24T11:58:00-05:00",
  metadata: { rhoe_field: "building.enclosure.floors[0].insulation_assembly_r_value" },
};

describe("LocalJobStore.uploadMedia (ADR-031 interim)", () => {
  it("stores the bytes and a sidecar and returns a local: id", async () => {
    const { storage, store } = makeStore();
    const r = await store.uploadMedia(ctx, photo);
    expect(r).toEqual({ media_id: `local:${ids[0]}`, kind: "photo", stored_in: "local" });
    expect(isLocalMediaId(r.media_id)).toBe(true);

    const path = `we_team_1/we_project_1/${photo.assessment_id}/${ids[0]}.jpg`;
    expect(await storage.exists(path)).toBe(true);
    expect((await storage.get(path))?.bytes).toEqual(photo.content);

    const sidecar = JSON.parse(new TextDecoder().decode((await storage.get(`${path}.meta.json`))!.bytes));
    expect(sidecar).toMatchObject({
      media_id: r.media_id,
      kind: "photo",
      team_id: "we_team_1",
      project_id: "we_project_1",
      assessment_id: photo.assessment_id,
      category: "Attic / insulation",
      object_path: path,
      uploaded_at: "2026-10-24T12:00:00.000Z",
      migrated_to_workedge_media_id: null,
    });
  });

  it("never returns a URL as the evidence id (ADR-028)", async () => {
    const { store } = makeStore();
    const r = await store.uploadMedia(ctx, photo);
    expect(r.media_id).not.toMatch(/^https?:/);
  });

  it("refuses uploads without a project, assessment, category or content", async () => {
    const { store } = makeStore();
    await expect(store.uploadMedia(ctx, { ...photo, project_id: "" })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(store.uploadMedia(ctx, { ...photo, assessment_id: "" })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(store.uploadMedia(ctx, { ...photo, category: "" })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(store.uploadMedia(ctx, { ...photo, content: new Uint8Array() })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(store.uploadMedia({ team_id: "" }, photo)).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("sanitises path segments and infers an extension from the content type", async () => {
    const { storage, store } = makeStore();
    await store.uploadMedia({ team_id: "team/with slash" }, { ...photo, file_name: "noext", content_type: "image/png" });
    expect([...storage.objects.keys()][0]).toBe(`team_with_slash/we_project_1/${photo.assessment_id}/${ids[0]}.png`);
  });

  it("surfaces a storage conflict rather than overwriting", async () => {
    const storage = new MemoryMediaStorage();
    const store = new LocalJobStore({ storage, id: () => ids[0]! });
    await store.uploadMedia(ctx, photo);
    await expect(store.uploadMedia(ctx, photo)).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("LocalJobStore reads and other writes", () => {
  it("never owns jobs: reads throw not_implemented citing ADR-028", async () => {
    const { store } = makeStore();
    for (const p of [store.getProject(ctx, "p"), store.getProperty(ctx, "pr"), store.listEquipment(ctx, { project_id: "p" })]) {
      const err = (await p.catch((e: unknown) => e)) as JobStoreError;
      expect(err).toBeInstanceOf(JobStoreError);
      expect(err.code).toBe("not_implemented");
      expect(err.message).toContain("ADR-028");
    }
  });

  it("saveReport stores a working copy under the run and returns a local: id", async () => {
    const { storage, store } = makeStore();
    const r = await store.saveReport(ctx, {
      source: "rhoeflow", assessment_id: photo.assessment_id, run_id: "run-1", project_id: "we_project_1",
      report_type: "engineering", title: "Manual J block load", file_name: "report.pdf", content_type: "application/pdf", content: new Uint8Array([0x25, 0x50]),
    });
    expect(r).toEqual({ report_id: `local:${ids[0]}`, stored_in: "local" });
    expect(await storage.exists(`we_team_1/we_project_1/${photo.assessment_id}/reports/run-1-${ids[0]}.pdf`)).toBe(true);
  });

  it("writes without the ADR-030 source are rejected as invalid_request", async () => {
    const { store } = makeStore();
    const bad = { source: "rhoeflow" as const, assessment_id: "", run_id: "r", project_id: "p", body: "b", run_url: "u" };
    await expect(store.addNote(ctx, bad)).rejects.toMatchObject({ code: "invalid_request" });
  });
});

describe("SupabaseMediaStorage adapter", () => {
  function fakeStorage(uploadResult: { error: { message: string; statusCode?: string } | null }) {
    const calls: unknown[] = [];
    const storage: SupabaseStorageLike = {
      from: (bucket) => ({
        upload: async (path, body, options) => {
          calls.push({ bucket, path, bytes: body.byteLength, options });
          return { data: uploadResult.error ? null : { path }, error: uploadResult.error };
        },
        download: async () => ({ data: null, error: { message: "not found" } }),
      }),
    };
    return { storage, calls };
  }

  it("uploads without upsert into the configured bucket", async () => {
    const { storage, calls } = fakeStorage({ error: null });
    const adapter = new SupabaseMediaStorage(storage, "rhoe-media");
    await adapter.put("t/p/a/x.jpg", new Uint8Array([1, 2]), "image/jpeg");
    expect(calls).toEqual([{ bucket: "rhoe-media", path: "t/p/a/x.jpg", bytes: 2, options: { contentType: "image/jpeg", upsert: false } }]);
  });

  it("maps storage errors to JobStoreError codes", async () => {
    const dup = new SupabaseMediaStorage(fakeStorage({ error: { message: "The resource already exists", statusCode: "409" } }).storage, "b");
    await expect(dup.put("p", new Uint8Array([1]), "image/jpeg")).rejects.toMatchObject({ code: "conflict" });
    const unauth = new SupabaseMediaStorage(fakeStorage({ error: { message: "new row violates row-level security policy", statusCode: "403" } }).storage, "b");
    await expect(unauth.put("p", new Uint8Array([1]), "image/jpeg")).rejects.toMatchObject({ code: "unauthorized" });
    const down = new SupabaseMediaStorage(fakeStorage({ error: { message: "gateway timeout", statusCode: "504" } }).storage, "b");
    await expect(down.put("p", new Uint8Array([1]), "image/jpeg")).rejects.toMatchObject({ code: "unavailable", retryable: true });
  });
});
