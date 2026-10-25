import { z } from "zod";
import { ASSESSMENT_SCHEMA_VERSION, validateAssessment, type Assessment } from "@rhoeflow/schema";
import { contentHash } from "@rhoeflow/calc";
import { newId, nowIso, type StoreContext, type StoreDeps } from "./context.js";
import type { AcceptRevisionRequest, CreateOrResumeAssessmentRequest, SaveDraftRequest } from "./contracts.js";
import { StoreError } from "./errors.js";
import { markStaleForNewRevision } from "./fingerprints.js";
import type { AssessmentRevisionRow, AssessmentRow } from "./records.js";
import { resolveTemplate } from "./templates.js";

/**
 * Assessment persistence (WO-03 C2; API-001, QST-001, REV-001, DAT-004). One open assessment per
 * WorkEdge project (standard §3 entry A). The draft is a working copy that may be incomplete;
 * accepting it validates the whole Assessment, freezes an immutable revision and bumps the
 * revision number. Every write names the draft version it read (optimistic concurrency).
 */

export interface CreateOrResumeResult {
  assessment: AssessmentRow;
  resumed: boolean;
}

export async function createOrResumeAssessment(deps: StoreDeps, ctx: StoreContext, req: CreateOrResumeAssessmentRequest): Promise<CreateOrResumeResult> {
  const existing = await deps.db.assessments.findOpenByProject(ctx.team_id, req.workedge.project_id);
  if (existing) return { assessment: existing, resumed: true };

  let template_id: string | null = null;
  let template_version: string | null = null;
  if (req.template_id) {
    const t = await resolveTemplate(deps, ctx, req.template_id);
    template_id = t.template.template_id;
    template_version = t.version;
  }
  const at = nowIso(deps);
  const assessment_id = newId(deps);
  /** The skeleton the client fills in; identity fields are fixed here and checked on every save. */
  const draft = {
    schema_version: ASSESSMENT_SCHEMA_VERSION,
    assessment_id,
    revision: 0,
    created_at: at,
    updated_at: at,
    workedge: { team_id: ctx.team_id, project_id: req.workedge.project_id, property_id: req.workedge.property_id, ...(req.workedge.customer_id ? { customer_id: req.workedge.customer_id } : {}) },
    ...(template_id ? { template_id } : {}),
    ...(template_version ? { template_version } : {}),
  };
  try {
    const row = await deps.db.assessments.insert({
      assessment_id,
      workedge_team_id: ctx.team_id,
      workedge_project_id: req.workedge.project_id,
      workedge_property_id: req.workedge.property_id,
      workedge_customer_id: req.workedge.customer_id ?? null,
      status: "open",
      revision: 0,
      draft,
      draft_version: 1,
      template_id,
      template_version,
      created_at: at,
      updated_at: at,
      created_by: ctx.user_id,
    });
    return { assessment: row, resumed: false };
  } catch (e) {
    // Two taps raced: the other one won; resume it.
    if (e instanceof StoreError && e.code === "conflict") {
      const raced = await deps.db.assessments.findOpenByProject(ctx.team_id, req.workedge.project_id);
      if (raced) return { assessment: raced, resumed: true };
    }
    throw e;
  }
}

export async function getAssessment(deps: StoreDeps, ctx: StoreContext, assessment_id: string): Promise<AssessmentRow> {
  const row = await deps.db.assessments.get(ctx.team_id, assessment_id);
  if (!row) throw new StoreError("not_found", `assessment ${assessment_id} not found`);
  return row;
}

/** Identity fields a draft may never change: they pin the draft to its row and its WorkEdge job (ADR-028). */
const DraftIdentitySchema = z.looseObject({
  assessment_id: z.string(),
  workedge: z.looseObject({ team_id: z.string(), project_id: z.string(), property_id: z.string() }),
});

