import { checkInvariants, collectFields, isAcceptedInput } from "@rhoeflow/schema";
import {
  CalcInputSchema,
  CalcOutputSchema,
  CALC_OUTPUT_VERSION,
  ENGINE_NAME,
  ENGINE_VERSION,
  type CalcInput,
  type CalcOutput,
} from "./contracts.js";
import { contentHash } from "./canonical.js";

export interface RunOptions {
  /** Injected so runs are reproducible in tests; defaults to a random UUID. */
  run_id?: string;
  /** Injected clock; defaults to now. */
  now?: () => Date;
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
 * Run the engine. WO-01: returns `not_implemented` with the manifest and the frozen input;
 * no load is computed and no result is fabricated (GOV-002: stubs are labeled). The
 * Manual J port lands in WO-02 under method ids `MJ8.*`.
 */
export async function runCalculation(input: CalcInput, options: RunOptions = {}): Promise<CalcOutput> {
  const now = options.now ?? (() => new Date());
  const output: CalcOutput = {
    calc_output_version: CALC_OUTPUT_VERSION,
    manifest: {
      run_id: options.run_id ?? randomUuid(),
      created_at: now().toISOString(),
      engine: { name: ENGINE_NAME, version: ENGINE_VERSION },
      schema_version: input.assessment.schema_version,
      method_ids: input.method_ids,
      weather: input.weather,
      input_hash: await contentHash(input),
    },
    status: "not_implemented",
    results: { building: null, zones: [], spaces: [], components: [] },
    warnings: [
      {
        code: "ENGINE_NOT_IMPLEMENTED",
        message: `${ENGINE_NAME}@${ENGINE_VERSION} carries contracts only (WO-01). No load was calculated; this output must never reach a report.`,
      },
    ],
    errors: [],
    frozen_input: input,
  };
  // Self-check: the engine's own output must satisfy its published contract.
  return CalcOutputSchema.parse(output);
}
