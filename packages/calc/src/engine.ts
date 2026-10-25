import { checkInvariants, collectFields, isAcceptedInput } from "@rhoeflow/schema";
import {
  CalcInputSchema,
  CalcOutputSchema,
  CALC_OUTPUT_VERSION,
  CONTRACT_ONLY_ENGINE_VERSION,
  ENGINE_NAME,
  ENGINE_VERSION,
  type CalcInput,
  type CalcOutput,
} from "./contracts.js";
import { contentHash } from "./canonical.js";
import { EngineInputError } from "./methods/errors.js";
import { computeBlockLoad } from "./methods/totals.js";
import { resolveWeatherStation } from "./weather/library.js";

export interface RunOptions {
  /** Injected so runs are reproducible in tests; defaults to a random UUID. */
  run_id?: string;
  /** Injected clock; defaults to now. */
  now?: () => Date;
  /**
   * "0.0.1" runs the WO-01 contract-only engine (status not_implemented), kept reachable until
   * gate G1 closes (WO-02 §8). Defaults to the current engine.
   */
  engineVersion?: typeof ENGINE_VERSION | typeof CONTRACT_ONLY_ENGINE_VERSION;
}

export type PrepareResult =
  | { ok: true; input: CalcInput; issues: [] }
  | { ok: false; issues: { path: string; message: string }[] };

/**
 * Validate a raw payload as a CalcInput and refuse inputs the engine may not consume:
 * `proposed` fields (AI output not yet accepted, ADR-003) and `unknown` fields (never
 * coerced to zero, ADR-027). The engine asks; it does not guess.
 */
export function prepareInput(raw: unknown): PrepareResult {
  const parsed = CalcInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    };
  }
  const issues = checkInvariants(parsed.data.assessment).map((i) => ({ path: `assessment.${i.path}`, message: i.message }));
  for (const { path, field } of collectFields(parsed.data.assessment)) {
    if (!isAcceptedInput(field)) {
      const why = field.state === "unknown" ? `unknown (${field.reason})` : `${field.state} (not yet accepted)`;
      issues.push({ path: `assessment.${path}`, message: `engine input is ${why}; accept or resolve before running` });
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, input: parsed.data, issues: [] };
}

function randomUuid(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Run the engine. 0.1.0 computes the building block load (MJ8.* methods) with a component
 * breakdown. Structured input problems return `status: "error"` with the error list and
 * no numbers; nothing is ever fabricated (GOV-002).
 */
export async function runCalculation(input: CalcInput, options: RunOptions = {}): Promise<CalcOutput> {
  const now = options.now ?? (() => new Date());
  const version = options.engineVersion ?? ENGINE_VERSION;
  const base = {
    calc_output_version: CALC_OUTPUT_VERSION,
    frozen_input: input,
  } as const;
  const manifest = async (method_ids: string[]) => ({
    run_id: options.run_id ?? randomUuid(),
    created_at: now().toISOString(),
    engine: { name: ENGINE_NAME, version },
    schema_version: input.assessment.schema_version,
    method_ids,
    weather: input.weather,
    input_hash: await contentHash(input),
  });

  if (version === CONTRACT_ONLY_ENGINE_VERSION) {
    return CalcOutputSchema.parse({
      ...base,
      manifest: await manifest(input.method_ids),
      status: "not_implemented",
      results: { building: null, zones: [], spaces: [], components: [] },
      warnings: [
        {
          code: "ENGINE_NOT_IMPLEMENTED",
          message: `${ENGINE_NAME}@${CONTRACT_ONLY_ENGINE_VERSION} carries contracts only (WO-01). No load was calculated; this output must never reach a report.`,
        },
      ],
      errors: [],
    });
  }

  try {
    const station = resolveWeatherStation(input.weather);
    const r = computeBlockLoad(input.assessment, station);
    const totals = { heating_sensible: r.totals.heating, cooling_sensible: r.totals.coolingSensible, cooling_latent: r.totals.coolingLatent, unit: "Btu/h" as const };
    const conditionedZones = input.assessment.building.zones.filter((z) => z.zone_type.value === "conditioned");
    const output: CalcOutput = {
      ...base,
      manifest: await manifest(r.methodIds),
      status: "ok",
      results: {
        building: totals,
        zones: conditionedZones.length === 1 ? [{ zone_id: conditionedZones[0]!.id, totals }] : [],
        spaces: [],
        components: r.components.map((c) => ({ ...c, unit: "Btu/h" as const })),
      },
      warnings: r.warnings,
      errors: [],
    };
    return CalcOutputSchema.parse(output);
  } catch (e) {
    if (!(e instanceof EngineInputError)) throw e;
    return CalcOutputSchema.parse({
      ...base,
      manifest: await manifest([]),
      status: "error",
      results: { building: null, zones: [], spaces: [], components: [] },
      warnings: [],
      errors: [{ code: e.code.toUpperCase(), message: `${e.method ? `${e.method}: ` : ""}${e.message}`, ...(e.path ? { path: e.path } : {}) }],
    });
  }
}
