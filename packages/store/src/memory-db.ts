import type { WorkEdgeId } from "@rhoeflow/schema";
import type { StoreDb } from "./db.js";
import { StoreError } from "./errors.js";
import {
  AssessmentRevisionRowSchema,
  AssessmentRowSchema,
  CalcRunRowSchema,
  JobRowSchema,
  ReportRowSchema,
  RunArtifactRowSchema,
  ScenarioRowSchema,
  TemplateEditorRowSchema,
  TemplateRowSchema,
  TemplateVersionRowSchema,
  type AssessmentRevisionRow,
  type AssessmentRow,
  type CalcRunRow,
  type JobRow,
  type ReportRow,
  type RunArtifactRow,
  type RunStatus,
  type ScenarioRow,
  type TemplateEditorRow,
  type TemplateRow,
  type TemplateVersionRow,
} from "./records.js";
import { CountyHomeRowSchema, JobSiteRowSchema, type CountyHomeRow, type JobSiteRow } from "./house.js";
import { AccountDesignRowSchema, type AccountDesignRow } from "./design.js";

const clone = <T>(v: T): T => structuredClone(v);

/**
 * In-memory `StoreDb` for tests and local development. It mirrors the SQL constraints in
 * supabase/migrations one for one (the comment on each rule names the index or trigger) so the
 * services can be tested without a database and the two implementations cannot drift silently.
 * Never used in production.
 */
export class MemoryStoreDb implements StoreDb {
  readonly rows = {
    jobs: [] as JobRow[],
    assessments: [] as AssessmentRow[],
    revisions: [] as AssessmentRevisionRow[],
    scenarios: [] as ScenarioRow[],
    runs: [] as CalcRunRow[],
    artifacts: [] as RunArtifactRow[],
    reports: [] as ReportRow[],
    templates: [] as TemplateRow[],
    templateVersions: [] as TemplateVersionRow[],
    templateEditors: [] as TemplateEditorRow[],
    jobSites: [] as JobSiteRow[],
    designSettings: [] as AccountDesignRow[],
    countyHomes: [] as CountyHomeRow[],
  };

  readonly jobSites: StoreDb["jobSites"] = {
    get: async (team, id) => clone(this.rows.jobSites.find((r) => r.account_id === team && r.job_id === id) ?? null),
    upsert: async (row) => {
      const r = JobSiteRowSchema.parse(row);
      // TRIGGER job_sites_job_account: the job must be the same account's
      if (!this.rows.jobs.some((x) => x.job_id === r.job_id && x.account_id === r.account_id)) throw new StoreError("forbidden", `job ${r.job_id} not found for this account`);
      // PK job_sites(job_id): replace
      this.rows.jobSites = this.rows.jobSites.filter((x) => x.job_id !== r.job_id);
      this.rows.jobSites.push(clone(r));
      return clone(r);
    },
  };

  readonly designSettings: StoreDb["designSettings"] = {
    get: async (team) => clone(this.rows.designSettings.find((r) => r.account_id === team) ?? null),
    upsert: async (row) => {
      const r = AccountDesignRowSchema.parse(row);
      // PK account_design_settings(account_id): replace
      this.rows.designSettings = this.rows.designSettings.filter((x) => x.account_id !== r.account_id);
      this.rows.designSettings.push(clone(r));
      return clone(r);
    },
  };

  readonly countyHomes: StoreDb["countyHomes"] = {
    findBySitus: async (key) => clone(this.rows.countyHomes.filter((r) => r.situs_key === key)),
  };

  /** Test and development seeding of county records (production loads them with tools/county-import). */
  seedCountyHomes(rows: CountyHomeRow[]): void {
    for (const row of rows) {
      const r = CountyHomeRowSchema.parse(row);
      // PK county_property(county, account_num)
      this.rows.countyHomes = this.rows.countyHomes.filter((x) => !(x.county === r.county && x.account_num === r.account_num));
      this.rows.countyHomes.push(r);
    }
  }

