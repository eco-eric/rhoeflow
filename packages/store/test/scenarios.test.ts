import { describe, expect, it } from "vitest";
import { StoreError, compareRuns, createRun, createScenario, updateScenario, COMPARISON_NOTICE } from "../src/index.js";
import { acceptedRanch, ctxA, ctxB, makeDeps } from "./helpers.js";

const WINDOW_SHGC = "building.enclosure.windows[0].shgc";
const lowE = {
  path: WINDOW_SHGC,
  field: { value: 0.25, unit: "fraction" as const, state: "assumed" as const, source: "homeowner quote: low-e replacement windows, SHGC 0.25 on the NFRC label", evidence: [] },
  rationale: "What if the windows are replaced before the system is sized?",
  label: "design" as const,
};
const setpoint = {
  path: "building.systems.hvac.hvac_control.cooling_setpoint",
  field: { value: 72, unit: "F" as const, state: "assumed" as const, source: "homeowner: keeps it at 72", evidence: [] },
  rationale: "Customer preference, not a design condition",
  label: "customer_preference" as const,
};

describe("scenarios (C5; SCN-001, SCN-002, QST-003)", () => {
  it("validates overrides against the accepted snapshot: path, unit and type", async () => {
    const deps = makeDeps();
    const { assessment_id } = await acceptedRanch(deps);
    const bad = await createScenario(deps, ctxA(), assessment_id, { name: "bad", overrides: [{ ...lowE, path: "building.enclosure.windows[9].shgc" }, { ...lowE, field: { ...lowE.field, unit: "Btu/h-ft2-F" } }] }).catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(StoreError);
    const issues = (bad as StoreError).details!["issues"] as { message: string }[];
    expect(issues.map((i) => i.message).join("\n")).toMatch(/not an input field/);
    expect(issues.map((i) => i.message).join("\n")).toMatch(/must use the same unit/);
    expect(deps.db.rows.scenarios).toHaveLength(0);
  });

  it("runs a scenario against the frozen baseline, leaving the baseline untouched, and compares like for like", async () => {
    const deps = makeDeps();
    const { assessment_id, accepted } = await acceptedRanch(deps);
    const baseline = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "base" });
    const scenario = await createScenario(deps, ctxA(), assessment_id, { name: "Low-e windows", overrides: [lowE, setpoint] });
    expect(scenario.scenario_version).toBe(1);
    const run = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "scn", scenario_id: scenario.scenario_id });
    expect(run.status).toBe("ok");
    expect(run.scenario_id).toBe(scenario.scenario_id);
    expect(run.fingerprint!.inputs).toBe(`${accepted.revision.content_hash}+scenario:${scenario.scenario_id}@1`);
    expect(baseline.fingerprint!.inputs).toBe(accepted.revision.content_hash);
    // The accepted revision did not change.
    const rev = await deps.db.revisions.get("we_team_fixture", assessment_id, 1);
    expect((rev!.snapshot.building.enclosure.windows[0]!.shgc as { value: number }).value).not.toBe(0.25);

    const cmp = await compareRuns(deps, ctxA(), baseline.run_id, run.run_id);
    expect(cmp.same_basis).toEqual({ revision: true, weather: true, engine: true, methods: true });
    expect(cmp.changed_fields.map((c) => `${c.path}=${c.label}`).sort()).toEqual([`${WINDOW_SHGC}=design`, `${setpoint.path}=customer_preference`].sort());
    const shgc = cmp.changed_fields.find((c) => c.path === WINDOW_SHGC)!;
    expect(shgc.from.state).toBe("defaulted");
    expect(shgc.to).toMatchObject({ value: 0.25, state: "assumed", source: lowE.field.source });
    expect(shgc.rationale).toBe(lowE.rationale);
    expect(cmp.non_reference_inputs).toEqual([setpoint.path]);
    // Less solar gain: the window component's cooling drops. The 72 F setpoint widens every
    // temperature difference, so the building total moves the other way; the comparison reports
    // both and labels the setpoint as a customer preference, never as a design saving.
    const win = cmp.components.find((c) => c.component_kind === "window")!;
    expect(win.cooling_sensible!.delta).toBeLessThan(0);
    expect(cmp.loads.cooling_sensible.delta).not.toBe(0);
    expect(cmp.loads.cooling_total.delta).toBeCloseTo(cmp.loads.cooling_sensible.delta + cmp.loads.cooling_latent.delta, 6);
    expect(cmp.loads.cooling_sensible.unit).toBe("Btu/h");
    expect(cmp.notice).toBe(COMPARISON_NOTICE);
    expect(JSON.stringify({ ...cmp, notice: undefined })).not.toMatch(/kwh|dollar|\$|cost|bill|savings/i);
  });

  it("editing a scenario bumps its version and marks its runs stale; other runs stay fresh", async () => {
    const deps = makeDeps();
    const { assessment_id } = await acceptedRanch(deps);
    const baseline = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "base" });
    const scenario = await createScenario(deps, ctxA(), assessment_id, { name: "Low-e", overrides: [lowE] });
    const run = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "scn", scenario_id: scenario.scenario_id });
    const edited = await updateScenario(deps, ctxA(), scenario.scenario_id, { name: "Low-e, darker", overrides: [{ ...lowE, field: { ...lowE.field, value: 0.2 } }], expected_scenario_version: 1 });
    expect(edited.scenario.scenario_version).toBe(2);
    expect(edited.stale_runs).toBe(1);
    expect((await deps.db.runs.get("we_team_fixture", run.run_id))!.stale).toBe(true);
    expect((await deps.db.runs.get("we_team_fixture", baseline.run_id))!.stale).toBe(false);
    await expect(updateScenario(deps, ctxA(), scenario.scenario_id, { name: "x", overrides: [lowE], expected_scenario_version: 1 })).rejects.toMatchObject({ code: "precondition_failed" });
  });

  it("comparison refuses runs of different assessments and another team's runs", async () => {
    const deps = makeDeps();
    const { assessment_id } = await acceptedRanch(deps);
    const baseline = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "base" });
    await expect(compareRuns(deps, ctxB(), baseline.run_id, baseline.run_id)).rejects.toMatchObject({ code: "not_found" });
    await expect(createScenario(deps, ctxB(), assessment_id, { name: "x", overrides: [lowE] })).rejects.toMatchObject({ code: "not_found" });
  });
});
