import { z } from "zod";
import { AssessmentIdSchema, AssessmentSchema, IsoTimestampSchema, WorkEdgeIdSchema } from "@rhoeflow/schema";
import { LoadTotalsSchema, MethodIdSchema, ScenarioOverrideSchema, WarningSchema, WeatherRefSchema } from "@rhoeflow/calc";
import { TemplateSchema } from "@rhoeflow/templates";

/**
 * Row shapes of RhoeFlow's own tables (WO-03 C1; schema `rhoe` in supabase/migrations).
 * Every row carries `workedge_team_id`: row-level security filters on it (SEC-001) and the
 * in-memory store applies the same rule, so service tests exercise isolation too.
 *
 * There is no table for a job, customer, property, photo file or user (ADR-028).
 */

export const UuidSchema = z.uuid();
export const UserIdSchema = z.string().trim().min(1);
const Hash = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const ASSESSMENT_STATUSES = ["open", "closed"] as const;

export const AssessmentRowSchema = z.strictObject({
  assessment_id: AssessmentIdSchema,
  workedge_team_id: WorkEdgeIdSchema,
  workedge_project_id: WorkEdgeIdSchema,
  workedge_property_id: WorkEdgeIdSchema,
  workedge_customer_id: WorkEdgeIdSchema.nullable(),
  status: z.enum(ASSESSMENT_STATUSES),
  /** Latest accepted revision; 0 until the first acceptance. Runs pin a revision >= 1. */
  revision: z.number().int().nonnegative(),
  /** The working copy. May be incomplete; validated only on accept (C2). */
  draft: z.unknown().nullable(),
  /** Optimistic-concurrency token for the draft; every save must name the version it read. */
  draft_version: z.number().int().nonnegative(),
  template_id: z.string().min(1).nullable(),
  template_version: z.string().min(1).nullable(),
  created_at: IsoTimestampSchema,
  updated_at: IsoTimestampSchema,
  created_by: UserIdSchema.nullable(),
});
export type AssessmentRow = z.output<typeof AssessmentRowSchema>;

/** An accepted, validated snapshot. Immutable once written (DAT-004). */
export const AssessmentRevisionRowSchema = z.strictObject({
  assessment_id: AssessmentIdSchema,
  workedge_team_id: WorkEdgeIdSchema,
  revision: z.number().int().positive(),
  snapshot: AssessmentSchema,
  /** `sha256:` over the canonical snapshot; the inputs fingerprint of every run on it. */
  content_hash: Hash,
  accepted_at: IsoTimestampSchema,
  accepted_by: UserIdSchema.nullable(),
});
export type AssessmentRevisionRow = z.output<typeof AssessmentRevisionRowSchema>;

export const ScenarioRowSchema = z.strictObject({
  scenario_id: UuidSchema,
  assessment_id: AssessmentIdSchema,
  workedge_team_id: WorkEdgeIdSchema,
  name: z.string().min(1).max(120),
  overrides: z.array(ScenarioOverrideSchema),
  /** Bumped on every edit; a run records the version it used. */
  scenario_version: z.number().int().positive(),
  created_at: IsoTimestampSchema,
  updated_at: IsoTimestampSchema,
  created_by: UserIdSchema.nullable(),
});
export type ScenarioRow = z.output<typeof ScenarioRowSchema>;

