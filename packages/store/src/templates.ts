import { contentHash } from "@rhoeflow/calc";
import { TEMPLATES, TemplateSchema, getTemplate, type Template } from "@rhoeflow/templates";
import { nowIso, type StoreContext, type StoreDeps } from "./context.js";
import type { CreateTemplateRequest, CreateTemplateVersionRequest } from "./contracts.js";
import { StoreError } from "./errors.js";
import { markStaleWhere } from "./fingerprints.js";
import { templateVersionString, type AssessmentRow, type TemplateRow, type TemplateVersionRow } from "./records.js";

/**
 * Template store (WO-03 C7; ADR-024; owner decision 5). Every edit is a new immutable version;
 * every value keeps its source because `TemplateSchema` requires one; a run records the
 * template id and version it used so an edit marks exactly the right runs stale (C4).
 * The repo's seven templates stay the fixed set CI tests against; the store starts from them.
 */

async function requireEditor(deps: StoreDeps, ctx: StoreContext): Promise<string> {
  if (!ctx.user_id) throw new StoreError("forbidden", "template edits need a signed-in user");
  if (ctx.template_editor === true) return ctx.user_id;
  if (await deps.db.templateEditors.isEditor(ctx.team_id, ctx.user_id)) return ctx.user_id;
  throw new StoreError("forbidden", "this user is not on the template editor grant list", { user_id: ctx.user_id });
}

/** Seed the team's store from the repo templates; idempotent (existing ids are left alone). */
export async function seedTemplates(deps: StoreDeps, ctx: StoreContext): Promise<{ seeded: string[]; skipped: string[] }> {
  const seeded: string[] = [];
  const skipped: string[] = [];
  for (const t of TEMPLATES) {
    if (await deps.db.templates.get(ctx.team_id, t.template_id)) {
      skipped.push(t.template_id);
      continue;
    }
    const at = nowIso(deps);
    await deps.db.templates.insert({ template_id: t.template_id, workedge_team_id: ctx.team_id, name: t.name, current_version: 1, archived: false, created_at: at, updated_at: at });
    await deps.db.templateVersions.insert({
      template_id: t.template_id,
      workedge_team_id: ctx.team_id,
      version: 1,
      payload: t,
      content_hash: await contentHash(t),
      source: "repo",
      editor_user_id: null,
      change_note: "seeded from the repo template set (@rhoeflow/templates)",
      created_at: at,
    });
    seeded.push(t.template_id);
  }
  return { seeded, skipped };
}

export async function listTemplates(deps: StoreDeps, ctx: StoreContext): Promise<TemplateRow[]> {
  return deps.db.templates.list(ctx.team_id);
}

export async function listTemplateVersions(deps: StoreDeps, ctx: StoreContext, template_id: string): Promise<TemplateVersionRow[]> {
  return deps.db.templateVersions.list(ctx.team_id, template_id);
}

/**
 * The template an assessment or run should use: the team's stored version when the store has
 * it, else the repo's fixed copy with `version: null` (meaning "repo set, not yet seeded").
 */
export async function resolveTemplate(deps: StoreDeps, ctx: StoreContext, template_id: string, version?: string | null): Promise<{ template: Template; version: string | null }> {
  const row = await deps.db.templates.get(ctx.team_id, template_id);
  if (row) {
    const n = version ? Number(/^v(\d+)$/.exec(version)?.[1]) : row.current_version;
    if (!Number.isInteger(n) || n < 1) throw new StoreError("invalid_request", `bad template version "${version}"`);
    const v = await deps.db.templateVersions.get(ctx.team_id, template_id, n);
    if (!v) throw new StoreError("not_found", `template ${template_id} ${templateVersionString(n)} not found`);
    return { template: v.payload, version: templateVersionString(n) };
  }
  if (version) throw new StoreError("not_found", `template ${template_id} ${version} is not in the store`);
  try {
    return { template: getTemplate(template_id), version: null };
  } catch {
    throw new StoreError("not_found", `unknown template "${template_id}"`);
  }
}

