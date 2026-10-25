import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "@rhoeflow/calc";
import { StoreError, cancelRun, createRun, issueReport, readRunArtifact, reapTimedOutRuns, saveDraft, acceptRevision, listRunArtifacts } from "../src/index.js";
import { acceptedRanch, ctxA, ctxB, makeDeps } from "./helpers.js";

describe("frozen runs on the server (C3; DAT-004, ENG-008, API-002)", () => {
  it("runs the accepted revision, matches the fixture's oracle-checked totals and writes the bundle", async () => {
    const deps = makeDeps();
    const { assessment_id, fixture } = await acceptedRanch(deps);
    const run = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "tap-1" });
    expect(run).toMatchObject({ status: "ok", revision: 1, scenario_id: null, engine_version: ENGINE_VERSION, stale: false, template_id: "dfw-pre1980-ranch-slab", template_version: null });
    expect(run.input_hash).toMatch(/^sha256:/);
    expect(run.method_ids.length).toBeGreaterThan(5);
    expect(run.fingerprint).toMatchObject({ weather: "openstudio-hpxml-weather@v1.12.0", template: "dfw-pre1980-ranch-slab@repo" });
    expect(run.fingerprint!.methods).toContain(`@rhoeflow/calc@${ENGINE_VERSION}`);
    const exp = fixture.expected!.building;
    expect(Math.abs(run.totals!.heating_sensible - exp.heating_sensible)).toBeLessThanOrEqual(fixture.expected!.tolerance.absolute ?? 1);
    expect(Math.abs(run.totals!.cooling_sensible - exp.cooling_sensible)).toBeLessThanOrEqual(fixture.expected!.tolerance.absolute ?? 1);

    const artifacts = await listRunArtifacts(deps, ctxA(), run.run_id);
    expect(artifacts.map((a) => a.path).sort()).toEqual(["building.xml", "frozen-input.canonical.json", "frozen-input.json", "manifest.json", "output.json"]);
    expect(artifacts.every((a) => a.storage_path === `${run.bundle_prefix}/${a.path}` && a.storage_bucket === "rhoe-runs")).toBe(true);
    const out = await readRunArtifact(deps, ctxA(), run.run_id, "output.json");
    const parsed = JSON.parse(new TextDecoder().decode(out.bytes));
    expect(parsed.manifest.run_id).toBe(run.run_id);
    expect(parsed.manifest.input_hash).toBe(run.input_hash);
    await expect(readRunArtifact(deps, ctxA(), run.run_id, "../other/output.json")).rejects.toMatchObject({ code: "not_found" });
    await expect(readRunArtifact(deps, ctxB(), run.run_id, "output.json")).rejects.toMatchObject({ code: "not_found" });
  });

  it("the same idempotency key returns the same run; the same content with a new key does too", async () => {
    const deps = makeDeps();
    const { assessment_id } = await acceptedRanch(deps);
    const a = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "tap-1" });
    const b = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "tap-1" });
    const c = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "tap-2" });
    expect(b.run_id).toBe(a.run_id);
    expect(c.run_id).toBe(a.run_id);
    expect(deps.db.rows.runs).toHaveLength(1);
    expect(deps.db.rows.artifacts).toHaveLength(5);
  });

  it("refuses to run inputs the engine may not consume, with the structured issues and no run row (ENG-007)", async () => {
    const deps = makeDeps();
    const { assessment_id, accepted } = await acceptedRanch(deps);
    const draft = structuredClone(accepted.assessment.draft) as { building: { enclosure: { windows: { shgc: unknown }[] } } };
    draft.building.enclosure.windows[0]!.shgc = { value: null, unit: "fraction", state: "unknown", reason: "inspected_cant_tell", evidence: [] };
    const saved = await saveDraft(deps, ctxA(), assessment_id, { draft: draft as unknown as Record<string, unknown>, expected_draft_version: accepted.assessment.draft_version });
    await acceptRevision(deps, ctxA(), assessment_id, { expected_draft_version: saved.draft_version });
    const err = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "tap-3" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StoreError);
    expect((err as StoreError).code).toBe("invalid_request");
    const issues = (err as StoreError).details!["issues"] as { path: string; message: string }[];
    expect(issues[0]!.path).toBe("assessment.building.enclosure.windows[0].shgc");
    expect(issues[0]!.message).toContain("unknown (inspected_cant_tell)");
    expect(deps.db.rows.runs).toHaveLength(0);
    // Revision 1 still runs on request.
    const r1 = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "tap-4", revision: 1 });
    expect(r1.status).toBe("ok");
    expect(r1.revision).toBe(1);
  });

  it("a finished run cannot be cancelled; a running one can, and a late result does not overwrite it", async () => {
    const deps = makeDeps();
    const { assessment_id } = await acceptedRanch(deps);
    const run = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "tap-1" });
    await expect(cancelRun(deps, ctxA(), run.run_id)).rejects.toMatchObject({ code: "conflict", details: { status: "ok" } });

    // Simulate a worker that stalls after inserting the row: cancel it, then let the late transition arrive.
    const row = { ...run, run_id: "00000000-0000-4000-8000-00000000ffff", idempotency_key: "tap-9", status: "running" as const, finished_at: null, totals: null, bundle_prefix: null, fingerprint: null, input_hash: "sha256:" + "f".repeat(64) };
    await deps.db.runs.insert(row);
    const cancelled = await cancelRun(deps, ctxA(), row.run_id);
    expect(cancelled.status).toBe("cancelled");
    const late = await deps.db.runs.transition("we_team_fixture", row.run_id, ["running"], { status: "ok", totals: run.totals });
    expect(late).toBeNull();
    expect((await deps.db.runs.get("we_team_fixture", row.run_id))!.status).toBe("cancelled");
  });

  it("reaps runs stuck in running past the timeout and a retry with a new key may proceed", async () => {
    const deps = makeDeps();
    const { assessment_id } = await acceptedRanch(deps);
    const run = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "tap-1" });
    const stuck = { ...run, run_id: "00000000-0000-4000-8000-00000000aaaa", idempotency_key: "tap-stuck", status: "running" as const, started_at: "2026-10-25T11:00:00.000Z", finished_at: null, totals: null, bundle_prefix: null, fingerprint: null, input_hash: null };
    await deps.db.runs.insert(stuck);
    const reaped = await reapTimedOutRuns(deps, ctxA());
    expect(reaped.map((r) => r.run_id)).toEqual([stuck.run_id]);
    expect(reaped[0]!.status).toBe("timed_out");
    expect(reaped[0]!.errors[0]!.code).toBe("RUN_TIMED_OUT");
    expect((await reapTimedOutRuns(deps, ctxA())).length).toBe(0);
  });

  it("never lets two ok runs accept the same frozen input with the same engine", async () => {
    const deps = makeDeps();
    const { assessment_id } = await acceptedRanch(deps);
    const run = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "tap-1" });
    await expect(deps.db.runs.insert({ ...run, run_id: "00000000-0000-4000-8000-00000000bbbb", idempotency_key: "tap-dup" })).rejects.toMatchObject({ code: "conflict" });
  });

  it("another team sees nothing of the run (SEC-001)", async () => {
    const deps = makeDeps();
    const { assessment_id } = await acceptedRanch(deps);
    const run = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "tap-1" });
    expect(await deps.db.runs.get("we_team_other", run.run_id)).toBeNull();
    await expect(createRun(deps, ctxB(), assessment_id, { idempotency_key: "tap-1" })).rejects.toMatchObject({ code: "not_found" });
    await expect(cancelRun(deps, ctxB(), run.run_id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("stale runs and reports (C4; REV-001, REV-002)", () => {
  it("accepting a new revision marks the earlier run stale, visibly, and a stale run cannot feed a report", async () => {
    const deps = makeDeps();
    const { assessment_id, accepted } = await acceptedRanch(deps);
    const run = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "tap-1" });
    const report = await issueReport(deps, ctxA(), { run_id: run.run_id, report_type: "customer_summary" });
    expect(report).toMatchObject({ report_revision: 1, run_id: run.run_id, write_back_status: "queued" });

    const draft = structuredClone(accepted.assessment.draft) as { building: { building_construction: { number_of_bedrooms: { value: number } } } };
    draft.building.building_construction.number_of_bedrooms.value = 4;
    const saved = await saveDraft(deps, ctxA(), assessment_id, { draft: draft as unknown as Record<string, unknown>, expected_draft_version: accepted.assessment.draft_version });
    const second = await acceptRevision(deps, ctxA(), assessment_id, { expected_draft_version: saved.draft_version });
    expect(second.stale_runs).toBe(1);
    const stale = (await deps.db.runs.get("we_team_fixture", run.run_id))!;
    expect(stale).toMatchObject({ stale: true, stale_reason: "inputs changed: revision 2 accepted", status: "ok" });
    expect(stale.totals).toEqual(run.totals);
    const err = await issueReport(deps, ctxA(), { run_id: run.run_id, report_type: "engineering" }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "stale", status: 409 });
    expect(deps.db.rows.reports).toHaveLength(1);

    const fresh = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "tap-2" });
    expect(fresh.revision).toBe(2);
    expect(fresh.stale).toBe(false);
    expect(fresh.input_hash).not.toBe(run.input_hash);
    const r2 = await issueReport(deps, ctxA(), { run_id: fresh.run_id, report_type: "engineering" });
    expect(r2.report_revision).toBe(2);
  });

  it("an error run cannot feed a report either", async () => {
    const deps = makeDeps();
    const { assessment_id } = await acceptedRanch(deps);
    const run = await createRun(deps, ctxA(), assessment_id, { idempotency_key: "tap-1" });
    await deps.db.runs.insert({ ...run, run_id: "00000000-0000-4000-8000-00000000cccc", idempotency_key: "k", status: "error", totals: null, input_hash: null });
    await expect(issueReport(deps, ctxA(), { run_id: "00000000-0000-4000-8000-00000000cccc", report_type: "engineering" })).rejects.toMatchObject({ code: "invalid_request" });
  });
});
