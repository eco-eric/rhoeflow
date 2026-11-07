/**
 * Editable design conditions (ADR-047, amends ADR-034; owner 2026-11-06).
 *
 * Four values set a load calc's temperature differences: the indoor heating and cooling set points
 * and the outdoor heating (winter) and cooling (summer) design dry bulbs. Each comes from, in order:
 *
 * 1. this load calc's own override (the tech's choice, `assumed`, kept on the quick-pass answers);
 * 2. the account's default (`defaulted`, citing the account setting and the standard value it
 *    replaces), set by the account's admins in Settings → Design conditions, per weather station
 *    for the outdoor values;
 * 3. the standard value: Manual J indoor design 70 °F / 75 °F and the station's ASHRAE 99 % / 1 %
 *    dry bulbs from the pinned weather library (ADR-034), `defaulted` as before.
 *
 * Moving the summer design dry bulb does not move the outdoor moisture: the engine keeps the
 * station's 1 % coincident wet bulb paired with the station's own 1 % dry bulb, so the outdoor
 * humidity ratio (and the latent load from it) stays the station's (`coolingMcwbDbF`,
 * design-conditions.ts). The daily range stays the station's.
 *
 * Pure: no DOM, no Node. The phone's preview and the server's accept call the same code.
 */
import { z } from "zod";

/** Bounds a value must sit in to be saved; outside these it is almost certainly a typo. */
export const DESIGN_LIMITS = {
  heating_setpoint_f: { min: 55, max: 80, label: "Indoor heating set point" },
  cooling_setpoint_f: { min: 65, max: 85, label: "Indoor cooling set point" },
  heating_design_temp_f: { min: -40, max: 65, label: "Outdoor winter design temperature" },
  cooling_design_temp_f: { min: 75, max: 125, label: "Outdoor summer design temperature" },
} as const;
export type DesignValueKey = keyof typeof DESIGN_LIMITS;

/** Manual J indoor design conditions; the quick pass's standard set points (defaults.rb 281 and 286). */
export const STANDARD_SETPOINTS = { heating_setpoint_f: 70, cooling_setpoint_f: 75 } as const;

const tempF = (k: DesignValueKey) =>
  z
    .number()
    .refine(Number.isFinite, "must be a number")
    .min(DESIGN_LIMITS[k].min, `${DESIGN_LIMITS[k].label} must be at least ${DESIGN_LIMITS[k].min} °F`)
    .max(DESIGN_LIMITS[k].max, `${DESIGN_LIMITS[k].label} must be at most ${DESIGN_LIMITS[k].max} °F`)
    .transform((v) => Math.round(v * 10) / 10);

/** An account's outdoor defaults for one weather station. A missing value means "use the station's ASHRAE value". */
export const StationDesignDefaultsSchema = z.strictObject({
  heating_design_temp_f: tempF("heating_design_temp_f").optional(),
  cooling_design_temp_f: tempF("cooling_design_temp_f").optional(),
});

/** Station keys are the weather library's (WMO numbers today). */
export const StationKeySchema = z.string().regex(/^[0-9A-Za-z._-]{1,40}$/, "not a weather station key");

/**
 * An account's design defaults (ADR-047). A missing value means "use the standard value", so an
 * account that never opens the page computes exactly as before.
 */
export const AccountDesignDefaultsSchema = z
  .strictObject({
    heating_setpoint_f: tempF("heating_setpoint_f").optional(),
    cooling_setpoint_f: tempF("cooling_setpoint_f").optional(),
    stations: z.record(StationKeySchema, StationDesignDefaultsSchema).default({}),
  })
  .superRefine((d, ctx) => {
    const h = d.heating_setpoint_f ?? STANDARD_SETPOINTS.heating_setpoint_f;
    const c = d.cooling_setpoint_f ?? STANDARD_SETPOINTS.cooling_setpoint_f;
    if (h > c) ctx.addIssue({ code: "custom", path: ["heating_setpoint_f"], message: `The heating set point (${h} °F) can't be above the cooling set point (${c} °F)` });
  });
export type AccountDesignDefaults = z.output<typeof AccountDesignDefaultsSchema>;
export type AccountDesignDefaultsInput = z.input<typeof AccountDesignDefaultsSchema>;

export function emptyDesignDefaults(): AccountDesignDefaults {
  return { stations: {} };
}

/** The account defaults as the quick pass receives them: the values plus who set them, for the source text. */
export interface DesignDefaultsContext {
  account_name: string;
  /** When the defaults were last saved, ISO; shown in the source. */
  updated_at: string | null;
  defaults: AccountDesignDefaults;
}

/** Where a value in use came from, for the app's design-conditions card. */
export type DesignOrigin = "this_calc" | "account" | "standard";

export interface DesignValueInUse {
  key: DesignValueKey;
  label: string;
  value: number;
  origin: DesignOrigin;
  /** The standard value (Manual J set point or the station's ASHRAE dry bulb), for "differs from" notes. */
  standard: number;
  /** The account default, when the account has one. */
  account: number | null;
}

/** The station values the outdoor standard comes from. */
export interface StationDesignValues {
  stationKey: string;
  heatingDb99F: number;
  coolingDb1F: number;
}

/** Overrides as the quick-pass answers carry them (the `design` key); only the value matters here. */
export type DesignOverrideValues = Partial<Record<"heating_setpoint" | "cooling_setpoint" | "heating_design_temperature" | "cooling_design_temperature", { value: number } | undefined>>;

const OVERRIDE_KEY: Record<DesignValueKey, keyof DesignOverrideValues> = {
  heating_setpoint_f: "heating_setpoint",
  cooling_setpoint_f: "cooling_setpoint",
  heating_design_temp_f: "heating_design_temperature",
  cooling_design_temp_f: "cooling_design_temperature",
};
export const DESIGN_OVERRIDE_KEYS = OVERRIDE_KEY;

/**
 * The four values a load calc uses and where each came from. The quick pass builds its fields from
 * this, and the app shows the same thing, so the card and the frozen Assessment cannot disagree.
 */
export function designValuesInUse(station: StationDesignValues, defaults: AccountDesignDefaults | null | undefined, overrides: DesignOverrideValues | null | undefined): DesignValueInUse[] {
  const st = defaults?.stations[station.stationKey];
  const standard: Record<DesignValueKey, number> = {
    heating_setpoint_f: STANDARD_SETPOINTS.heating_setpoint_f,
    cooling_setpoint_f: STANDARD_SETPOINTS.cooling_setpoint_f,
    heating_design_temp_f: station.heatingDb99F,
    cooling_design_temp_f: station.coolingDb1F,
  };
  const account: Record<DesignValueKey, number | undefined> = {
    heating_setpoint_f: defaults?.heating_setpoint_f,
    cooling_setpoint_f: defaults?.cooling_setpoint_f,
    heating_design_temp_f: st?.heating_design_temp_f,
    cooling_design_temp_f: st?.cooling_design_temp_f,
  };
  return (Object.keys(DESIGN_LIMITS) as DesignValueKey[]).map((key) => {
    const o = overrides?.[OVERRIDE_KEY[key]]?.value;
    const a = account[key];
    const value = o ?? a ?? standard[key];
    return {
      key,
      label: DESIGN_LIMITS[key].label,
      value,
      origin: o !== undefined ? "this_calc" : a !== undefined ? "account" : "standard",
      standard: standard[key],
      account: a ?? null,
    };
  });
}
