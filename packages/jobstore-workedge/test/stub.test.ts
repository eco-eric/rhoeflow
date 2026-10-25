import { describe, expect, it, vi } from "vitest";
import { JobStoreError } from "@rhoeflow/jobstore";
import { WORKEDGE_CALLS, WorkEdgeJobStore } from "../src/index.js";

const ctx = { team_id: "we_team_1" };
const writeBack = { source: "rhoeflow" as const, assessment_id: "asmt-1", run_id: "run-1" };

function makeStore() {
  const fetchSpy = vi.fn<typeof fetch>(() => Promise.reject(new Error("network must never be called in WO-01")));
  const store = new WorkEdgeJobStore({ base_url: "https://workedge.invalid", api_key: "test-key", fetch: fetchSpy });
  return { store, fetchSpy };
}

async function expectNotImplemented(p: Promise<unknown>, operation: string) {
  await expect(p).rejects.toBeInstanceOf(JobStoreError);
  const err = (await p.catch((e: unknown) => e)) as JobStoreError;
  expect(err.code).toBe("not_implemented");
  expect(err.call).toBe(WORKEDGE_CALLS[operation]!.call);
}

describe("WorkEdgeJobStore (WO-01 stub)", () => {
  it("documents all nine operations", () => {
    expect(Object.keys(WORKEDGE_CALLS).sort()).toEqual(
      ["addNote", "getProject", "getProperty", "listEquipment", "listPhotos", "listVideos", "saveReport", "uploadMedia", "upsertEquipment"],
    );
    expect(WORKEDGE_CALLS["uploadMedia"]!.availability).toBe("not-on-roadmap");
  });

  it("every read throws not_implemented naming the WorkEdge call and never touches the network", async () => {
    const { store, fetchSpy } = makeStore();
    await expectNotImplemented(store.getProject(ctx, "p1"), "getProject");
    await expectNotImplemented(store.getProperty(ctx, "pr1"), "getProperty");
    await expectNotImplemented(store.listPhotos(ctx, "p1"), "listPhotos");
    await expectNotImplemented(store.listVideos(ctx, "p1"), "listVideos");
    await expectNotImplemented(store.listEquipment(ctx, { project_id: "p1" }), "listEquipment");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("every write throws not_implemented once the write-back source is valid", async () => {
    const { store, fetchSpy } = makeStore();
    await expectNotImplemented(
      store.uploadMedia(ctx, {
        project_id: "p1", kind: "photo", category: "Attic / insulation", caption: null, assessment_id: "asmt-1",
        file_name: "a.jpg", content_type: "image/jpeg", content: new Uint8Array([1]), captured_at: null, metadata: null,
      }),
      "uploadMedia",
    );
    await expectNotImplemented(
      store.saveReport(ctx, { ...writeBack, project_id: "p1", report_type: "engineering", title: "t", file_name: "r.pdf", content_type: "application/pdf", content: new Uint8Array([1]) }),
      "saveReport",
    );
    await expectNotImplemented(store.addNote(ctx, { ...writeBack, project_id: "p1", body: "b", run_url: "https://rhoeflow.pro/r/1" }), "addNote");
    await expectNotImplemented(
      store.upsertEquipment(ctx, { ...writeBack, project_id: "p1", property_id: null, equipment_id: null, kind: "outdoor_unit", manufacturer: null, model: null, serial: null, installed_year: null, nameplate_media_ids: [] }),
      "upsertEquipment",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a write without the ADR-030 source before anything else", async () => {
    const { store } = makeStore();
    const bad = { source: "rhoeflow" as const, assessment_id: "", run_id: "run-1", project_id: "p1", body: "b", run_url: "u" };
    const err = (await store.addNote(ctx, bad).catch((e: unknown) => e)) as JobStoreError;
    expect(err).toBeInstanceOf(JobStoreError);
    expect(err.code).toBe("invalid_request");
  });

  it("refuses to construct without credentials", () => {
    expect(() => new WorkEdgeJobStore({ base_url: "", api_key: "k" })).toThrow();
  });
});
