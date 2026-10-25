import { z } from "zod";
import { UNITS, type Unit } from "./units.js";

/**
 * Provenance states (ADR-003, ADR-024, ADR-027; PRV-001).
 *
 * - measured    field measurement; method and conditions go in `note`
 * - documented  a source states it (plan note, submittal, WorkEdge property record)
 * - assumed     human-selected with a rationale
 * - proposed    AI extraction or suggestion NOT yet accepted; never an engineering input
 * - derived     computed from accepted inputs
 * - defaulted   software default with its source (era template, IECC, NOAA)
 * - unknown     not established; never coerced to zero; carries a reason
 */
export const PROVENANCE_STATES = [
  "measured",
  "documented",
  "assumed",
  "proposed",
  "derived",
  "defaulted",
  "unknown",
] as const;
export type ProvenanceState = (typeof PROVENANCE_STATES)[number];

/** States a field can be in while still carrying a value. */
export const KNOWN_STATES = [
  "measured",
  "documented",
  "assumed",
  "proposed",
  "derived",
  "defaulted",
] as const;
export type KnownState = (typeof KNOWN_STATES)[number];

/**
 * States the deterministic engine may consume. `proposed` is excluded: AI proposals
 * become inputs only on human acceptance (ADR-003, ADR-018). `unknown` is excluded:
 * the engine must ask, not guess.
 */
export const ACCEPTED_STATES = ["measured", "documented", "assumed", "derived", "defaulted"] as const;
export type AcceptedState = (typeof ACCEPTED_STATES)[number];

/** Why a value is unknown (ADR-027). The UI offers productive choices for each. */
export const UNKNOWN_REASONS = ["didnt_inspect", "inspected_cant_tell"] as const;
export type UnknownReason = (typeof UNKNOWN_REASONS)[number];

/**
 * Evidence is referenced by WorkEdge media id only (ADR-028; integration standard §2).
 * Never a file path, never a signed URL. `jobstore-local` ids are prefixed `local:` so a
 * pending migration to WorkEdge ids is visible (ADR-031).
 */
export const MediaIdSchema = z.string().trim().min(1, "media id must not be empty");
export type MediaId = z.infer<typeof MediaIdSchema>;

const SourceSchema = z.string().trim().min(1, "source citation must not be empty");

/**
 * Build the schema for a provenance-carrying field around a value schema.
 * A known field requires a value and a non-empty source citation. An unknown field has
 * `value: null` and a reason; its optional `source` records who established it unknown.
 */
export function field<V extends z.ZodType>(valueSchema: V) {
  const known = z.strictObject({
    value: valueSchema,
    state: z.enum(KNOWN_STATES),
    source: SourceSchema,
    evidence: z.array(MediaIdSchema).default([]),
    note: z.string().optional(),
  });
  const unknown = z.strictObject({
    value: z.null(),
    state: z.literal("unknown"),
    reason: z.enum(UNKNOWN_REASONS),
    source: SourceSchema.optional(),
    evidence: z.array(MediaIdSchema).default([]),
    note: z.string().optional(),
  });
  return z.discriminatedUnion("state", [known, unknown]);
}

/** A numeric field that names its unit. `units` may list the alternatives HPXML accepts. */
export function quantity<const U extends readonly [Unit, ...Unit[]]>(units: U) {
  const unit = z.enum(units);
  const known = z.strictObject({
    value: z.number().finite(),
    unit,
    state: z.enum(KNOWN_STATES),
    source: SourceSchema,
    evidence: z.array(MediaIdSchema).default([]),
    note: z.string().optional(),
  });
  const unknown = z.strictObject({
    value: z.null(),
    unit,
    state: z.literal("unknown"),
    reason: z.enum(UNKNOWN_REASONS),
    source: SourceSchema.optional(),
    evidence: z.array(MediaIdSchema).default([]),
    note: z.string().optional(),
  });
  return z.discriminatedUnion("state", [known, unknown]);
}

/** Convenience: a quantity restricted to one unit. */
export function quantityOf<const U extends Unit>(unit: U) {
  return quantity([unit]);
}

export type Field<T> =
  | {
      value: T;
      state: KnownState;
      source: string;
      evidence: MediaId[];
      note?: string | undefined;
    }
  | {
      value: null;
      state: "unknown";
      reason: UnknownReason;
      source?: string | undefined;
      evidence: MediaId[];
      note?: string | undefined;
    };

export type QuantityField<U extends Unit = Unit> = Field<number> & { unit: U };

/** Shape test used by the walker and the provenance lint; deliberately structural. */
export function isField(value: unknown): value is Field<unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (!("value" in v) || typeof v["state"] !== "string") return false;
  return (PROVENANCE_STATES as readonly string[]).includes(v["state"]);
}

export function isAcceptedInput(f: Field<unknown>): boolean {
  return (ACCEPTED_STATES as readonly string[]).includes(f.state);
}

export function isUnknown(f: Field<unknown>): f is Extract<Field<unknown>, { state: "unknown" }> {
  return f.state === "unknown";
}

export { UNITS, type Unit };