  readonly jobs: StoreDb["jobs"] = {
    get: async (team, id) => clone(this.rows.jobs.find((r) => r.account_id === team && r.job_id === id) ?? null),
    list: async (team, { limit, before, show = "active", words = [] }) =>
      clone(
        this.rows.jobs
          .filter((r) => r.account_id === team && (!before || Date.parse(r.created_at) < Date.parse(before)))
          .filter((r) => show === "all" || (show === "archived") === (r.archived_at !== null))
          // GENERATED COLUMN jobs.search_text: lower(name, customer and address joined by spaces)
          .filter((r) => {
            const text = [r.name, r.customer_name, r.address_line1, r.address_line2, r.city, r.state, r.postal_code].map((v) => v ?? "").join(" ").toLowerCase();
            return words.every((w) => text.includes(w));
          })
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
          .slice(0, limit),
      ),
    setArchived: async (team, id, archived_at, archived_by, updated_at) => {
      const r = this.rows.jobs.find((x) => x.account_id === team && x.job_id === id);
      if (!r) return null;
      // CHECK jobs_archived_by_needs_archived_at
      if (archived_by !== null && archived_at === null) throw new StoreError("invalid_request", "archived_by needs archived_at");
      Object.assign(r, { archived_at, archived_by, updated_at });
      return clone(r);
    },
    findByWorkEdgeProject: async (team, project_id) => clone(this.rows.jobs.find((r) => r.account_id === team && r.workedge_project_id === project_id) ?? null),
    insert: async (row) => {
      const r = JobRowSchema.parse(row);
      // PK jobs(job_id)
      if (this.rows.jobs.some((x) => x.job_id === r.job_id)) throw new StoreError("conflict", `job ${r.job_id} already exists`);
      // UNIQUE INDEX jobs_one_per_workedge_project (account_id, workedge_project_id) WHERE workedge_project_id IS NOT NULL
      if (r.workedge_project_id && this.rows.jobs.some((x) => x.account_id === r.account_id && x.workedge_project_id === r.workedge_project_id)) {
        throw new StoreError("conflict", `WorkEdge project ${r.workedge_project_id} already has a job`);
      }
      this.rows.jobs.push(clone(r));
      return clone(r);
    },
    update: async (team, id, patch) => {
      const r = this.rows.jobs.find((x) => x.account_id === team && x.job_id === id);
      if (!r) return null;
      const next = JobRowSchema.parse({ ...r, ...patch });
      Object.assign(r, next);
      return clone(r);
    },
    linkWorkEdge: async (team, id, project_id, property_id, updated_at) => {
      const r = this.rows.jobs.find((x) => x.account_id === team && x.job_id === id);
      // TRIGGER jobs_guard: a linked job is never re-pointed
      if (!r || r.workedge_project_id !== null) return null;
      if (this.rows.jobs.some((x) => x.account_id === team && x.workedge_project_id === project_id)) {
        throw new StoreError("conflict", `WorkEdge project ${project_id} already has a job`);
      }
      r.workedge_project_id = project_id;
      r.workedge_property_id = property_id;
      r.updated_at = updated_at;
      return clone(r);
    },
  };

