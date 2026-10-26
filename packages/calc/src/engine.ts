import { checkInvariants, collectFields, getFieldAtPath, isAcceptedInput } from "@rhoeflow/schema";
import {
  CalcInputSchema,
  CalcOutputSchema,
  CALC_OUTPUT_VERSION,
  ENGINE_NAME,
  ENGINE_VERSION,
  type CalcInput,
  type CalcOutput,
  type DesignConditionsResult,
} from "./contracts.js";
import { contentHash } from "./canonical.js";
import { EngineInputError } from "./methods/errors.js";
import type { DesignConditions } from "./methods/design-conditions.js";
import { computeBlockLoad } from "./methods/totals.js";
import { resolveWeatherStation, type WeatherStation } from "./weather/library.js";

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
  issues.push(...checkOverridesApplied(parsed.data));
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, input: parsed.data, issues: [] };
}

/**
 * A scenario's overrides must already be in the frozen assessment (SCN-001): the engine never
 * applies them itself, so an input that lists an override its assessment does not reflect
 * would run the baseline while claiming to be the scenario. Compared field by field so a
 * stale `evidence` default or an added note cannot hide a different value.
 */
export function checkOverridesApplied(input: CalcInput): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  const seen = new Set<string>();
  input.scenario.overrides.forEach((o, i) => {
    if (seen.has(o.path)) issues.push({ path: `scenario.overrides[${i}]`, message: `override path "${o.path}" appears twice` });
    seen.add(o.path);
    const actual = getFieldAtPath(input.assessment, o.path) as (Record<string, unknown> & { value: unknown }) | undefined;
    if (!actual) {
      issues.push({ path: `scenario.overrides[${i}]`, message: `override path "${o.path}" is not a field of the assessment` });
      return;
    }
    const want = o.field;
    const same =
      actual.value === want.value &&
      actual["state"] === want.state &&
      actual["source"] === want.source &&
      (want.unit === undefined ? actual["unit"] === undefined : actual["unit"] === want.unit);
    if (!same) {
      issues.push({ path: `scenario.overrides[${i}]`, message: `override at "${o.path}" is not applied to the frozen assessment (scenario ${input.scenario.id})` });
    }
  });
  return issues;
}

function randomUuid(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Run the engine. It computes the building block load (MJ8.* methods) with a component
 * breakdown. Structured input problems return `status: "error"` with the error list and
 * no numbers; nothing is ever fabricated (GOV-002).
 */
export async function runCalculation(input: CalcInput, options: RunOptions = {}): Promise<CalcOutput> {
  const now = options.now ?? (() => new Date());
  const version = ENGINE_VERSION;
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

  try {
    const station = resolveWeatherStation(input.weather);
    const r = computeBlockLoad(input.assessment, station);
    const totals = { heating_sensible: r.totals.heating, cooling_sensible: r.totals.coolingSensible, cooling_latent: r.totals.coolingLatent, unit: "Btu/h" as const };
    const conditionedZones = input.assessment.building.zones.filter((z) => z.zone_type.value === "conditioned");
    const warnings = [...r.warnings];
    const band = input.checks?.sanity_band;
    if (band) {
      const cfa = input.assessment.building.building_construction.conditioned_floor_area.value;
      const tons = (totals.cooling_sensible + totals.cooling_latent) / 12000;
      if (cfa !== null && tons > 0) {
        const perTon = cfa / tons;
        if (perTon < band.low_ft2_per_ton || perTon > band.high_ft2_per_ton) {
          warnings.push({
            code: "SANITY_BAND_OUTSIDE",
            message: `${perTon.toFixed(0)} ft2 per ton of total cooling load is outside the ${band.low_ft2_per_ton} to ${band.high_ft2_per_ton} band of template ${band.template_id} (${band.source}); check for upgrades or an input mistake`,
            path: "checks.sanity_band",
          });
        }
      }
    }
    const output: CalcOutput = {
      ...base,
      manifest: await manifest(r.methodIds),
      status: "ok",
      results: {
        building: totals,
        zones: conditionedZones.length === 1 ? [{ zone_id: conditionedZones[0]!.id, totals }] : [],
        spaces: [],
        components: r.components.map((c) => ({ ...c, unit: "Btu/h" as const })),
        design_conditions: designConditionsResult(r.designConditions, station),
      },
      warnings,
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

function designConditionsResult(dc: DesignConditions, st: WeatherStation): DesignConditionsResult {
  return {
    method_id: dc.method.id,
    station: {
      station_key: st.stationKey,
      name: st.name,
      state: st.state,
      latitude: st.latitude,
      longitude: st.longitude,
      elevation_ft: st.elevationFt,
      design_conditions_title: st.designConditionsTitle,
      heating_db_99_f: st.heatingDb99F,
      cooling_db_1_f: st.coolingDb1F,
      cooling_mcwb_1_f: st.coolingMcwb1F,
      daily_range_f: st.dailyRangeF,
    },
    heating_design_temp_f: dc.heatingDesignTempF,
    cooling_design_temp_f: dc.coolingDesignTempF,
    daily_range: dc.dailyRange,
    heating_setpoint_f: dc.heatingSetpointF,
    cooling_setpoint_f: dc.coolingSetpointF,
    humidity_setpoint: dc.humiditySetpoint,
    htd_f: dc.htd,
    ctd_f: dc.ctd,
    design_grains: dc.designGrains,
    indoor_humidity_ratio: dc.indoorHumidityRatio,
    outdoor_humidity_ratio: dc.outdoorHumidityRatio,
    pressure_psi: dc.pressurePsi,
    altitude_correction_factor: dc.acf,
    ground_conductivity: dc.groundConductivity,
  };
}
