import { z } from "zod";
import { AssessmentIdSchema, WorkEdgeIdSchema } from "@rhoeflow/schema";
import { ScenarioOverrideSchema } from "@rhoeflow/calc";
import { TemplateSchema } from "@rhoeflow/templates";
import { REPORT_TYPES, UuidSchema } from "./records.js";

/**
 * Request contracts of the persistence API (API-001; WO-03 C2). The HTTP layer in apps/web
 * parses bodies with these and nothing else; the services take the parsed shapes. Responses
 * are the row types in records.ts (or the comparison in scenarios.ts), already zod-validated.
 *
 * The team id is never in a request body: it comes from the signed-in session (SEC-001).
 */

/** Standard §3 entry A: by WorkEdge project. The property is required; "no assessment without a WorkEdge job". */
export const CreateOrResumeAssessmentRequestSchema = z.strictObject({
  workedge: z.strictObject({
    project_id: WorkEdgeIdSchema,
    property_id: WorkEdgeIdSchema,
    customer_id: WorkEdgeIdSchema.optional(),
  }),
  /** Era template to seed from; resolved to the team's current template version (C7). */
  template_id: z.string().min(1).optional(),
});
export type CreateOrResumeAssessmentRequest = z.output<typeof CreateOrResumeAssessmentRequestSchema>;

/**
 * Drafts may be incomplete, so the body is checked only for identity: it must be an object
 * whose assessment and WorkEdge ids match the row. Full validation happens on accept.
 */
export const SaveDraftRequestSchema = z.strictObject({
  draft: z.record(z.string(), z.unknown()),
  /**
   * The era template the tech picked once year built and stories are known (D2; a person picks,
   * ADR-003). Resolved to the team's current stored version. Omit to keep the current one.
   */
  template_id: z.string().min(1).optional(),
  /** The `draft_version` the client read; a mismatch is 412 and the client reloads (optimistic concurrency). */
  expected_draft_version: z.number().int().nonnegative(),
});
export type SaveDraftRequest = z.output<typeof SaveDraftRequestSchema>;

export const AcceptRevisionRequestSchema = z.strictObject({
  expected_draft_version: z.number().int().nonnegative(),
});
export type AcceptRevisionRequest = z.output<typeof AcceptRevisionRequestSchema>;

export const CreateRunRequestSchema = z.strictObject({
  /** Client-chosen, e.g. a UUID minted when the button is tapped; a retry resends the same key (API-002). */
  idempotency_key: z.string().min(1).max(128),
  /** Defaults to the latest accepted revision. */
  revision: z.number().int().positive().optional(),
  /** Null or absent runs the baseline. */
  scenario_id: UuidSchema.nullable().optional(),
});
export type CreateRunRequest = z.output<typeof CreateRunRequestSchema>;

export const CreateScenarioRequestSchema = z.strictObject({
  name: z.string().min(1).max(120),
  overrides: z.array(ScenarioOverrideSchema).min(1),
});
export type CreateScenarioRequest = z.output<typeof CreateScenarioRequestSchema>;

export const UpdateScenarioRequestSchema = CreateScenarioRequestSchema.extend({
  expected_scenario_version: z.number().int().positive(),
});
export type UpdateScenarioRequest = z.output<typeof UpdateScenarioRequestSchema>;

export const CompareRunsRequestSchema = z.strictObject({
  baseline_run_id: UuidSchema,
  scenario_run_id: UuidSchema,
});
export type CompareRunsRequest = z.output<typeof CompareRunsRequestSchema>;

export const CreateTemplateVersionRequestSchema = z.strictObject({
  payload: TemplateSchema,
  change_note: z.string().min(1).max(500),
  expected_current_version: z.number().int().positive(),
});
export type CreateTemplateVersionRequest = z.output<typeof CreateTemplateVersionRequestSchema>;

export const CreateTemplateRequestSchema = z.strictObject({
  payload: TemplateSchema,
  change_note: z.string().min(1).max(500),
});
export type CreateTemplateRequest = z.output<typeof CreateTemplateRequestSchema>;

export const IssueReportRequestSchema = z.strictObject({
  run_id: UuidSchema,
  report_type: z.enum(REPORT_TYPES),
});
export type IssueReportRequest = z.output<typeof IssueReportRequestSchema>;

export const AssessmentIdParamSchema = AssessmentIdSchema;
export const RunIdParamSchema = UuidSchema;