  readonly assessments: StoreDb["assessments"] = {
    get: async (team, id) => clone(this.rows.assessments.find((r) => r.account_id === team && r.assessment_id === id) ?? null),
    findOpenByJob: async (team, job_id) => clone(this.rows.assessments.find((r) => r.account_id === team && r.job_id === job_id && r.status === "open") ?? null),
    listByJob: async (team, job_id) => clone(this.rows.assessments.filter((r) => r.account_id === team && r.job_id === job_id)),
    linkWorkEdge: async (team, job_id, project_id, property_id) => {
      let n = 0;
      for (const r of this.rows.assessments) {
        if (r.account_id === team && r.job_id === job_id && r.workedge_project_id === null) {
          r.workedge_project_id = project_id;
          r.workedge_property_id = property_id;
          n += 1;
        }
      }
      return n;
    },
    insert: async (row) => {
      const r = AssessmentRowSchema.parse(row);
      // PK assessments(assessment_id)
      if (this.rows.assessments.some((x) => x.assessment_id === r.assessment_id)) throw new StoreError("conflict", `assessment ${r.assessment_id} already exists`);
      // TRIGGER assessments_job_account: the job must be the same account's
      if (!this.rows.jobs.some((x) => x.job_id === r.job_id && x.account_id === r.account_id)) throw new StoreError("forbidden", `job ${r.job_id} not found for this account`);
      // UNIQUE INDEX assessments_one_open_per_job (job_id) WHERE status = 'open'
      if (r.status === "open" && this.rows.assessments.some((x) => x.job_id === r.job_id && x.status === "open")) {
        throw new StoreError("conflict", `job ${r.job_id} already has an open assessment`);
      }
      this.rows.assessments.push(clone(r));
      return clone(r);
    },
    updateDraft: async (team, id, expected, patch) => {
      const r = this.rows.assessments.find((x) => x.account_id === team && x.assessment_id === id);
      if (!r || r.draft_version !== expected) return null;
      r.draft = clone(patch.draft);
      r.updated_at = patch.updated_at;
      if (patch.template_id !== undefined) r.template_id = patch.template_id;
      if (patch.template_version !== undefined) r.template_version = patch.template_version;
      r.draft_version += 1;
      return clone(r);
    },
    markAccepted: async (team, id, expected, revision, updated_at) => {
      const r = this.rows.assessments.find((x) => x.account_id === team && x.assessment_id === id);
      if (!r || r.draft_version !== expected) return null;
      // CHECK via trigger assessments_revision_monotonic: revision only grows by one
      if (revision !== r.revision + 1) throw new StoreError("conflict", `revision must be ${r.revision + 1}, got ${revision}`);
      r.revision = revision;
      r.updated_at = updated_at;
      r.draft_version += 1;
      return clone(r);
    },
    listByTemplate: async (team, template_id) => clone(this.rows.assessments.filter((r) => r.account_id === team && r.template_id === template_id)),
    setStatus: async (team, id, status, updated_at) => {
      const r = this.rows.assessments.find((x) => x.account_id === team && x.assessment_id === id);
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
      this.assertOwned(r.account_id, r.assessment_id);
      this.rows.revisions.push(clone(r));
      return clone(r);
    },
    get: async (team, id, revision) => clone(this.rows.revisions.find((x) => x.account_id === team && x.assessment_id === id && x.revision === revision) ?? null),
  };

  readonly scenarios: StoreDb["scenarios"] = {
    insert: async (row) => {
      const r = ScenarioRowSchema.parse(row);
      if (this.rows.scenarios.some((x) => x.scenario_id === r.scenario_id)) throw new StoreError("conflict", `scenario ${r.scenario_id} already exists`);
      this.assertOwned(r.account_id, r.assessment_id);
      this.rows.scenarios.push(clone(r));
      return clone(r);
    },
    get: async (team, id) => clone(this.rows.scenarios.find((x) => x.account_id === team && x.scenario_id === id) ?? null),
    listByAssessment: async (team, id) => clone(this.rows.scenarios.filter((x) => x.account_id === team && x.assessment_id === id)),
    update: async (team, id, expected, patch) => {
      const r = this.rows.scenarios.find((x) => x.account_id === team && x.scenario_id === id);
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
      this.assertOwned(r.account_id, r.assessment_id);
      this.assertOneAccepted(r);
      this.rows.runs.push(clone(r));
      return clone(r);
    },
    get: async (team, id) => clone(this.rows.runs.find((x) => x.account_id === team && x.run_id === id) ?? null),
    findByIdempotencyKey: async (team, assessment_id, key) =>
      clone(this.rows.runs.find((x) => x.account_id === team && x.assessment_id === assessment_id && x.idempotency_key === key) ?? null),
    findAccepted: async (team, assessment_id, input_hash, engine_version) =>
      clone(
        this.rows.runs.find((x) => x.account_id === team && x.assessment_id === assessment_id && x.status === "ok" && x.input_hash === input_hash && x.engine_version === engine_version) ??
          null,
      ),
    transition: async (team, id, from, patch) => {
      const r = this.rows.runs.find((x) => x.account_id === team && x.run_id === id);
      if (!r || !from.includes(r.status)) return null;
      const next = CalcRunRowSchema.parse({ ...r, ...clone(patch) });
      // TRIGGER calc_runs_terminal_immutable: a terminal status never changes again
      if (r.status !== next.status && (["ok", "error", "cancelled", "timed_out"] as RunStatus[]).includes(r.status)) return null;
      this.assertOneAccepted(next, r.run_id);
      Object.assign(r, next);
      return clone(r);
    },
    listByAssessment: async (team, id) => clone(this.rows.runs.filter((x) => x.account_id === team && x.assessment_id === id)),
    listFresh: async (team) => clone(this.rows.runs.filter((x) => x.account_id === team && !x.stale)),
    listRunningSince: async (team, before) => clone(this.rows.runs.filter((x) => x.account_id === team && x.status === "running" && x.started_at !== null && x.started_at < before)),
    markStale: async (team, ids, reason, at) => {
      let n = 0;
      for (const r of this.rows.runs) {
        if (r.account_id === team && ids.includes(r.run_id) && !r.stale) {
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
        if (!run || run.account_id !== r.account_id) throw new StoreError("forbidden", `run ${r.run_id} is not this team's`);
        this.rows.artifacts.push(clone(r));
      }
    },
    listByRun: async (team, run_id) => clone(this.rows.artifacts.filter((x) => x.account_id === team && x.run_id === run_id)),
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
      if (!run || run.account_id !== r.account_id) throw new StoreError("forbidden", `run ${r.run_id} is not this team's`);
      // TRIGGER reports_require_fresh_ok_run
      if (run.status !== "ok" || run.stale) throw new StoreError("stale", `run ${r.run_id} is ${run.stale ? "stale" : run.status} and cannot feed a report`);
      this.rows.reports.push(clone(r));
      return clone(r);
    },
    listByAssessment: async (team, id) => clone(this.rows.reports.filter((x) => x.account_id === team && x.assessment_id === id)),
  };

