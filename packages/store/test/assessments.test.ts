import { describe, expect, it } from "vitest";
import { StoreError, acceptRevision, createOrResumeAssessment, getRevision, saveDraft } from "../src/index.js";
import { acceptedRanch, ctxA, ctxB, makeDeps, ranchFixture } from "./helpers.js";

const refs = { project_id: "we_project_1", property_id: "we_property_1" };

describe("create or resume by WorkEdge project (C2; standard §3 entry A)", () => {
  it("creates once and resumes afterwards; the draft skeleton carries the WorkEdge ids and the template", async () => {
    const deps = makeDeps();
    const first = await createOrResumeAssessment(deps, ctxA(), { workedge: refs, template_id: "dfw-pre1980-ranch-slab" });
    expect(first.resumed).toBe(false);
    expect(first.assessment).toMatchObject({ status: "open", revision: 0, draft_version: 1, template_id: "dfw-pre1980-ranch-slab", template_version: null, created_by: "we_user_eric" });
    expect(first.assessment.draft).toMatchObject({ assessment_id: first.assessment.assessment_id, workedge: { team_id: "we_team_fixture", ...refs } });
    const second = await createOrResumeAssessment(deps, ctxA(), { workedge: refs });
    expect(second.resumed).toBe(true);
    expect(second.assessment.assessment_id).toBe(first.assessment.assessment_id);
  });

  it("refuses an unknown template", async () => {
    await expect(createOrResumeAssessment(makeDeps(), ctxA(), { workedge: refs, template_id: "nope" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("another team cannot resume, read or draft it (SEC-001)", async () => {
    const deps = makeDeps();
    const a = await createOrResumeAssessment(deps, ctxA(), { workedge: refs });
    const b = await createOrResumeAssessment(deps, ctxB(), { workedge: refs }).catch((e: unknown) => e);
    // The project id is WorkEdge's; a second team naming it gets a conflict from the one-open-per-project index, never the row.
    expect(b).toBeInstanceOf(StoreError);
    await expect(saveDraft(deps, ctxB(), a.assessment.assessment_id, { draft: a.assessment.draft as Record<string, unknown>, expected_draft_version: 1 })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("drafts and optimistic concurrency (C2; REV-001)", () => {
  it("saves with the version it read and refuses a stale version with the current one in the error", async () => {
    const deps = makeDeps();
    const { assessment } = await createOrResumeAssessment(deps, ctxA(), { workedge: refs });
    const draft = { ...(assessment.draft as Record<string, unknown>), building: { partial: true } };
    const saved = await saveDraft(deps, ctxA(), assessment.assessment_id, { draft, expected_draft_version: 1 });
    expect(saved.draft_version).toBe(2);
    expect(saved.draft).toMatchObject({ building: { partial: true } });
    const err = await saveDraft(deps, ctxA(), assessment.assessment_id, { draft, expected_draft_version: 1 }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "precondition_failed", status: 412, details: { draft_version: 2 } });
  });

  it("a draft cannot be re-pointed at another job (ADR-028)", async () => {
    const deps = makeDeps();
    const { assessment } = await createOrResumeAssessment(deps, ctxA(), { workedge: refs });
    const draft = { ...(assessment.draft as Record<string, unknown>), workedge: { team_id: "we_team_fixture", project_id: "we_project_2", property_id: "we_property_1" } };
    await expect(saveDraft(deps, ctxA(), assessment.assessment_id, { draft, expected_draft_version: 1 })).rejects.toMatchObject({ code: "invalid_request" });
  });
});

describe("accepting a revision (DAT-004)", () => {
  it("refuses an incomplete draft with structured issues and freezes nothing", async () => {
    const deps = makeDeps();
    const { assessment } = await createOrResumeAssessment(deps, ctxA(), { workedge: refs });
    const err = await acceptRevision(deps, ctxA(), assessment.assessment_id, { expected_draft_version: 1 }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "invalid_request" });
    expect((err as StoreError).details!["issues"]).toBeInstanceOf(Array);
    expect(deps.db.rows.revisions).toHaveLength(0);
    expect((await deps.db.assessments.get("we_team_fixture", assessment.assessment_id))!.revision).toBe(0);
  });

  it("freezes a validated snapshot with a content hash, bumps the revision and keeps the draft in sync", async () => {
    const deps = makeDeps();
    const { assessment_id, accepted } = await acceptedRanch(deps);
    expect(accepted.assessment.revision).toBe(1);
    expect(accepted.revision.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(accepted.revision.snapshot.revision).toBe(1);
    expect(accepted.revision.snapshot.workedge.project_id).toBe(ranchFixture().input.assessment.workedge.project_id);
    expect(accepted.assessment.draft).toEqual(accepted.revision.snapshot);
    const rev = await getRevision(deps, ctxA(), assessment_id, 1);
    expect(rev.accepted_by).toBe("we_user_eric");
    await expect(getRevision(deps, ctxB(), assessment_id, 1)).rejects.toMatchObject({ code: "not_found" });
  });

  it("a second acceptance makes revision 2; revision 1 is unchanged", async () => {
    const deps = makeDeps();
    const { assessment_id, accepted } = await acceptedRanch(deps);
    const draft = structuredClone(accepted.assessment.draft) as { building: { building_construction: { number_of_bedrooms: { value: number } } } };
    draft.building.building_construction.number_of_bedrooms.value = 4;
    const saved = await saveDraft(deps, ctxA(), assessment_id, { draft: draft as unknown as Record<string, unknown>, expected_draft_version: accepted.assessment.draft_version });
    const second = await acceptRevision(deps, ctxA(), assessment_id, { expected_draft_version: saved.draft_version });
    expect(second.revision.revision).toBe(2);
    expect(second.revision.content_hash).not.toBe(accepted.revision.content_hash);
    const first = await getRevision(deps, ctxA(), assessment_id, 1);
    expect(first.content_hash).toBe(accepted.revision.content_hash);
    expect(first.snapshot.building.building_construction.number_of_bedrooms.value).toBe(3);
  });
});

describe("accepting a quick pass (WO-03 D2)", () => {
  async function qpAssessment() {
    const { QUICK_PASS_HOUSES } = await import("@rhoeflow/templates");
    const deps = makeDeps();
    const { assessment } = await createOrResumeAssessment(deps, ctxA(), { workedge: refs });
    return { deps, assessment, house: QUICK_PASS_HOUSES[0]! };
  }

  it("refuses answers that break the contract when the draft is saved", async () => {
    const { deps, assessment } = await qpAssessment();
    const draft = { ...(assessment.draft as Record<string, unknown>), x_quick_pass: { quick_pass_version: "0.1.0", bedrooms: { value: "three" } } };
    await expect(saveDraft(deps, ctxA(), assessment.assessment_id, { draft, expected_draft_version: 1 })).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("needs a template, then builds the snapshot on the server from the answers and keeps them on the revision", async () => {
    const { deps, assessment, house } = await qpAssessment();
    const draft = { ...(assessment.draft as Record<string, unknown>), x_quick_pass: house.answers };
    const saved = await saveDraft(deps, ctxA(), assessment.assessment_id, { draft, expected_draft_version: 1 });
    await expect(acceptRevision(deps, ctxA(), assessment.assessment_id, { expected_draft_version: saved.draft_version })).rejects.toMatchObject({ message: /pick a template/ });

    const picked = await saveDraft(deps, ctxA(), assessment.assessment_id, { draft, expected_draft_version: saved.draft_version, template_id: house.template });
    expect(picked).toMatchObject({ template_id: house.template, template_version: null });
    const r = await acceptRevision(deps, ctxA(), assessment.assessment_id, { expected_draft_version: picked.draft_version });
    expect(r.revision.revision).toBe(1);
    expect(r.revision.snapshot.workedge).toMatchObject({ team_id: "we_team_fixture", ...refs });
    expect(r.revision.snapshot.building.building_construction.conditioned_floor_area.value).toBe(1600);
    expect(r.revision.snapshot.template_id).toBe(house.template);
    expect(r.revision.quick_pass).toEqual(expect.objectContaining({ quick_pass_version: "0.1.0" }));
    expect(JSON.stringify(r.revision.snapshot)).not.toContain("x_quick_pass");
    expect((r.assessment.draft as Record<string, unknown>)["x_quick_pass"]).toBeTruthy();
  });

  it("a quick pass missing required answers is refused with the builder's issues", async () => {
    const { deps, assessment, house } = await qpAssessment();
    const draft = { ...(assessment.draft as Record<string, unknown>), x_quick_pass: { quick_pass_version: "0.1.0" } };
    const saved = await saveDraft(deps, ctxA(), assessment.assessment_id, { draft, expected_draft_version: 1, template_id: house.template });
    const err = await acceptRevision(deps, ctxA(), assessment.assessment_id, { expected_draft_version: saved.draft_version }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "invalid_request" });
    expect(((err as StoreError).details!["issues"] as { code: string }[]).filter((i) => i.code === "required")).toHaveLength(6);
  });

  it("the accepted quick pass runs, and changing one answer makes a new revision and marks the run stale", async () => {
    const { createRun } = await import("../src/index.js");
    const { deps, assessment, house } = await qpAssessment();
    const draft = { ...(assessment.draft as Record<string, unknown>), x_quick_pass: house.answers };
    const saved = await saveDraft(deps, ctxA(), assessment.assessment_id, { draft, expected_draft_version: 1, template_id: house.template });
    const first = await acceptRevision(deps, ctxA(), assessment.assessment_id, { expected_draft_version: saved.draft_version });
    const run = await createRun(deps, ctxA(), assessment.assessment_id, { idempotency_key: "qp-1" });
    expect(run.status).toBe("ok");

    const next = { ...(first.assessment.draft as Record<string, unknown>), x_quick_pass: { ...house.answers, tightness: { value: "leaky", state: "assumed" } } };
    const saved2 = await saveDraft(deps, ctxA(), assessment.assessment_id, { draft: next, expected_draft_version: first.assessment.draft_version });
    const second = await acceptRevision(deps, ctxA(), assessment.assessment_id, { expected_draft_version: saved2.draft_version });
    expect(second.stale_runs).toBe(1);
    const run2 = await createRun(deps, ctxA(), assessment.assessment_id, { idempotency_key: "qp-2" });
    expect(run2.totals!.heating_sensible).toBeGreaterThan(run.totals!.heating_sensible);
  });
});

describe("accept is idempotent on content", () => {
  it("accepting an unchanged draft returns the latest revision and freezes nothing new", async () => {
    const deps = makeDeps();
    const { assessment_id, accepted } = await acceptedRanch(deps);
    const again = await acceptRevision(deps, ctxA(), assessment_id, { expected_draft_version: accepted.assessment.draft_version });
    expect(again.unchanged).toBe(true);
    expect(again.revision.revision).toBe(1);
    expect(deps.db.rows.revisions).toHaveLength(1);
    expect(accepted.unchanged).toBe(false);
  });
});
