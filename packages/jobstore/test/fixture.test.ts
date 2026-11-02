import { describe, expect, it } from "vitest";
import { FIXTURE_JOBS, FixtureJobStore, JobStoreError } from "../src/index.js";

describe("FixtureJobStore (WO-03 A2 stand-in)", () => {
  const store = new FixtureJobStore();
  const ctx = { team_id: "we_team_dev" };

  it("reads its projects and properties with team scoping", async () => {
    const p = await store.getProject(ctx, FIXTURE_JOBS[0]!.project.id);
    expect(p.name).toMatch(/not a real property/);
    expect((await store.getProperty(ctx, p.property_id!)).address.city).toBe("Dallas");
    await expect(store.getProject({ team_id: "we_team_other" }, p.id)).rejects.toMatchObject({ code: "not_found" });
    expect((await store.listPhotos()).items).toEqual([]);
  });

  it("lists only the calling team's jobs, a page at a time", async () => {
    const first = await store.listProjects(ctx, { limit: 1 });
    expect(first.items).toEqual([{ id: FIXTURE_JOBS[0]!.project.id, name: FIXTURE_JOBS[0]!.project.name }]);
    const second = await store.listProjects(ctx, { limit: 1, cursor: first.next_cursor });
    expect(second.items.map((j) => j.id)).toEqual([FIXTURE_JOBS[1]!.project.id]);
    expect(second.next_cursor).not.toBeNull();
    expect((await store.listProjects({ team_id: "we_team_other" })).items).toEqual([]);
  });

  it("searches by name, every word in any order, active or archived (ADR-041)", async () => {
    expect((await store.searchProjects(ctx, { query: "ranch" })).items.map((j) => j.id)).toEqual(["we_project_dev_1"]);
    expect((await store.searchProjects(ctx, { query: "RANCH 1985", show: "archived" })).items.map((j) => j.id)).toEqual(["we_project_dev_3"]);
    expect((await store.searchProjects(ctx, { query: "ranch", show: "all" })).items).toHaveLength(2);
    expect((await store.searchProjects(ctx, { query: "nothing like this" })).items).toEqual([]);
    expect((await store.searchProjects({ team_id: "we_team_other" }, { query: "ranch", show: "all" })).items).toEqual([]);
  });

  it("refuses every write", async () => {
    await expect(store.saveReport()).rejects.toBeInstanceOf(JobStoreError);
    await expect(store.uploadMedia()).rejects.toMatchObject({ code: "not_implemented" });
  });
});