  readonly templates: StoreDb["templates"] = {
    get: async (team, id) => clone(this.rows.templates.find((x) => x.account_id === team && x.template_id === id) ?? null),
    list: async (team) => clone(this.rows.templates.filter((x) => x.account_id === team)),
    insert: async (row) => {
      const r = TemplateRowSchema.parse(row);
      // PK templates(account_id, template_id)
      if (this.rows.templates.some((x) => x.account_id === r.account_id && x.template_id === r.template_id)) {
        throw new StoreError("conflict", `template ${r.template_id} already exists`);
      }
      this.rows.templates.push(clone(r));
      return clone(r);
    },
    advance: async (team, id, expected, patch) => {
      const r = this.rows.templates.find((x) => x.account_id === team && x.template_id === id);
      if (!r || r.current_version !== expected) return null;
      if (patch.current_version !== expected + 1) throw new StoreError("conflict", `template version must be ${expected + 1}`);
      r.current_version = patch.current_version;
      r.name = patch.name;
      r.updated_at = patch.updated_at;
      return clone(r);
    },
    setArchived: async (team, id, archived, updated_at) => {
      const r = this.rows.templates.find((x) => x.account_id === team && x.template_id === id);
      if (!r) return null;
      r.archived = archived;
      r.updated_at = updated_at;
      return clone(r);
    },
  };

  readonly templateVersions: StoreDb["templateVersions"] = {
    insert: async (row) => {
      const r = TemplateVersionRowSchema.parse(row);
      // PK template_versions(account_id, template_id, version)
      if (this.rows.templateVersions.some((x) => x.account_id === r.account_id && x.template_id === r.template_id && x.version === r.version)) {
        throw new StoreError("conflict", `template ${r.template_id} v${r.version} already exists`);
      }
      this.rows.templateVersions.push(clone(r));
      return clone(r);
    },
    get: async (team, id, version) => clone(this.rows.templateVersions.find((x) => x.account_id === team && x.template_id === id && x.version === version) ?? null),
    list: async (team, id) => clone(this.rows.templateVersions.filter((x) => x.account_id === team && x.template_id === id).sort((a, b) => a.version - b.version)),
  };

  readonly templateEditors: StoreDb["templateEditors"] = {
    isEditor: async (team, user_id) => this.rows.templateEditors.some((x) => x.account_id === team && x.user_id === user_id),
    grant: async (row) => {
      const r = TemplateEditorRowSchema.parse(row);
      const existing = this.rows.templateEditors.find((x) => x.account_id === r.account_id && x.user_id === r.user_id);
      if (existing) return clone(existing);
      this.rows.templateEditors.push(clone(r));
      return clone(r);
    },
    list: async (team) => clone(this.rows.templateEditors.filter((x) => x.account_id === team)),
  };

  /** FK + RLS: a child row must belong to an assessment of the same team. */
  private assertOwned(team: WorkEdgeId, assessment_id: string): void {
    const a = this.rows.assessments.find((x) => x.assessment_id === assessment_id);
    if (!a || a.account_id !== team) throw new StoreError("forbidden", `assessment ${assessment_id} is not this team's`);
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
