import { z } from "zod";

/**
 * Stable identity (DAT-001). Element ids are opaque slugs that never change once
 * assigned; a room's display name is never its identity (plan §Domain model).
 */
export const ElementIdSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, "element id must be a slug starting with a letter");
export type ElementId = z.infer<typeof ElementIdSchema>;

/** Ids that live in WorkEdge. Opaque strings; this app never generates them (ADR-028). */
export const WorkEdgeIdSchema = z.string().trim().min(1);
export type WorkEdgeId = z.infer<typeof WorkEdgeIdSchema>;

export const AssessmentIdSchema = z.uuid();
export type AssessmentId = z.infer<typeof AssessmentIdSchema>;

export const IsoTimestampSchema = z.iso.datetime({ offset: true });