export async function saveDraft(deps: StoreDeps, ctx: StoreContext, assessment_id: string, req: SaveDraftRequest): Promise<AssessmentRow> {
  const row = await getAssessment(deps, ctx, assessment_id);
  if (row.status !== "open") throw new StoreError("invalid_request", `assessment ${assessment_id} is ${row.status}; drafts cannot change`);
  const id = DraftIdentitySchema.safeParse(req.draft);
  if (!id.success) throw new StoreError("invalid_request", "draft must carry assessment_id and workedge.{team_id,project_id,property_id}", { issues: id.error.issues.map((i) => i.message) });
  const w = id.data.workedge;
  if (id.data.assessment_id !== assessment_id || w.team_id !== row.workedge_team_id || w.project_id !== row.workedge_project_id || w.property_id !== row.workedge_property_id) {
    throw new StoreError("invalid_request", "draft identity does not match the assessment's WorkEdge job; a draft cannot be re-pointed");
  }
  const updated = await deps.db.assessments.updateDraft(ctx.team_id, assessment_id, req.expected_draft_version, { draft: req.draft, updated_at: nowIso(deps) });
  if (!updated) {
    const current = await getAssessment(deps, ctx, assessment_id);
    throw new StoreError("precondition_failed", `draft is at version ${current.draft_version}, not ${req.expected_draft_version}; reload and merge`, { draft_version: current.draft_version });
  }
  return updated;
}

export interface AcceptResult {
  assessment: AssessmentRow;
  revision: AssessmentRevisionRow;
  /** Earlier runs on this assessment now marked stale (REV-002). */
  stale_runs: number;
}

/**
 * Freeze the draft as the next accepted revision. The snapshot is the draft with `revision` and
 * `updated_at` set by the server; it must validate completely (shape and invariants). Fields in
 * `proposed` or `unknown` state may be accepted here (the walkthrough is not finished) but the
 * engine will refuse to run them (ENG-007), so the client shows them as blocking (D5).
 */
export async function acceptRevision(deps: StoreDeps, ctx: StoreContext, assessment_id: string, req: AcceptRevisionRequest): Promise<AcceptResult> {
  const row = await getAssessment(deps, ctx, assessment_id);
  if (row.status !== "open") throw new StoreError("invalid_request", `assessment ${assessment_id} is ${row.status}`);
  if (row.draft_version !== req.expected_draft_version) {
    throw new StoreError("precondition_failed", `draft is at version ${row.draft_version}, not ${req.expected_draft_version}`, { draft_version: row.draft_version });
  }
  if (typeof row.draft !== "object" || row.draft === null) throw new StoreError("invalid_request", "there is no draft to accept");
  const revision = row.revision + 1;
  const at = nowIso(deps);
  const candidate = {
    ...(row.draft as Record<string, unknown>),
    assessment_id,
    revision,
    updated_at: at,
    workedge: { team_id: row.workedge_team_id, project_id: row.workedge_project_id, property_id: row.workedge_property_id, ...(row.workedge_customer_id ? { customer_id: row.workedge_customer_id } : {}) },
    ...(row.template_id ? { template_id: row.template_id } : {}),
    ...(row.template_version ? { template_version: row.template_version } : {}),
  };
  const v = validateAssessment(candidate);
  if (!v.ok) throw new StoreError("invalid_request", "the draft is not a complete, consistent Assessment", { issues: v.issues });
  const snapshot: Assessment = v.assessment;
  const rev = await deps.db.revisions.insert({
    assessment_id,
    workedge_team_id: ctx.team_id,
    revision,
    snapshot,
    content_hash: await contentHash(snapshot),
    accepted_at: at,
    accepted_by: ctx.user_id,
  });
  const marked = await deps.db.assessments.markAccepted(ctx.team_id, assessment_id, req.expected_draft_version, revision, at);
  if (!marked) throw new StoreError("conflict", "the draft changed while accepting; reload", { draft_version: (await getAssessment(deps, ctx, assessment_id)).draft_version });
  // The draft continues from the accepted snapshot so the next save is a delta on it.
  const synced = (await deps.db.assessments.updateDraft(ctx.team_id, assessment_id, marked.draft_version, { draft: snapshot, updated_at: at })) ?? marked;
  const stale_runs = await markStaleForNewRevision(deps, ctx, assessment_id, revision);
  return { assessment: synced, revision: rev, stale_runs };
}

export async function getRevision(deps: StoreDeps, ctx: StoreContext, assessment_id: string, revision: number): Promise<AssessmentRevisionRow> {
  const r = await deps.db.revisions.get(ctx.team_id, assessment_id, revision);
  if (!r) throw new StoreError("not_found", `revision ${revision} of assessment ${assessment_id} not found`);
  return r;
}

export async function closeAssessment(deps: StoreDeps, ctx: StoreContext, assessment_id: string): Promise<AssessmentRow> {
  await getAssessment(deps, ctx, assessment_id);
  const row = await deps.db.assessments.setStatus(ctx.team_id, assessment_id, "closed", nowIso(deps));
  if (!row) throw new StoreError("not_found", `assessment ${assessment_id} not found`);
  return row;
}
