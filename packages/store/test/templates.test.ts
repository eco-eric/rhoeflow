import { describe, expect, it } from "vitest";
import { TEMPLATES, getTemplate } from "@rhoeflow/templates";
import { createRun, createTemplate, createTemplateVersion, grantTemplateEditor, resolveTemplate, seedTemplates, listTemplateVersions } from "../src/index.js";
import { acceptedRanch, ctxA, ctxB, makeDeps } from "./helpers.js";

async function withEditor(deps: ReturnType<typeof makeDeps>) {
  await deps.db.templateEditors.grant({ workedge_team_id: "we_team_fixture", workedge_user_id: "we_user_eric", granted_by: null, granted_at: "2026-10-25T12:00:00.000Z" });
}

describe("template store (C7; ADR-024; owner decision 5)", () => {
  it("seeds the repo templates once as version 1 and is idempotent", async () => {
    const deps = makeDeps();
    await withEditor(deps);
    const first = await seedTemplates(deps, ctxA());
    expect(first.seeded).toEqual(TEMPLATES.map((t) => t.template_id));
    const again = await seedTemplates(deps, ctxA());
    expect(again.seeded).toEqual([]);
    expect(again.skipped).toHaveLength(TEMPLATES.length);
    const v = await listTemplateVersions(deps, ctxA(), "dfw-pre1980-ranch-slab");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ version: 1, source: "repo", editor_user_id: null });
    expect(await deps.db.templates.list("we_team_other")).toEqual([]);
  });

  it("falls back to the repo copy with version null until the store is seeded", async () => {
    const deps = makeDeps();
    expect(await resolveTemplate(deps, ctxA(), "dfw-pre1980-ranch-slab")).toMatchObject({ version: null });
    await withEditor(deps);
    await seedTemplates(deps, ctxA());
    expect(await resolveTemplate(deps, ctxA(), "dfw-pre1980-ranch-slab")).toMatchObject({ version: "v1" });
    await expect(resolveTemplate(deps, ctxA(), "dfw-pre1980-ranch-slab", "v7")).rejects.toMatchObject({ code: "not_found" });
  });

  it("only a granted editor may create a version; every value must keep a source", async () => {
    const deps = makeDeps();
    await seedTemplates(deps, { ...ctxA(), template_editor: true });
    const t = structuredClone(getTemplate("dfw-pre1980-ranch-slab"));
    t.sanity_band = { ft2_per_ton: { low: 400, high: 500 }, sources: ["owner-field-data"], basis: "owner refined after ten jobs" };
    await expect(createTemplateVersion(deps, ctxA(), t.template_id, { payload: t, change_note: "band", expected_current_version: 1 })).rejects.toMatchObject({ code: "forbidden" });
    await expect(createTemplateVersion(deps, ctxA(null), t.template_id, { payload: t, change_note: "band", expected_current_version: 1 })).rejects.toMatchObject({ code: "forbidden" });
    await withEditor(deps);
    const unsourced = structuredClone(t);
    (unsourced.defaults.window_shgc as { sources: string[] }).sources = [];
    await expect(createTemplateVersion(deps, ctxA(), t.template_id, { payload: unsourced, change_note: "x", expected_current_version: 1 })).rejects.toThrow();
    const r = await createTemplateVersion(deps, ctxA(), t.template_id, { payload: t, change_note: "band", expected_current_version: 1 });
    expect(r.version).toMatchObject({ version: 2, source: "editor", editor_user_id: "we_user_eric", change_note: "band" });
    expect(r.template.current_version).toBe(2);
    expect(r.stale_runs).toBe(0);
    await expect(createTemplateVersion(deps, ctxA(), t.template_id, { payload: t, change_note: "same", expected_current_version: 2 })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(createTemplateVersion(deps, ctxA(), t.template_id, { payload: t, change_note: "stale", expected_current_version: 1 })).rejects.toMatchObject({ code: "precondition_failed" });
    // The role flag from the session layer also works.
    const t3 = structuredClone(t);
    t3.sanity_band!.ft2_per_ton.high = 520;
    expect((await createTemplateVersion(deps, { team_id: "we_team_fixture", user_id: "we_user_owner", template_editor: true }, t.template_id, { payload: t3, change_note: "role", expected_current_version: 2 })).version.version).toBe(3);
  });

  it("a new version lists the open assessments it affects and marks runs on the old version stale", async () => {
    const deps = makeDeps();
    await withEditor(deps);
    await seedTemplates(deps, ctxA());
    const { assessment_id, accepted } = await acceptedRanch(deps);
    expect(accepted.revision.snapshot.template_version).toBe("v1");
    const run = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "base" });
    expect(run.template_version).toBe("v1");
    expect(run.fingerprint!.template).toBe("dfw-pre1980-ranch-slab@v1");
    const t = structuredClone(getTemplate("dfw-pre1980-ranch-slab"));
    t.sanity_band = { ft2_per_ton: { low: 400, high: 500 }, sources: ["owner-field-data"], basis: "refined" };
    const r = await createTemplateVersion(deps, ctxA(), t.template_id, { payload: t, change_note: "band", expected_current_version: 1 });
    expect(r.affected_assessments).toEqual([{ assessment_id, workedge_project_id: "we_project_fixture_ranch", template_version: "v1", revision: 1 }]);
    expect(r.stale_runs).toBe(1);
    expect((await deps.db.runs.get("we_team_fixture", run.run_id))!.stale_reason).toBe("template dfw-pre1980-ranch-slab v2 supersedes v1");
    // A fresh run on the same revision still records v1 (the assessment was seeded by v1); the band check uses the stored v1.
    const again = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "again" });
    expect(again.run_id).toBe(run.run_id);
  });

  it("creates a template from a copy under a new id, and editors can grant editors", async () => {
    const deps = makeDeps();
    await withEditor(deps);
    const copy = structuredClone(getTemplate("dfw-pre1980-ranch-slab"));
    copy.template_id = "dfw-pre1980-ranch-crawl";
    copy.name = "Pre-1980 ranch on a crawlspace";
    const r = await createTemplate(deps, ctxA(), { payload: copy, change_note: "copied from the slab ranch" });
    expect(r.template).toMatchObject({ template_id: "dfw-pre1980-ranch-crawl", current_version: 1 });
    await expect(createTemplate(deps, ctxA(), { payload: copy, change_note: "again" })).rejects.toMatchObject({ code: "conflict" });
    await expect(grantTemplateEditor(deps, ctxB(), "we_user_x")).rejects.toMatchObject({ code: "forbidden" });
    await grantTemplateEditor(deps, ctxA(), "we_user_jose");
    expect(await deps.db.templateEditors.isEditor("we_team_fixture", "we_user_jose")).toBe(true);
    expect(await deps.db.templateEditors.isEditor("we_team_other", "we_user_jose")).toBe(false);
  });
});

