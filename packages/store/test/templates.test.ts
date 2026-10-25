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
    await seedTemplates(deps, ctxA());
    expect(await resolveTemplate(deps, ctxA(), "dfw-pre1980-ranch-slab")).toMatchObject({ version: "v1" });
    await expect(resolveTemplate(deps, ctxA(), "dfw-pre1980-ranch-slab", "v7")).rejects.toMatchObject({ code: "not_found" });
  });

  it("only a granted editor may create a version; every value must keep a source", async () => {
    const deps = makeDeps();
    await seedTemplates(deps, ctxA());
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
    await seedTemplates(deps, ctxA());
    await withEditor(deps);
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
