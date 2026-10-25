import { z } from "zod";
import { AssessmentIdSchema, IsoTimestampSchema, WorkEdgeIdSchema } from "./ids.js";
import { HpxmlBuildingSchema } from "./building/index.js";

export const ASSESSMENT_SCHEMA_VERSION = "0.1.0" as const;

/**
 * The WorkEdge anchors every Assessment carries from creation (ADR-028; integration
 * standard §2). This app has no table for a job, customer, property or user; it stores
 * these foreign ids and reads through `JobStore` (ADR-031).
 */
export const WorkEdgeRefsSchema = z.strictObject({
  team_id: WorkEdgeIdSchema,
  project_id: WorkEdgeIdSchema,
  property_id: WorkEdgeIdSchema,
  customer_id: WorkEdgeIdSchema.optional(),
});
export type WorkEdgeRefs = z.output<typeof WorkEdgeRefsSchema>;

/**
 * The Assessment: the unit RhoeFlow owns (plan §Domain model; ADR-002 via ADR-028).
 * Evidence, model revisions, runs, scenarios and reports hang off it in later work orders.
 */
export const AssessmentSchema = z.strictObject({
  schema_version: z.literal(ASSESSMENT_SCHEMA_VERSION),
  assessment_id: AssessmentIdSchema,
  /** Monotonic revision of the building model; a frozen run pins one revision. */
  revision: z.number().int().nonnegative(),
  created_at: IsoTimestampSchema,
  updated_at: IsoTimestampSchema,
  workedge: WorkEdgeRefsSchema,
  /** Era/style template that seeded `defaulted` values, if any (ADR-024). */
  template_id: z.string().min(1).optional(),
  building: HpxmlBuildingSchema,
});
export type Assessment = z.output<typeof AssessmentSchema>;
export type AssessmentInput = z.input<typeof AssessmentSchema>;