export interface TemplateVersionResult {
  template: TemplateRow;
  version: TemplateVersionRow;
  /** Open assessments seeded from this template; the editor shows them before saving (D9). */
  affected_assessments: Pick<AssessmentRow, "assessment_id" | "workedge_project_id" | "template_version" | "revision">[];
  /** Runs marked stale because they recorded the superseded version (REV-002). */
  stale_runs: number;
}

/** Create a new immutable version of an existing template. */
export async function createTemplateVersion(deps: StoreDeps, ctx: StoreContext, template_id: string, req: CreateTemplateVersionRequest): Promise<TemplateVersionResult> {
  const editor = await requireEditor(deps, ctx);
  const payload = TemplateSchema.parse(req.payload);
  if (payload.template_id !== template_id) throw new StoreError("invalid_request", `payload is for template "${payload.template_id}", not "${template_id}"`);
  const row = await deps.db.templates.get(ctx.team_id, template_id);
  if (!row) throw new StoreError("not_found", `template ${template_id} is not in the store`);
  if (row.current_version !== req.expected_current_version) {
    throw new StoreError("precondition_failed", `template ${template_id} is at version ${row.current_version}, not ${req.expected_current_version}`, { current_version: row.current_version });
  }
  const previous = await deps.db.templateVersions.get(ctx.team_id, template_id, row.current_version);
  const content_hash = await contentHash(payload);
  if (previous && previous.content_hash === content_hash) throw new StoreError("invalid_request", "the payload is identical to the current version");
  const at = nowIso(deps);
  const next = row.current_version + 1;
  const version = await deps.db.templateVersions.insert({
    template_id,
    workedge_team_id: ctx.team_id,
    version: next,
    payload,
    content_hash,
    source: "editor",
    editor_user_id: editor,
    change_note: req.change_note,
    created_at: at,
  });
  const advanced = await deps.db.templates.advance(ctx.team_id, template_id, row.current_version, { current_version: next, name: payload.name, updated_at: at });
  if (!advanced) throw new StoreError("conflict", `template ${template_id} changed while saving; reload`);
  const superseded = `${template_id}@${templateVersionString(row.current_version)}`;
  const stale_runs = await markStaleWhere(deps, ctx, (r) => r.fingerprint?.template === superseded, `template ${template_id} ${templateVersionString(next)} supersedes ${templateVersionString(row.current_version)}`);
  const affected = (await deps.db.assessments.listByTemplate(ctx.team_id, template_id))
    .filter((a) => a.status === "open")
    .map((a) => ({ assessment_id: a.assessment_id, workedge_project_id: a.workedge_project_id, template_version: a.template_version, revision: a.revision }));
  return { template: advanced, version, affected_assessments: affected, stale_runs };
}

/** Create a template from scratch or from a copy (the editor sends the edited payload with a new id). */
export async function createTemplate(deps: StoreDeps, ctx: StoreContext, req: CreateTemplateRequest): Promise<TemplateVersionResult> {
  const editor = await requireEditor(deps, ctx);
  const payload = TemplateSchema.parse(req.payload);
  if (await deps.db.templates.get(ctx.team_id, payload.template_id)) throw new StoreError("conflict", `template ${payload.template_id} already exists; create a version instead`);
  const at = nowIso(deps);
  const template = await deps.db.templates.insert({ template_id: payload.template_id, workedge_team_id: ctx.team_id, name: payload.name, current_version: 1, archived: false, created_at: at, updated_at: at });
  const version = await deps.db.templateVersions.insert({
    template_id: payload.template_id,
    workedge_team_id: ctx.team_id,
    version: 1,
    payload,
    content_hash: await contentHash(payload),
    source: "editor",
    editor_user_id: editor,
    change_note: req.change_note,
    created_at: at,
  });
  return { template, version, affected_assessments: [], stale_runs: 0 };
}

/** Existing editors may add editors (the first grant is the SQL seed the owner runs). */
export async function grantTemplateEditor(deps: StoreDeps, ctx: StoreContext, user_id: string) {
  const by = await requireEditor(deps, ctx);
  return deps.db.templateEditors.grant({ workedge_team_id: ctx.team_id, workedge_user_id: user_id, granted_by: by, granted_at: nowIso(deps) });
}
