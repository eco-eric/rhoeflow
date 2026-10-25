import type { WorkEdgeId } from "@rhoeflow/schema";
import type { StoreDb } from "./db.js";
import { StoreError } from "./errors.js";
import {
  AssessmentRevisionRowSchema,
  AssessmentRowSchema,
  CalcRunRowSchema,
  ReportRowSchema,
  RunArtifactRowSchema,
  ScenarioRowSchema,
  TemplateEditorRowSchema,
  TemplateRowSchema,
  TemplateVersionRowSchema,
  type AssessmentRevisionRow,
  type AssessmentRow,
  type CalcRunRow,
  type ReportRow,
  type RunArtifactRow,
  type RunStatus,
  type ScenarioRow,
  type TemplateEditorRow,
  type TemplateRow,
  type TemplateVersionRow,
} from "./records.js";

const clone = <T>(v: T): T => structuredClone(v);

/**
 * In-memory `StoreDb` for tests and local development. It mirrors the SQL constraints in
 * supabase/migrations one for one (the comment on each rule names the index or trigger) so the
 * services can be tested without a database and the two implementations cannot drift silently.
 * Never used in production.
 */
export class MemoryStoreDb implements StoreDb {
  readonly rows = {
    assessments: [] as AssessmentRow[],
    revisions: [] as AssessmentRevisionRow[],
    scenarios: [] as ScenarioRow[],
    runs: [] as CalcRunRow[],
    artifacts: [] as RunArtifactRow[],
    reports: [] as ReportRow[],
    templates: [] as TemplateRow[],
    templateVersions: [] as TemplateVersionRow[],
    templateEditors: [] as TemplateEditorRow[],
  };

  readonly assessments: StoreDb["assessments"] = {
    get: async (team, id) => clone(this.rows.assessments.find((r) => r.workedge_team_id === team && r.assessment_id === id) ?? null),
    findOpenByProject: async (team, project_id) =>
      clone(this.rows.assessments.find((r) => r.workedge_team_id === team && r.workedge_project_id === project_id && r.status === "open") ?? null),
    insert: async (row) => {
      const r = AssessmentRowSchema.parse(row);
      // PK assessments(assessment_id)
      if (this.rows.assessments.some((x) => x.assessment_id === r.assessment_id)) throw new StoreError("conflict", `assessment ${r.assessment_id} already exists`);
      // UNIQUE INDEX assessments_one_open_per_project (workedge_project_id) WHERE status = 'open'
      if (r.status === "open" && this.rows.assessments.some((x) => x.workedge_project_id === r.workedge_project_id && x.status === "open")) {
        throw new StoreError("conflict", `project ${r.workedge_project_id} already has an open assessment`);
      }
      this.rows.assessments.push(clone(r));
      return clone(r);
    },
    updateDraft: async (team, id, expected, patch) => {
      const r = this.rows.assessments.find((x) => x.workedge_team_id === team && x.assessment_id === id);
      if (!r || r.draft_version !== expected) return null;
      r.draft = clone(patch.draft);
      r.updated_at = patch.updated_at;
      if (patch.template_id !== undefined) r.template_id = patch.template_id;
      if (patch.template_version !== undefined) r.template_version = patch.template_version;
      r.draft_version += 1;
      return clone(r);
    },
    markAccepted: async (team, id, expected, revision, updated_at) => {
      const r = this.rows.assessments.find((x) => x.workedge_team_id === team && x.assessment_id === id);
      if (!r || r.draft_version !== expected) return null;
      // CHECK via trigger assessments_revision_monotonic: revision only grows by one
      if (revision !== r.revision + 1) throw new StoreError("conflict", `revision must be ${r.revision + 1}, got ${revision}`);
      r.revision = revision;
      r.updated_at = updated_at;
      r.draft_version += 1;
      return clone(r);
    },
    listByTemplate: async (team, template_id) => clone(this.rows.assessments.filter((r) => r.workedge_team_id === team && r.template_id === template_id)),
    setStatus: async (team, id, status, updated_at) => {
      const r = this.rows.assessments.find((x) => x.workedge_team_id === team && x.assessment_id === id);
      if (!r) return null;
      r.status = status;
      r.updated_at = updated_at;
      return clone(r);
    },
  };

  readonly revisions: StoreDb["revisions"] = {
    insert: async (row) => {
      const r = AssessmentRevisionRowSchema.parse(row);
      // PK assessment_revisions(assessment_id, revision); FK to the team's assessment
      if (this.rows.revisions.some((x) => x.assessment_id === r.assessment_id && x.revision === r.revision)) {
        throw new StoreError("conflict", `revision ${r.revision} of ${r.assessment_id} already exists`);
      }
      this.assertOwned(r.workedge_team_id, r.assessment_id);
      this.rows.revisions.push(clone(r));
      return clone(r);
    },
    get: async (team, id, revision) => clone(this.rows.revisions.find((x) => x.workedge_team_id === team && x.assessment_id === id && x.revision === revision) ?? null),
  };

