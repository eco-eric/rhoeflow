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

  it("refuses every write", async () => {
    await expect(store.saveReport()).rejects.toBeInstanceOf(JobStoreError);
    await expect(store.uploadMedia()).rejects.toMatchObject({ code: "not_implemented" });
  });
});
