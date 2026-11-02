import { z } from "zod";
import { AssessmentIdSchema, IsoTimestampSchema, WorkEdgeIdSchema } from "./ids.js";
import { HpxmlBuildingSchema } from "./building/index.js";

export const ASSESSMENT_SCHEMA_VERSION = "0.1.0" as const;

/**
 * The account and, when the job is linked to WorkEdge, the WorkEdge anchors (ADR-028 as amended by
 * ADR-040; integration standard §2). `team_id` holds the RhoeFlow account id (ADR-039). A load calc
 * started inside RhoeFlow has no WorkEdge project or property until its job is linked.
 */
export const WorkEdgeRefsSchema = z.strictObject({
  team_id: WorkEdgeIdSchema,
  project_id: WorkEdgeIdSchema.optional(),
  property_id: WorkEdgeIdSchema.optional(),
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
  /** RhoeFlow's own job the assessment belongs to (ADR-040); absent on snapshots made before it. */
  job_id: z.uuid().optional(),
  /** Era/style template that seeded `defaulted` values, if any (ADR-024). */
  template_id: z.string().min(1).optional(),
  /**
   * The immutable template version that seeded them (WO-03 C7). Absent means the repo's fixed
   * set at the time; a run records the pair so a template edit marks exactly the right runs
   * stale (REV-002).
   */
  template_version: z.string().min(1).optional(),
  building: HpxmlBuildingSchema,
});
export type Assessment = z.output<typeof AssessmentSchema>;
export type AssessmentInput = z.input<typeof AssessmentSchema>;
