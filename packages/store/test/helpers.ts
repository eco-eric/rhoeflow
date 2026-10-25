import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CalcFixtureSchema } from "@rhoeflow/calc";
import { MemoryObjectStorage, MemoryStoreDb, type StoreContext, type StoreDeps } from "../src/index.js";

/** The committed ranch fixture: a complete, accepted, oracle-verified Assessment (QA-002). */
export function ranchFixture() {
  return CalcFixtureSchema.parse(JSON.parse(readFileSync(resolve(import.meta.dirname, "../../calc/fixtures/ranch-1960s-dfw.fixture.json"), "utf8")));
}

export const TEAM_A = "we_team_fixture";
export const TEAM_B = "we_team_other";

export function ctxA(user: string | null = "we_user_eric"): StoreContext {
  return { team_id: TEAM_A, user_id: user };
}
export function ctxB(): StoreContext {
  return { team_id: TEAM_B, user_id: "we_user_other" };
}

export function makeDeps(): StoreDeps & { db: MemoryStoreDb; artifacts: MemoryObjectStorage; tick: () => void } {
  let t = Date.parse("2026-10-25T12:00:00Z");
  let n = 0;
  const deps = {
    db: new MemoryStoreDb(),
    artifacts: new MemoryObjectStorage("rhoe-runs"),
    now: () => new Date(t),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    tick: () => {
      t += 1000;
    },
  };
  return deps;
}

/** Create, draft and accept the ranch as revision 1 for team A. */
export async function acceptedRanch(deps: StoreDeps, ctx = ctxA()) {
  const { createOrResumeAssessment, saveDraft, acceptRevision } = await import("../src/index.js");
  const fx = ranchFixture();
  const a = fx.input.assessment;
  const created = await createOrResumeAssessment(deps, ctx, { workedge: { project_id: a.workedge.project_id, property_id: a.workedge.property_id }, template_id: a.template_id! });
  const draft = { ...a, assessment_id: created.assessment.assessment_id, template_version: created.assessment.template_version ?? undefined };
  if (draft.template_version === undefined) delete (draft as { template_version?: string }).template_version;
  const saved = await saveDraft(deps, ctx, created.assessment.assessment_id, { draft, expected_draft_version: created.assessment.draft_version });
  const accepted = await acceptRevision(deps, ctx, created.assessment.assessment_id, { expected_draft_version: saved.draft_version });
  return { fixture: fx, assessment_id: created.assessment.assessment_id, accepted };
}
