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
