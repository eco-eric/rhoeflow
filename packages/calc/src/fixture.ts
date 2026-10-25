import { z } from "zod";
import { CalcInputSchema, LoadTotalsSchema } from "./contracts.js";

/**
 * Golden-case fixture format (QA-001, QA-002; plan §Engine testing). One file per reference
 * case. `expected` is null until an independent expected result exists; when present it
 * names its source so the engine's own output is never its own oracle (QA-002).
 *
 * File naming: `<slug>.fixture.json` under `packages/calc/fixtures/`.
 */
export const FIXTURE_VERSION = "0.1.0" as const;

export const ExpectedResultSchema = z.strictObject({
  /** Where the numbers came from, e.g. "OpenStudio-HPXML v1.12.0 design-only run, 2026-10-30". */
  source: z.string().min(1),
  /** Why the tolerance is what it is: floating point, interpolation, or method difference (ADR-015). */
  tolerance_basis: z.enum(["floating_point", "interpolation", "method_difference"]),
  tolerance: z.strictObject({ absolute: z.number().nonnegative().optional(), relative: z.number().nonnegative().optional() }),
  building: LoadTotalsSchema,
});

export const CalcFixtureSchema = z.strictObject({
  fixture_version: z.literal(FIXTURE_VERSION),
  name: z.string().min(1),
  description: z.string().min(1),
  /** Always "fixture": labeled so a fixture can never pass for a real assessment (GOV-002). */
  label: z.literal("fixture"),
  input: CalcInputSchema,
  expected: ExpectedResultSchema.nullable(),
});
export type CalcFixture = z.output<typeof CalcFixtureSchema>;
export type CalcFixtureInput = z.input<typeof CalcFixtureSchema>;
