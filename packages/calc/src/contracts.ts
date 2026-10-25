import { z } from "zod";
import { AssessmentSchema, ElementIdSchema, FIELD_PATH_PATTERN, IsoTimestampSchema, UNITS } from "@rhoeflow/schema";

/**
 * Calculation request and result contracts (API-001; plan §Service and artifact contracts,
 * §Frozen runs). WO-01 fixes the shapes; the numbers arrive with the engine port (WO-02).
 *
 * Nothing here is a formula. WO-01 shipped a contract-only engine that returned
 * `not_implemented`; it was retired in WO-03 (B6) once gate G1 closed.
 */

export const ENGINE_NAME = "@rhoeflow/calc" as const;
/** Independent of the app version; bumped when any method result can change (ADR-015). */
export const ENGINE_VERSION = "0.2.0" as const;
export const CALC_INPUT_VERSION = "0.2.0" as const;
export const CALC_OUTPUT_VERSION = "0.2.0" as const;

/**
 * Method ids are stable and independent of app version (CLAUDE.md §Conventions), e.g.
 * `MJ8.infiltration.lbl`, `MS2023.cooling_band.variable`, `MD3.friction_rate`.
 */
export const MethodIdSchema = z
  .string()
  .regex(/^(MJ8|MS2023|MD3|RHOE)\.[a-z0-9_]+(\.[a-z0-9_]+)*$/, "method id must be <manual>.<topic>[.<variant>]");
export type MethodId = z.infer<typeof MethodIdSchema>;

export const WeatherRefSchema = z.strictObject({
  /** Weather library name, e.g. "ashrae-2021-design-conditions" or "openstudio-hpxml-tmy3". */
  library: z.string().min(1),
  /** Pinned library version; a run is stale when this changes (plan §Frozen runs). */
  version: z.string().min(1),
  station_key: z.string().min(1),
});

/**
 * What an override is for (QST-003). `design` changes a design input (orientation, glazing,
 * leakage, duct location); `customer_preference` records a non-reference comparison such as a
 * homeowner's preferred setpoint, and the comparison labels it as such.
 */
export const OVERRIDE_LABELS = ["design", "customer_preference"] as const;

/** States a human may give an override. `proposed` (AI), `derived` and `defaulted` are not choices a person makes. */
export const OVERRIDE_STATES = ["measured", "documented", "assumed"] as const;

/**
 * One explicit modification against the frozen baseline (SCN-001; WO-03 C5). It replaces the
 * whole provenance field at `path`, so the scenario value carries its own state and source.
 * The baseline is never edited: the store applies overrides to a copy of the accepted
 * snapshot, and `prepareInput` refuses an input whose assessment does not reflect them.
 */
export const ScenarioOverrideSchema = z.strictObject({
  path: z.string().regex(FIELD_PATH_PATTERN, "override path must be a field path such as building.enclosure.windows[0].shgc"),
  field: z.strictObject({
    value: z.union([z.number().finite(), z.string().min(1), z.boolean()]),
    unit: z.enum(UNITS).optional(),
    state: z.enum(OVERRIDE_STATES),
    source: z.string().min(1),
    evidence: z.array(z.string().min(1)).default([]),
    note: z.string().optional(),
  }),
  /** Why this scenario changes it; shown beside the changed field in the comparison. */
  rationale: z.string().min(1),
  label: z.enum(OVERRIDE_LABELS),
});
export type ScenarioOverride = z.output<typeof ScenarioOverrideSchema>;

/** Scenario = named set of overrides against the accepted baseline (SCN-001; phase 2). */
export const ScenarioSchema = z.strictObject({
  id: ElementIdSchema,
  name: z.string().min(1),
  /**
   * The explicit modifications. Empty for the baseline. The frozen `assessment` below already
   * has them applied; they are kept here so the comparison can list exactly what changed.
   */
  overrides: z.array(ScenarioOverrideSchema),
});