  readonly scenarios: StoreDb["scenarios"] = {
    insert: async (row) => {
      const r = ScenarioRowSchema.parse(row);
      if (this.rows.scenarios.some((x) => x.scenario_id === r.scenario_id)) throw new StoreError("conflict", `scenario ${r.scenario_id} already exists`);
      this.assertOwned(r.workedge_team_id, r.assessment_id);
      this.rows.scenarios.push(clone(r));
      return clone(r);
    },
    get: async (team, id) => clone(this.rows.scenarios.find((x) => x.workedge_team_id === team && x.scenario_id === id) ?? null),
    listByAssessment: async (team, id) => clone(this.rows.scenarios.filter((x) => x.workedge_team_id === team && x.assessment_id === id)),
    update: async (team, id, expected, patch) => {
      const r = this.rows.scenarios.find((x) => x.workedge_team_id === team && x.scenario_id === id);
      if (!r || r.scenario_version !== expected) return null;
      r.name = patch.name;
      r.overrides = clone(patch.overrides);
      r.updated_at = patch.updated_at;
      r.scenario_version += 1;
      return clone(r);
    },
  };

  readonly runs: StoreDb["runs"] = {
    insert: async (row) => {
      const r = CalcRunRowSchema.parse(row);
      if (this.rows.runs.some((x) => x.run_id === r.run_id)) throw new StoreError("conflict", `run ${r.run_id} already exists`);
      // UNIQUE calc_runs(assessment_id, idempotency_key)
      if (this.rows.runs.some((x) => x.assessment_id === r.assessment_id && x.idempotency_key === r.idempotency_key)) {
        throw new StoreError("conflict", `idempotency key ${r.idempotency_key} already used on ${r.assessment_id}`);
      }
      this.assertOwned(r.workedge_team_id, r.assessment_id);
      this.assertOneAccepted(r);
      this.rows.runs.push(clone(r));
      return clone(r);
    },
    get: async (team, id) => clone(this.rows.runs.find((x) => x.workedge_team_id === team && x.run_id === id) ?? null),
    findByIdempotencyKey: async (team, assessment_id, key) =>
      clone(this.rows.runs.find((x) => x.workedge_team_id === team && x.assessment_id === assessment_id && x.idempotency_key === key) ?? null),
    findAccepted: async (team, assessment_id, input_hash, engine_version) =>
      clone(
        this.rows.runs.find((x) => x.workedge_team_id === team && x.assessment_id === assessment_id && x.status === "ok" && x.input_hash === input_hash && x.engine_version === engine_version) ??
          null,
      ),
    transition: async (team, id, from, patch) => {
      const r = this.rows.runs.find((x) => x.workedge_team_id === team && x.run_id === id);
      if (!r || !from.includes(r.status)) return null;
      const next = CalcRunRowSchema.parse({ ...r, ...clone(patch) });
      // TRIGGER calc_runs_terminal_immutable: a terminal status never changes again
      if (r.status !== next.status && (["ok", "error", "cancelled", "timed_out"] as RunStatus[]).includes(r.status)) return null;
      this.assertOneAccepted(next, r.run_id);
      Object.assign(r, next);
      return clone(r);
    },
    listByAssessment: async (team, id) => clone(this.rows.runs.filter((x) => x.workedge_team_id === team && x.assessment_id === id)),
    listFresh: async (team) => clone(this.rows.runs.filter((x) => x.workedge_team_id === team && !x.stale)),
    listRunningSince: async (team, before) => clone(this.rows.runs.filter((x) => x.workedge_team_id === team && x.status === "running" && x.started_at !== null && x.started_at < before)),
    markStale: async (team, ids, reason, at) => {
      let n = 0;
      for (const r of this.rows.runs) {
        if (r.workedge_team_id === team && ids.includes(r.run_id) && !r.stale) {
          r.stale = true;
          r.stale_reason = reason;
          r.stale_at = at;
          n++;
        }
      }
      return n;
    },
  };

  readonly artifacts: StoreDb["artifacts"] = {
    insertMany: async (rows) => {
      for (const row of rows) {
        const r = RunArtifactRowSchema.parse(row);
        // PK run_artifacts(run_id, path)
        if (this.rows.artifacts.some((x) => x.run_id === r.run_id && x.path === r.path)) throw new StoreError("conflict", `artifact ${r.path} of ${r.run_id} already exists`);
        const run = this.rows.runs.find((x) => x.run_id === r.run_id);
        if (!run || run.workedge_team_id !== r.workedge_team_id) throw new StoreError("forbidden", `run ${r.run_id} is not this team's`);
        this.rows.artifacts.push(clone(r));
      }
    },
    listByRun: async (team, run_id) => clone(this.rows.artifacts.filter((x) => x.workedge_team_id === team && x.run_id === run_id)),
  };