describe("pinned versions, current templates and the affected list (D9)", () => {
  it("a job picked from the repo copy stays on it after the store is seeded and edited", async () => {
    const { resolvePinnedTemplate } = await import("../src/index.js");
    const deps = makeDeps();
    await withEditor(deps);
    const { assessment_id } = await acceptedRanch(deps);
    const before = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "r1" });
    expect(before.template_version).toBeNull();
    await seedTemplates(deps, ctxA());
    const t = structuredClone(getTemplate("dfw-pre1980-ranch-slab"));
    t.defaults.ceiling_insulation_cavity_r!.value = 19;
    await createTemplateVersion(deps, ctxA(), t.template_id, { payload: t, change_note: "R-19 typical", expected_current_version: 1 });
    expect((await resolvePinnedTemplate(deps, ctxA(), "dfw-pre1980-ranch-slab", null)).template.defaults.ceiling_insulation_cavity_r!.value).toBe(11);
    expect((await resolvePinnedTemplate(deps, ctxA(), "dfw-pre1980-ranch-slab", "v2")).template.defaults.ceiling_insulation_cavity_r!.value).toBe(19);
    expect((await resolveTemplate(deps, ctxA(), "dfw-pre1980-ranch-slab")).version).toBe("v2");
    // The same frozen input still runs identically: the edit did not reach this job.
    const again = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "r2" });
    expect(again.run_id).toBe(before.run_id);
  });

  it("current templates: the repo set until seeded, then the store's current versions without archived ones", async () => {
    const { currentTemplates } = await import("../src/index.js");
    const deps = makeDeps();
    expect((await currentTemplates(deps, ctxA())).every((c) => c.version === null)).toBe(true);
    await withEditor(deps);
    await seedTemplates(deps, ctxA());
    await deps.db.templates.setArchived("we_team_fixture", "dfw-2021-iecc2021", true, "2026-10-25T12:00:00.000Z");
    const cur = await currentTemplates(deps, ctxA());
    expect(cur.every((c) => c.version === "v1")).toBe(true);
    expect(cur.map((c) => c.template_id)).not.toContain("dfw-2021-iecc2021");
    expect(await currentTemplates(deps, ctxB())).toHaveLength(TEMPLATES.length);
  });

  it("seeding needs an editor; the affected list and the detail view", async () => {
    const { affectedAssessments, canEditTemplates, templateDetail } = await import("../src/index.js");
    const deps = makeDeps();
    await expect(seedTemplates(deps, ctxA())).rejects.toMatchObject({ code: "forbidden" });
    expect(await canEditTemplates(deps, ctxA())).toBe(false);
    expect(await canEditTemplates(deps, { team_id: "we_team_fixture", user_id: "u", template_editor: true })).toBe(true);
    await withEditor(deps);
    await seedTemplates(deps, ctxA());
    const { assessment_id } = await acceptedRanch(deps);
    expect(await affectedAssessments(deps, ctxA(), "dfw-pre1980-ranch-slab")).toEqual([expect.objectContaining({ assessment_id, revision: 1 })]);
    expect(await affectedAssessments(deps, ctxB(), "dfw-pre1980-ranch-slab")).toEqual([]);
    const d = await templateDetail(deps, ctxA(), "dfw-pre1980-ranch-slab");
    expect(d.current.version).toBe("v1");
    expect(d.versions).toHaveLength(1);
    const repo = await templateDetail(deps, ctxB(), "dfw-pre1980-ranch-slab");
    expect(repo).toMatchObject({ template: null, current: { version: null } });
  });
});