export const RUN_STATUSES = ["queued", "running", "ok", "error", "cancelled", "timed_out"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
/** No transition leaves these (API-002). */
export const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set(["ok", "error", "cancelled", "timed_out"]);

/**
 * Dependency fingerprints (REV-002; plan §Frozen runs). A change to any one marks exactly the
 * runs that carry the old value stale, visibly, and a stale run cannot feed a new report.
 */
export const RunFingerprintSchema = z.strictObject({
  /** The accepted revision's content hash plus the scenario version, so either change counts. */
  inputs: z.string().min(1),
  /** `<library>@<version>`. */
  weather: z.string().min(1),
  /** `<engine>@<version>` plus the sorted method ids the run executed. */
  methods: z.string().min(1),
  /** `<template_id>@<template_version>`, or null when no template seeded the assessment. */
  template: z.string().min(1).nullable(),
});
export type RunFingerprint = z.output<typeof RunFingerprintSchema>;

export const CalcRunRowSchema = z.strictObject({
  run_id: UuidSchema,
  assessment_id: AssessmentIdSchema,
  workedge_team_id: WorkEdgeIdSchema,
  /** Accepted revision the run froze. */
  revision: z.number().int().positive(),
  scenario_id: UuidSchema.nullable(),
  scenario_version: z.number().int().positive().nullable(),
  /** Caller-supplied; unique per assessment, so a retried request finds its run (API-002). */
  idempotency_key: z.string().min(1).max(128),
  status: z.enum(RUN_STATUSES),
  requested_at: IsoTimestampSchema,
  started_at: IsoTimestampSchema.nullable(),
  finished_at: IsoTimestampSchema.nullable(),
  engine_name: z.string().min(1),
  engine_version: z.string().min(1),
  weather: WeatherRefSchema,
  template_id: z.string().min(1).nullable(),
  template_version: z.string().min(1).nullable(),
  /** `sha256:` of the canonical CalcInput; null until the input was frozen. */
  input_hash: Hash.nullable(),
  method_ids: z.array(MethodIdSchema),
  fingerprint: RunFingerprintSchema.nullable(),
  stale: z.boolean(),
  stale_reason: z.string().min(1).nullable(),
  stale_at: IsoTimestampSchema.nullable(),
  totals: LoadTotalsSchema.nullable(),
  warnings: z.array(WarningSchema),
  errors: z.array(WarningSchema),
  /** Object-storage prefix of the artifact bundle (`<team>/<assessment>/<run>/`). */
  bundle_prefix: z.string().min(1).nullable(),
  requested_by: UserIdSchema.nullable(),
});
export type CalcRunRow = z.output<typeof CalcRunRowSchema>;

export const RunArtifactRowSchema = z.strictObject({
  run_id: UuidSchema,
  workedge_team_id: WorkEdgeIdSchema,
  /** Path inside the bundle, e.g. `output.json`. */
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().nonnegative(),
  content_type: z.string().min(1),
  storage_bucket: z.string().min(1),
  storage_path: z.string().min(1),
});
export type RunArtifactRow = z.output<typeof RunArtifactRowSchema>;

export const REPORT_TYPES = ["engineering", "customer_summary"] as const;
export const WRITE_BACK_STATUSES = ["queued", "done", "failed"] as const;

/** Issued reports are immutable (REV-001); a change needs a new run and a new revision. */
export const ReportRowSchema = z.strictObject({
  report_id: UuidSchema,
  assessment_id: AssessmentIdSchema,
  workedge_team_id: WorkEdgeIdSchema,
  run_id: UuidSchema,
  /** Per-assessment report revision, 1-based. */
  report_revision: z.number().int().positive(),
  report_type: z.enum(REPORT_TYPES),
  issued_at: IsoTimestampSchema,
  issued_by: UserIdSchema.nullable(),
  /** Object-storage path of the rendered PDF; null until E2 renders one. */
  storage_path: z.string().min(1).nullable(),
  content_hash: Hash.nullable(),
  write_back_status: z.enum(WRITE_BACK_STATUSES),
  workedge_report_id: z.string().min(1).nullable(),
});
export type ReportRow = z.output<typeof ReportRowSchema>;

export const TEMPLATE_VERSION_SOURCES = ["repo", "editor"] as const;

export const TemplateRowSchema = z.strictObject({
  template_id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  workedge_team_id: WorkEdgeIdSchema,
  name: z.string().min(1),
  /** Latest immutable version number; the string form `v<n>` is what assessments and runs record. */
  current_version: z.number().int().positive(),
  archived: z.boolean(),
  created_at: IsoTimestampSchema,
  updated_at: IsoTimestampSchema,
});
export type TemplateRow = z.output<typeof TemplateRowSchema>;

export const TemplateVersionRowSchema = z.strictObject({
  template_id: TemplateRowSchema.shape.template_id,
  workedge_team_id: WorkEdgeIdSchema,
  version: z.number().int().positive(),
  payload: TemplateSchema,
  content_hash: Hash,
  source: z.enum(TEMPLATE_VERSION_SOURCES),
  editor_user_id: UserIdSchema.nullable(),
  change_note: z.string().min(1),
  created_at: IsoTimestampSchema,
});
export type TemplateVersionRow = z.output<typeof TemplateVersionRowSchema>;

/** Who may create template versions (owner decision 5): a grant list of WorkEdge user ids, no user table. */
export const TemplateEditorRowSchema = z.strictObject({
  workedge_team_id: WorkEdgeIdSchema,
  workedge_user_id: UserIdSchema,
  granted_by: UserIdSchema.nullable(),
  granted_at: IsoTimestampSchema,
});
export type TemplateEditorRow = z.output<typeof TemplateEditorRowSchema>;

export function templateVersionString(version: number): string {
  return `v${version}`;
}
