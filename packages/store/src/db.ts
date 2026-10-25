import type { WorkEdgeId } from "@rhoeflow/schema";
import type {
  AssessmentRevisionRow,
  AssessmentRow,
  CalcRunRow,
  ReportRow,
  RunArtifactRow,
  RunStatus,
  ScenarioRow,
  TemplateEditorRow,
  TemplateRow,
  TemplateVersionRow,
} from "./records.js";

/**
 * The database the services talk to. Every call is scoped to one `workedge_team_id`: the
 * Supabase adapter adds the filter on top of row-level security, and the memory store applies
 * it alone, so a service test that reaches across teams fails the same way production does
 * (SEC-001). Methods return `null` rather than throw for "not there" and for a failed
 * optimistic-concurrency check; uniqueness violations throw `StoreError("conflict")`.
 *
 * Deliberately a set of narrow operations, not a query builder, so the SQL constraints
 * (supabase/migrations) and the memory rules below can be compared line for line.
 */
export interface StoreDb {
  assessments: {
    get(team: WorkEdgeId, assessment_id: string): Promise<AssessmentRow | null>;
    /** The one open assessment for a WorkEdge project (partial unique index). */
    findOpenByProject(team: WorkEdgeId, project_id: WorkEdgeId): Promise<AssessmentRow | null>;
    insert(row: AssessmentRow): Promise<AssessmentRow>;
    /** Applies `patch` only when `draft_version` still equals `expected_draft_version`, bumping it. */
    updateDraft(
      team: WorkEdgeId,
      assessment_id: string,
      expected_draft_version: number,
      patch: Pick<AssessmentRow, "draft" | "updated_at"> & Partial<Pick<AssessmentRow, "template_id" | "template_version">>,
    ): Promise<AssessmentRow | null>;
    /** Records a new accepted revision number; same concurrency rule as updateDraft. */
    markAccepted(team: WorkEdgeId, assessment_id: string, expected_draft_version: number, revision: number, updated_at: string): Promise<AssessmentRow | null>;
    listByTemplate(team: WorkEdgeId, template_id: string): Promise<AssessmentRow[]>;
    setStatus(team: WorkEdgeId, assessment_id: string, status: AssessmentRow["status"], updated_at: string): Promise<AssessmentRow | null>;
  };
  revisions: {
    insert(row: AssessmentRevisionRow): Promise<AssessmentRevisionRow>;
    get(team: WorkEdgeId, assessment_id: string, revision: number): Promise<AssessmentRevisionRow | null>;
  };
  scenarios: {
    insert(row: ScenarioRow): Promise<ScenarioRow>;
    get(team: WorkEdgeId, scenario_id: string): Promise<ScenarioRow | null>;
    listByAssessment(team: WorkEdgeId, assessment_id: string): Promise<ScenarioRow[]>;
    /** Replaces name and overrides when `scenario_version` still matches, bumping it. */
    update(team: WorkEdgeId, scenario_id: string, expected_version: number, patch: Pick<ScenarioRow, "name" | "overrides" | "updated_at">): Promise<ScenarioRow | null>;
  };
  runs: {
    insert(row: CalcRunRow): Promise<CalcRunRow>;
    get(team: WorkEdgeId, run_id: string): Promise<CalcRunRow | null>;
    findByIdempotencyKey(team: WorkEdgeId, assessment_id: string, idempotency_key: string): Promise<CalcRunRow | null>;
    /** An `ok` run on the same frozen input with the same engine: the result would be identical. */
    findAccepted(team: WorkEdgeId, assessment_id: string, input_hash: string, engine_version: string): Promise<CalcRunRow | null>;
    /**
     * Applies `patch` only when the row's status is in `from`; returns null otherwise. This is
     * the state machine's guard: a cancel cannot overwrite `ok`, a late worker cannot overwrite
     * `cancelled` (API-002).
     */
    transition(team: WorkEdgeId, run_id: string, from: readonly RunStatus[], patch: Partial<Omit<CalcRunRow, "run_id" | "assessment_id" | "workedge_team_id">>): Promise<CalcRunRow | null>;
    listByAssessment(team: WorkEdgeId, assessment_id: string): Promise<CalcRunRow[]>;
    /** Every non-stale run of the team, for stale marking by fingerprint. */
    listFresh(team: WorkEdgeId): Promise<CalcRunRow[]>;
    /** Runs still `running` that started before `before`. */
    listRunningSince(team: WorkEdgeId, before: string): Promise<CalcRunRow[]>;
    markStale(team: WorkEdgeId, run_ids: string[], reason: string, at: string): Promise<number>;
  };
  artifacts: {
    insertMany(rows: RunArtifactRow[]): Promise<void>;
    listByRun(team: WorkEdgeId, run_id: string): Promise<RunArtifactRow[]>;
  };
  reports: {
    insert(row: ReportRow): Promise<ReportRow>;
    listByAssessment(team: WorkEdgeId, assessment_id: string): Promise<ReportRow[]>;
  };
  templates: {
    get(team: WorkEdgeId, template_id: string): Promise<TemplateRow | null>;
    list(team: WorkEdgeId): Promise<TemplateRow[]>;
    insert(row: TemplateRow): Promise<TemplateRow>;
    /** Advances `current_version` only from `expected_current_version`. */
    advance(team: WorkEdgeId, template_id: string, expected_current_version: number, patch: Pick<TemplateRow, "current_version" | "name" | "updated_at">): Promise<TemplateRow | null>;
    setArchived(team: WorkEdgeId, template_id: string, archived: boolean, updated_at: string): Promise<TemplateRow | null>;
  };
  templateVersions: {
    insert(row: TemplateVersionRow): Promise<TemplateVersionRow>;
    get(team: WorkEdgeId, template_id: string, version: number): Promise<TemplateVersionRow | null>;
    list(team: WorkEdgeId, template_id: string): Promise<TemplateVersionRow[]>;
  };
  templateEditors: {
    isEditor(team: WorkEdgeId, user_id: string): Promise<boolean>;
    grant(row: TemplateEditorRow): Promise<TemplateEditorRow>;
    list(team: WorkEdgeId): Promise<TemplateEditorRow[]>;
  };
}