/**
 * Checks that produce warnings, never numbers (WO-03 A4). The sanity band comes from the template
 * the Assessment was seeded from; the run records it so the warning is reproducible.
 */
export const CalcChecksSchema = z.strictObject({
  sanity_band: z
    .strictObject({
      template_id: z.string().min(1),
      template_version: z.string().min(1),
      low_ft2_per_ton: z.number().positive(),
      high_ft2_per_ton: z.number().positive(),
      source: z.string().min(1),
    })
    .optional(),
});

export const CalcInputSchema = z.strictObject({
  calc_input_version: z.literal(CALC_INPUT_VERSION),
  /** The engine this input was prepared for; the run records what actually executed. */
  requested_engine: z.strictObject({
    name: z.literal(ENGINE_NAME),
    version: z.string().min(1),
  }),
  method_ids: z.array(MethodIdSchema),
  weather: WeatherRefSchema,
  scenario: ScenarioSchema,
  /** Immutable snapshot of the accepted Assessment; the run never reads a live record. */
  assessment: AssessmentSchema,
  checks: CalcChecksSchema.optional(),
});
export type CalcInput = z.output<typeof CalcInputSchema>;
export type CalcInputInput = z.input<typeof CalcInputSchema>;

/** Retired with the WO-01 contract-only engine once gate G1 closed (WO-03 B6). */
export const RunStatusSchema = z.enum(["ok", "error"]);

/** A single contribution to a load, so every number on a report traces to a component. */
export const ComponentResultSchema = z.strictObject({
  component_id: ElementIdSchema,
  component_kind: z.enum(["wall", "window", "door", "roof", "ceiling", "floor", "slab", "infiltration", "duct", "internal_gain", "ventilation", "people", "aed_excursion"]),
  method_id: MethodIdSchema,
  heating_sensible: z.number().finite().nullable(),
  cooling_sensible: z.number().finite().nullable(),
  cooling_latent: z.number().finite().nullable(),
  unit: z.literal("Btu/h"),
});

export const LoadTotalsSchema = z.strictObject({
  heating_sensible: z.number().finite(),
  cooling_sensible: z.number().finite(),
  cooling_latent: z.number().finite(),
  unit: z.literal("Btu/h"),
});

export const WarningSchema = z.strictObject({
  code: z.string().min(1),
  message: z.string().min(1),
  path: z.string().optional(),
});

export const CalcOutputSchema = z.strictObject({
  calc_output_version: z.literal(CALC_OUTPUT_VERSION),
  manifest: z.strictObject({
    run_id: z.uuid(),
    created_at: IsoTimestampSchema,
    engine: z.strictObject({ name: z.literal(ENGINE_NAME), version: z.string().min(1) }),
    schema_version: z.string().min(1),
    method_ids: z.array(MethodIdSchema),
    weather: WeatherRefSchema,
    /** `sha256:<hex>` of the canonical CalcInput; dependency fingerprint for staleness. */
    input_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  }),
  status: RunStatusSchema,
  /**
   * Block-load result granularity (ENG-005). Building totals only in phase 2; zone and
   * space arrays exist so later phases add rows, not shapes. `null` means not computed,
   * never zero.
   */
  results: z.strictObject({
    building: LoadTotalsSchema.nullable(),
    zones: z.array(z.strictObject({ zone_id: ElementIdSchema, totals: LoadTotalsSchema })),
    spaces: z.array(
      z.strictObject({
        space_id: ElementIdSchema,
        heating_sensible: z.number().finite().nullable(),
        cooling_sensible: z.number().finite().nullable(),
        /** Space-level latent is not assumed to exist (brief: output coverage). */
        cooling_latent: z.null(),
        unit: z.literal("Btu/h"),
      }),
    ),
    components: z.array(ComponentResultSchema),
  }),
  warnings: z.array(WarningSchema),
  errors: z.array(WarningSchema),
  /** The exact input the run consumed, for the artifact bundle. */
  frozen_input: CalcInputSchema,
});
export type CalcOutput = z.output<typeof CalcOutputSchema>;

export { UNITS };
