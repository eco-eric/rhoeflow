import { z } from "zod";
import { AssessmentSchema, ElementIdSchema, IsoTimestampSchema, UNITS } from "@rhoeflow/schema";

/**
 * Calculation request and result contracts (API-001; plan §Service and artifact contracts,
 * §Frozen runs). WO-01 fixes the shapes; the numbers arrive with the engine port (WO-02).
 *
 * Nothing here is a formula. `runCalculation` in WO-01 returns status `not_implemented`
 * with the frozen input echoed back, which is what the fixture round-trip exercises.
 */

export const ENGINE_NAME = "@rhoeflow/calc" as const;
/** Independent of the app version; bumped when any method result can change (ADR-015). */
export const ENGINE_VERSION = "0.1.0" as const;
/** The WO-01 contract-only engine, kept reachable until gate G1 closes (WO-02 §8 rollback). */
export const CONTRACT_ONLY_ENGINE_VERSION = "0.0.1" as const;
export const CALC_INPUT_VERSION = "0.1.0" as const;
export const CALC_OUTPUT_VERSION = "0.1.0" as const;

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

/** Scenario = named set of overrides against the accepted baseline (SCN-001; phase 2). */
export const ScenarioSchema = z.strictObject({
  id: ElementIdSchema,
  name: z.string().min(1),
  /** Baseline is the Assessment as frozen; WO-01 carries no override mechanism yet. */
  overrides: z.array(z.never()).max(0),
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
});
export type CalcInput = z.output<typeof CalcInputSchema>;
export type CalcInputInput = z.input<typeof CalcInputSchema>;

export const RunStatusSchema = z.enum(["ok", "error", "not_implemented"]);

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
