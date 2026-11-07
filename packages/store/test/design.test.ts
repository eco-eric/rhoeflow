import { describe, expect, it } from "vitest";
import { acceptRevision, createOrResumeAssessment, getDesignDefaults, saveDesignDefaults, saveDraft } from "../src/index.js";
import { TEAM_B, ctxA, ctxB, linkedJob, makeDeps } from "./helpers.js";

/** ADR-047: each account's design defaults; admins change them, everyone reads them, accept uses them. */

const admin = () => ({ ...ctxA(), role: "admin" as const, account_name: "Truficient" });
const member = () => ({ ...ctxA("we_user_tech"), role: "member" as const, account_name: "Truficient" });
const DFW_101 = { stations: { "722590": { cooling_design_temp_f: 101 } } };
const MJ = (s: { building: { systems: { hvac: { hvac_sizing_control: { manualj_inputs: Record<string, { value: unknown; state: string; source: string }> } } } } }) =>
  s.building.systems.hvac.hvac_sizing_control.manualj_inputs;

describe("account design defaults (ADR-047)", () => {
  it("start empty, so every value is standard", async () => {
    const deps = makeDeps();
    expect(await getDesignDefaults(deps, member())).toEqual({ defaults: { stations: {} }, updated_at: null, can_edit: false });
    expect((await getDesignDefaults(deps, admin())).can_edit).toBe(true);
  });

  it("only admins change them", async () => {
    const deps = makeDeps();
    await expect(saveDesignDefaults(deps, member(), DFW_101)).rejects.toMatchObject({ code: "forbidden" });
    const saved = await saveDesignDefaults(deps, admin(), DFW_101);
    expect(saved.defaults).toEqual({ stations: { "722590": { cooling_design_temp_f: 101 } } });
    expect(saved.updated_at).toBe("2026-10-25T12:00:00.000Z");
    expect((await getDesignDefaults(deps, member())).defaults.stations["722590"]?.cooling_design_temp_f).toBe(101);
  });

  it("refuse a typo outside the limits, with a message the page can show", async () => {
    const deps = makeDeps();
    await expect(saveDesignDefaults(deps, admin(), { stations: { "722590": { cooling_design_temp_f: 1010 } } })).rejects.toMatchObject({ code: "invalid_request", message: /at most 125/ });
  });

  it("clearing a station's values drops the station", async () => {
    const deps = makeDeps();
    await saveDesignDefaults(deps, admin(), DFW_101);
    expect((await saveDesignDefaults(deps, admin(), { stations: { "722590": {} } })).defaults).toEqual({ stations: {} });
  });

  it("are the account's own: another account sees none", async () => {
    const deps = makeDeps();
    await saveDesignDefaults(deps, admin(), DFW_101);
    expect((await getDesignDefaults(deps, ctxB())).defaults).toEqual({ stations: {} });
    expect(await deps.db.designSettings.get(TEAM_B)).toBeNull();
  });

  it("accepting a quick pass uses the account's defaults and records where they came from", async () => {
    const { QUICK_PASS_HOUSES } = await import("@rhoeflow/templates");
    const deps = makeDeps();
    const house = QUICK_PASS_HOUSES[0]!;
    await saveDesignDefaults(deps, admin(), DFW_101);
    const { assessment } = await createOrResumeAssessment(deps, member(), { job_id: await linkedJob(deps, member()) });
    const draft = { ...(assessment.draft as Record<string, unknown>), x_quick_pass: house.answers };
    const saved = await saveDraft(deps, member(), assessment.assessment_id, { draft, expected_draft_version: 1, template_id: house.template });
    const r = await acceptRevision(deps, member(), assessment.assessment_id, { expected_draft_version: saved.draft_version });
    const cool = MJ(r.revision.snapshot as never)["cooling_design_temperature"]!;
    expect(cool).toMatchObject({ value: 101, state: "defaulted" });
    expect(cool.source).toContain("account design default (Truficient");

    // A per-calc override wins over the account default.
    deps.tick();
    const withOverride = { ...draft, x_quick_pass: { ...house.answers, design: { cooling_design_temperature: { value: 103, state: "assumed" } } } };
    const saved2 = await saveDraft(deps, member(), assessment.assessment_id, { draft: withOverride, expected_draft_version: r.assessment.draft_version });
    const r2 = await acceptRevision(deps, member(), assessment.assessment_id, { expected_draft_version: saved2.draft_version });
    expect(MJ(r2.revision.snapshot as never)["cooling_design_temperature"]).toMatchObject({ value: 103, state: "assumed" });
    expect(r2.revision.revision).toBe(2);
  });
});
