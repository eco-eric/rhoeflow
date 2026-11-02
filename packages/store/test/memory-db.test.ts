import { describe, expect, it } from "vitest";
import { MemoryStoreDb } from "../src/index.js";
import { acceptedRanch, makeDeps } from "./helpers.js";

const at = "2026-10-25T12:00:00.000Z";
const JOB = "0f1e2d3c-4b5a-4968-8777-66554433bb01";
const job = {
  job_id: JOB,
  account_id: "we_team_fixture",
  name: "Fixture job",
  customer_name: null,
  address_line1: null,
  address_line2: null,
  city: null,
  state: null,
  postal_code: null,
  workedge_project_id: "we_project_1",
  workedge_property_id: "we_property_1",
  created_at: at,
  updated_at: at,
  created_by: null,
};
const base = {
  assessment_id: "0f1e2d3c-4b5a-4968-8777-66554433aa11",
  account_id: "we_team_fixture",
  job_id: JOB,
  workedge_project_id: "we_project_1",
  workedge_property_id: "we_property_1",
  workedge_customer_id: null,
  status: "open" as const,
  revision: 0,
  draft: null,
  draft_version: 1,
  template_id: null,
  template_version: null,
  created_at: at,
  updated_at: at,
  created_by: null,
};

describe("MemoryStoreDb mirrors the SQL constraints", () => {
  it("one open assessment per job, and only on the account's own job (ADR-040)", async () => {
    const db = new MemoryStoreDb();
    await db.jobs.insert(job);
    await db.assessments.insert(base);
    await expect(db.assessments.insert({ ...base, assessment_id: "0f1e2d3c-4b5a-4968-8777-66554433aa12" })).rejects.toMatchObject({ code: "conflict" });
    await expect(db.assessments.insert({ ...base, assessment_id: "0f1e2d3c-4b5a-4968-8777-66554433aa13", account_id: "we_team_other" })).rejects.toMatchObject({ code: "forbidden" });
    await db.assessments.setStatus("we_team_fixture", base.assessment_id, "closed", at);
    await expect(db.assessments.insert({ ...base, assessment_id: "0f1e2d3c-4b5a-4968-8777-66554433aa12" })).resolves.toBeTruthy();
  });

  it("a job is linked to WorkEdge once and one job per WorkEdge project (ADR-040)", async () => {
    const db = new MemoryStoreDb();
    const local = { ...job, job_id: "0f1e2d3c-4b5a-4968-8777-66554433bb02", workedge_project_id: null, workedge_property_id: null };
    await db.jobs.insert(job);
    await db.jobs.insert(local);
    await expect(db.jobs.insert({ ...job, job_id: "0f1e2d3c-4b5a-4968-8777-66554433bb03" })).rejects.toMatchObject({ code: "conflict" });
    await expect(db.jobs.linkWorkEdge("we_team_fixture", local.job_id, "we_project_1", null, at)).rejects.toMatchObject({ code: "conflict" });
    expect(await db.jobs.linkWorkEdge("we_team_fixture", local.job_id, "we_project_2", "we_property_2", at)).toMatchObject({ workedge_project_id: "we_project_2" });
    expect(await db.jobs.linkWorkEdge("we_team_fixture", local.job_id, "we_project_3", null, at)).toBeNull();
    expect(await db.jobs.get("we_team_other", JOB)).toBeNull();
  });

  it("revision numbers grow by exactly one and a revision belongs to its team's assessment", async () => {
    const deps = makeDeps();
    const { assessment_id, accepted } = await acceptedRanch(deps);
    await expect(deps.db.assessments.markAccepted("we_team_fixture", assessment_id, accepted.assessment.draft_version, 5, at)).rejects.toMatchObject({ code: "conflict" });
    await expect(deps.db.revisions.insert({ ...accepted.revision, revision: 2, account_id: "we_team_other" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(deps.db.revisions.insert({ ...accepted.revision })).rejects.toMatchObject({ code: "conflict" });
  });

  it("team scoping: reads filter by team, child rows must belong to the team's assessment", async () => {
    const deps = makeDeps();
    const { assessment_id } = await acceptedRanch(deps);
    expect(await deps.db.assessments.get("we_team_other", assessment_id)).toBeNull();
    expect(await deps.db.assessments.listByTemplate("we_team_other", "dfw-pre1980-ranch-slab")).toEqual([]);
    await expect(
      deps.db.scenarios.insert({ scenario_id: "00000000-0000-4000-8000-0000000000ee", assessment_id, account_id: "we_team_other", name: "x", overrides: [], scenario_version: 1, created_at: at, updated_at: at, created_by: null }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
