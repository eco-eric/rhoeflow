import { describe, expect, it } from "vitest";
import {
  CreateJobRequestSchema,
  acceptRevision,
  createJob,
  createOrResumeAssessment,
  findOrCreateJobForWorkEdge,
  getJob,
  jobAddress,
  linkJobToWorkEdge,
  listJobs,
  saveDraft,
  updateJob,
} from "../src/index.js";
import { ctxA, ctxB, localJob, makeDeps } from "./helpers.js";

describe("RhoeFlow's own jobs (ADR-040)", () => {
  it("makes a job from a customer name and an address, named after them when no name is given", async () => {
    const deps = makeDeps();
    const req = CreateJobRequestSchema.parse({ customer_name: " Pat Rivera ", address_line1: "1412 Elm St", city: "Dallas", state: "TX", postal_code: "75201", address_line2: "" });
    const job = await createJob(deps, ctxA(), req);
    expect(job).toMatchObject({ name: "Pat Rivera, 1412 Elm St", customer_name: "Pat Rivera", address_line2: null, workedge_project_id: null, created_by: "we_user_eric" });
    expect(jobAddress(job)).toBe("1412 Elm St, Dallas, TX 75201");
    expect(CreateJobRequestSchema.safeParse({ customer_name: "", address_line1: "x" }).success).toBe(false);
  });

  it("lists the account's jobs newest first, a page at a time, and never another account's", async () => {
    const deps = makeDeps();
    for (let i = 0; i < 3; i++) {
      await createJob(deps, ctxA(), { customer_name: `Customer ${i}`, address_line1: `${i} Main St` });
      deps.tick();
    }
    await createJob(deps, ctxB(), { customer_name: "Other", address_line1: "9 Oak" });
    const p1 = await listJobs(deps, ctxA(), { limit: 2 });
    expect(p1.items.map((j) => j.customer_name)).toEqual(["Customer 2", "Customer 1"]);
    const p2 = await listJobs(deps, ctxA(), { limit: 2, before: p1.next_before });
    expect(p2.items.map((j) => j.customer_name)).toEqual(["Customer 0"]);
    expect(p2.next_before).toBeNull();
    const b = await listJobs(deps, ctxB());
    expect(b.items.map((j) => j.customer_name)).toEqual(["Other"]);
    await expect(getJob(deps, ctxB(), p1.items[0]!.job_id)).rejects.toMatchObject({ code: "not_found" });
    await expect(updateJob(deps, ctxB(), p1.items[0]!.job_id, { name: "mine now" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("edits the name and address but not the link", async () => {
    const deps = makeDeps();
    const job_id = await localJob(deps);
    const j = await updateJob(deps, ctxA(), job_id, { name: "Rivera attic", city: null });
    expect(j).toMatchObject({ name: "Rivera attic", city: null, customer_name: "Pat Rivera" });
  });

  it("opening a WorkEdge job finds the same RhoeFlow job every time", async () => {
    const deps = makeDeps();
    const seed = { project_id: "we_project_9", property_id: "we_property_9", name: "Rivera HVAC", address_line1: "1412 Elm St" };
    const first = await findOrCreateJobForWorkEdge(deps, ctxA(), seed);
    const again = await findOrCreateJobForWorkEdge(deps, ctxA(), seed);
    expect(first.created).toBe(true);
    expect(again).toMatchObject({ created: false, job: { job_id: first.job.job_id } });
    // Another account opening the same WorkEdge id gets its own job, never this one.
    const other = await findOrCreateJobForWorkEdge(deps, ctxB(), seed);
    expect(other.job.job_id).not.toBe(first.job.job_id);
  });

  it("links a job to WorkEdge once; its assessment and the next accepted snapshot carry the ids", async () => {
    const { QUICK_PASS_HOUSES } = await import("@rhoeflow/templates");
    const house = QUICK_PASS_HOUSES[0]!;
    const deps = makeDeps();
    const job_id = await localJob(deps);
    const { assessment } = await createOrResumeAssessment(deps, ctxA(), { job_id, template_id: house.template });
    const saved = await saveDraft(deps, ctxA(), assessment.assessment_id, { draft: { ...(assessment.draft as Record<string, unknown>), x_quick_pass: house.answers }, expected_draft_version: 1 });
    const r1 = await acceptRevision(deps, ctxA(), assessment.assessment_id, { expected_draft_version: saved.draft_version });
    expect(r1.revision.snapshot.job_id).toBe(job_id);
    expect(r1.revision.snapshot.workedge).toEqual({ team_id: "we_team_fixture" });

    const linked = await linkJobToWorkEdge(deps, ctxA(), job_id, { project_id: "we_project_5", property_id: "we_property_5" });
    expect(linked).toMatchObject({ workedge_project_id: "we_project_5", workedge_property_id: "we_property_5" });
    await expect(linkJobToWorkEdge(deps, ctxA(), job_id, { project_id: "we_project_5", property_id: "we_property_5" })).resolves.toMatchObject({ job_id });
    await expect(linkJobToWorkEdge(deps, ctxA(), job_id, { project_id: "we_project_6", property_id: null })).rejects.toMatchObject({ code: "conflict" });
    const other = await localJob(deps);
    await expect(linkJobToWorkEdge(deps, ctxA(), other, { project_id: "we_project_5", property_id: null })).rejects.toMatchObject({ code: "conflict" });

    const row = deps.db.rows.assessments.find((a) => a.assessment_id === assessment.assessment_id)!;
    expect(row).toMatchObject({ workedge_project_id: "we_project_5", workedge_property_id: "we_property_5" });
    // The frozen revision 1 is untouched; a changed draft accepted now carries the link.
    expect(deps.db.rows.revisions[0]!.snapshot.workedge).toEqual({ team_id: "we_team_fixture" });
    const changed = { ...house.answers, bedrooms: { value: 5, state: "measured" as const } };
    const s2 = await saveDraft(deps, ctxA(), assessment.assessment_id, { draft: { ...(row.draft as Record<string, unknown>), x_quick_pass: changed }, expected_draft_version: row.draft_version });
    const r2 = await acceptRevision(deps, ctxA(), assessment.assessment_id, { expected_draft_version: s2.draft_version });
    expect(r2.revision.snapshot.workedge).toEqual({ team_id: "we_team_fixture", project_id: "we_project_5", property_id: "we_property_5" });
  });
});