  readonly reports: StoreDb["reports"] = {
    insert: async (row) => {
      const r = ReportRowSchema.parse(row);
      if (this.rows.reports.some((x) => x.report_id === r.report_id)) throw new StoreError("conflict", `report ${r.report_id} already exists`);
      // UNIQUE reports(assessment_id, report_revision)
      if (this.rows.reports.some((x) => x.assessment_id === r.assessment_id && x.report_revision === r.report_revision)) {
        throw new StoreError("conflict", `report revision ${r.report_revision} of ${r.assessment_id} already exists`);
      }
      const run = this.rows.runs.find((x) => x.run_id === r.run_id);
      if (!run || run.workedge_team_id !== r.workedge_team_id) throw new StoreError("forbidden", `run ${r.run_id} is not this team's`);
      // TRIGGER reports_require_fresh_ok_run
      if (run.status !== "ok" || run.stale) throw new StoreError("stale", `run ${r.run_id} is ${run.stale ? "stale" : run.status} and cannot feed a report`);
      this.rows.reports.push(clone(r));
      return clone(r);
    },
    listByAssessment: async (team, id) => clone(this.rows.reports.filter((x) => x.workedge_team_id === team && x.assessment_id === id)),
  };

  readonly templates: StoreDb["templates"] = {
    get: async (team, id) => clone(this.rows.templates.find((x) => x.workedge_team_id === team && x.template_id === id) ?? null),
    list: async (team) => clone(this.rows.templates.filter((x) => x.workedge_team_id === team)),
    insert: async (row) => {
      const r = TemplateRowSchema.parse(row);
      // PK templates(workedge_team_id, template_id)
      if (this.rows.templates.some((x) => x.workedge_team_id === r.workedge_team_id && x.template_id === r.template_id)) {
        throw new StoreError("conflict", `template ${r.template_id} already exists`);
      }
      this.rows.templates.push(clone(r));
      return clone(r);
    },
    advance: async (team, id, expected, patch) => {
      const r = this.rows.templates.find((x) => x.workedge_team_id === team && x.template_id === id);
      if (!r || r.current_version !== expected) return null;
      if (patch.current_version !== expected + 1) throw new StoreError("conflict", `template version must be ${expected + 1}`);
      r.current_version = patch.current_version;
      r.name = patch.name;
      r.updated_at = patch.updated_at;
      return clone(r);
    },
    setArchived: async (team, id, archived, updated_at) => {
      const r = this.rows.templates.find((x) => x.workedge_team_id === team && x.template_id === id);
      if (!r) return null;
      r.archived = archived;
      r.updated_at = updated_at;
      return clone(r);
    },
  };

  readonly templateVersions: StoreDb["templateVersions"] = {
    insert: async (row) => {
      const r = TemplateVersionRowSchema.parse(row);
      // PK template_versions(workedge_team_id, template_id, version)
      if (this.rows.templateVersions.some((x) => x.workedge_team_id === r.workedge_team_id && x.template_id === r.template_id && x.version === r.version)) {
        throw new StoreError("conflict", `template ${r.template_id} v${r.version} already exists`);
      }
      this.rows.templateVersions.push(clone(r));
      return clone(r);
    },
    get: async (team, id, version) => clone(this.rows.templateVersions.find((x) => x.workedge_team_id === team && x.template_id === id && x.version === version) ?? null),
    list: async (team, id) => clone(this.rows.templateVersions.filter((x) => x.workedge_team_id === team && x.template_id === id).sort((a, b) => a.version - b.version)),
  };

  readonly templateEditors: StoreDb["templateEditors"] = {
    isEditor: async (team, user_id) => this.rows.templateEditors.some((x) => x.workedge_team_id === team && x.workedge_user_id === user_id),
    grant: async (row) => {
      const r = TemplateEditorRowSchema.parse(row);
      const existing = this.rows.templateEditors.find((x) => x.workedge_team_id === r.workedge_team_id && x.workedge_user_id === r.workedge_user_id);
      if (existing) return clone(existing);
      this.rows.templateEditors.push(clone(r));
      return clone(r);
    },
    list: async (team) => clone(this.rows.templateEditors.filter((x) => x.workedge_team_id === team)),
  };

  /** FK + RLS: a child row must belong to an assessment of the same team. */
  private assertOwned(team: WorkEdgeId, assessment_id: string): void {
    const a = this.rows.assessments.find((x) => x.assessment_id === assessment_id);
    if (!a || a.workedge_team_id !== team) throw new StoreError("forbidden", `assessment ${assessment_id} is not this team's`);
  }

  /** UNIQUE INDEX calc_runs_one_accepted (assessment_id, input_hash, engine_version) WHERE status = 'ok' */
  private assertOneAccepted(r: CalcRunRow, exceptRunId?: string): void {
    if (r.status !== "ok" || r.input_hash === null) return;
    const dup = this.rows.runs.find(
      (x) => x.run_id !== exceptRunId && x.assessment_id === r.assessment_id && x.status === "ok" && x.input_hash === r.input_hash && x.engine_version === r.engine_version,
    );
    if (dup) throw new StoreError("conflict", `run ${dup.run_id} already accepted this exact input with engine ${r.engine_version}`);
  }
}
