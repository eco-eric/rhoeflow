import { describe, expect, it } from "vitest";
import { getFieldAtPath, type Assessment } from "@rhoeflow/schema";
import { ENGINE_VERSION, prepareInput, resolveWeatherStation, runCalculation } from "@rhoeflow/calc";
import {
  AccountDesignDefaultsSchema,
  QuickPassAnswersSchema,
  buildQuickPass,
  designValuesInUse,
  getTemplate,
  type QuickPassAnswersInput,
  type QuickPassContext,
} from "../src/index.js";

/** ADR-047: account design defaults and per-calc overrides of set points and outdoor design temperatures. */

const A = <T,>(value: T, state: "measured" | "documented" | "assumed" = "assumed", source?: string) => ({ value, state, ...(source ? { source } : {}) });
const DFW = resolveWeatherStation({ library: "openstudio-hpxml-weather", version: "v1.12.0", station_key: "722590" });

function ctx(design?: QuickPassContext["design"]): QuickPassContext {
  return {
    template: getTemplate("dfw-pre1980-ranch-slab"),
    template_version: null,
    assessment_id: "0f1e2d3c-4b5a-4968-8777-66554433aa11",
    created_at: "2026-10-25T12:00:00-05:00",
    updated_at: "2026-10-25T12:00:00-05:00",
    workedge: { team_id: "we_team_fixture" },
    ...(design !== undefined ? { design } : {}),
  };
}

const minimal: QuickPassAnswersInput = {
  quick_pass_version: "0.1.0",
  year_built: A(1964),
  floor_area: A(1600),
  stories: A(1),
  garage: A({ cars: 0, side: "left" as const }),
  front_azimuth: A(180),
  bedrooms: A(3),
};

const truficient = (defaults: unknown) => ({ account_name: "Truficient", updated_at: "2026-11-06T20:00:00Z", defaults: AccountDesignDefaultsSchema.parse(defaults) });

const MJ = "building.systems.hvac.hvac_sizing_control.manualj_inputs";
const CTL = "building.systems.hvac.hvac_control";
function field(a: Assessment | null, path: string) {
  if (!a) throw new Error("no assessment");
  return getFieldAtPath(a, path) as { value: number; state: string; source: string; unit?: string };
}

async function totals(a: Assessment) {
  const p = prepareInput({
    calc_input_version: "0.2.0",
    requested_engine: { name: "@rhoeflow/calc", version: ENGINE_VERSION },
    method_ids: [],
    weather: { library: "openstudio-hpxml-weather", version: "v1.12.0", station_key: "722590" },
    scenario: { id: "baseline", name: "Baseline", overrides: [] },
    assessment: a,
  });
  if (!p.ok) throw new Error(JSON.stringify(p.issues.slice(0, 5)));
  const out = await runCalculation(p.input);
  if (!out.results.building) throw new Error(JSON.stringify(out.errors));
  return { b: out.results.building, dc: out.results.design_conditions! };
}

describe("account design defaults (ADR-047)", () => {
  it("without defaults the calc uses the standard values, exactly as before", () => {
    const a = buildQuickPass(minimal, ctx()).assessment;
    expect(field(a, `${MJ}.cooling_design_temperature`)).toMatchObject({ value: 98.42, state: "defaulted" });
    expect(field(a, `${MJ}.heating_design_temperature`)).toMatchObject({ value: 25.88, state: "defaulted" });
    expect(field(a, `${CTL}.heating_setpoint`)).toMatchObject({ value: 70, state: "defaulted" });
    expect(field(a, `${CTL}.cooling_setpoint`)).toMatchObject({ value: 75, state: "defaulted" });
    // An account that saved nothing is the same as no account defaults.
    expect(buildQuickPass(minimal, ctx(truficient({}))).assessment).toEqual(a);
  });

  it("uses the account's DFW summer default of 101 F, tagged defaulted with the account and the ASHRAE value in its source", () => {
    const a = buildQuickPass(minimal, ctx(truficient({ stations: { "722590": { cooling_design_temp_f: 101 } } }))).assessment;
    const f = field(a, `${MJ}.cooling_design_temperature`);
    expect(f).toMatchObject({ value: 101, state: "defaulted", unit: "F" });
    expect(f.source).toContain("account design default (Truficient, saved 2026-11-06)");
    expect(f.source).toContain("standard value is 98.42 F");
    // The others stay standard.
    expect(field(a, `${MJ}.heating_design_temperature`).value).toBe(25.88);
    expect(field(a, `${CTL}.cooling_setpoint`).value).toBe(75);
  });

  it("a station the account has no defaults for keeps the station's values", () => {
    const a = buildQuickPass(minimal, ctx(truficient({ stations: { "999999": { cooling_design_temp_f: 110 } } }))).assessment;
    expect(field(a, `${MJ}.cooling_design_temperature`).value).toBe(98.42);
  });

  it("account set points replace Manual J's 70 and 75", () => {
    const a = buildQuickPass(minimal, ctx(truficient({ heating_setpoint_f: 68, cooling_setpoint_f: 74 }))).assessment;
    expect(field(a, `${CTL}.heating_setpoint`)).toMatchObject({ value: 68, state: "defaulted" });
    expect(field(a, `${CTL}.cooling_setpoint`)).toMatchObject({ value: 74, state: "defaulted" });
  });

  it("refuses values outside the limits and a heating set point above the cooling one", () => {
    expect(AccountDesignDefaultsSchema.safeParse({ stations: { "722590": { cooling_design_temp_f: 1010 } } }).success).toBe(false);
    expect(AccountDesignDefaultsSchema.safeParse({ heating_setpoint_f: 30 }).success).toBe(false);
    expect(AccountDesignDefaultsSchema.safeParse({ heating_setpoint_f: 78, cooling_setpoint_f: 72 }).success).toBe(false);
    expect(AccountDesignDefaultsSchema.parse({ cooling_setpoint_f: 74.44 })).toEqual({ cooling_setpoint_f: 74.4, stations: {} });
  });
});

describe("per-load-calc overrides (ADR-047)", () => {
  const withOverride = (design: unknown): QuickPassAnswersInput => ({ ...minimal, design } as QuickPassAnswersInput);

  it("an override beats the account default and is the tech's choice", () => {
    const answers = withOverride({ cooling_design_temperature: A(104) });
    const a = buildQuickPass(answers, ctx(truficient({ stations: { "722590": { cooling_design_temp_f: 101 } } }))).assessment;
    const f = field(a, `${MJ}.cooling_design_temperature`);
    expect(f).toMatchObject({ value: 104, state: "assumed" });
    expect(f.source).toContain("set on this load calc");
    expect(f.source).toContain("account default is 101 F");
    expect(f.source).toContain("standard value is 98.42 F");
  });

  it("keeps a cited document as documented", () => {
    const a = buildQuickPass(withOverride({ heating_setpoint: A(72, "documented", "Customer comfort sheet") }), ctx()).assessment;
    expect(field(a, `${CTL}.heating_setpoint`)).toMatchObject({ value: 72, state: "documented", source: "Customer comfort sheet" });
  });

  it("the answers contract takes the design block and refuses out-of-range values", () => {
    expect(QuickPassAnswersSchema.safeParse(withOverride({ cooling_setpoint: A(74) })).success).toBe(true);
    expect(QuickPassAnswersSchema.safeParse(withOverride({ cooling_setpoint: A(40) })).success).toBe(false);
    expect(QuickPassAnswersSchema.safeParse(withOverride({ wet_bulb: A(70) })).success).toBe(false);
  });

  it("stops on a heating set point above the cooling set point, and warns when a difference goes to zero", () => {
    const bad = buildQuickPass(withOverride({ heating_setpoint: A(78), cooling_setpoint: A(72) }), ctx());
    expect(bad.assessment).toBeNull();
    expect(bad.issues.map((i) => i.code)).toContain("design_setpoints");
    const warm = buildQuickPass(withOverride({ heating_design_temperature: A(65), heating_setpoint: A(65) }), ctx());
    expect(warm.assessment).not.toBeNull();
    expect(warm.issues.map((i) => i.code)).toContain("design_no_heating_difference");
  });

  it("the app's card and the Assessment agree on every value and its origin", () => {
    const defaults = truficient({ cooling_setpoint_f: 74, stations: { "722590": { cooling_design_temp_f: 101 } } });
    const answers = QuickPassAnswersSchema.parse(withOverride({ heating_design_temperature: A(22) }));
    const used = designValuesInUse(DFW, defaults.defaults, answers.design);
    expect(used.map((u) => [u.key, u.value, u.origin])).toEqual([
      ["heating_setpoint_f", 70, "standard"],
      ["cooling_setpoint_f", 74, "account"],
      ["heating_design_temp_f", 22, "this_calc"],
      ["cooling_design_temp_f", 101, "account"],
    ]);
    const a = buildQuickPass(answers, ctx(defaults)).assessment;
    expect(field(a, `${CTL}.heating_setpoint`).value).toBe(70);
    expect(field(a, `${CTL}.cooling_setpoint`).value).toBe(74);
    expect(field(a, `${MJ}.heating_design_temperature`).value).toBe(22);
    expect(field(a, `${MJ}.cooling_design_temperature`).value).toBe(101);
  });
});

describe("the engine with an edited design condition (ADR-047, MJ8.design_conditions)", () => {
  it("101 F raises the cooling temperature difference and the sensible cooling load, and keeps the station's moisture", async () => {
    const base = await totals(buildQuickPass(minimal, ctx()).assessment!);
    const hot = await totals(buildQuickPass(minimal, ctx(truficient({ stations: { "722590": { cooling_design_temp_f: 101 } } }))).assessment!);
    expect(base.dc.ctd_f).toBeCloseTo(23.42, 2);
    expect(hot.dc.ctd_f).toBeCloseTo(26, 2);
    expect(hot.b.cooling_sensible).toBeGreaterThan(base.b.cooling_sensible);
    // Outdoor moisture is the station's 1 % pair, so the design grains do not move with the dry bulb.
    expect(hot.dc.design_grains).toBe(base.dc.design_grains);
    // Heating does not change.
    expect(hot.b.heating_sensible).toBe(base.b.heating_sensible);
  });

  it("a colder winter design temperature raises the heating load", async () => {
    const base = await totals(buildQuickPass(minimal, ctx()).assessment!);
    const cold = await totals(buildQuickPass({ ...minimal, design: { heating_design_temperature: A(20) } } as QuickPassAnswersInput, ctx()).assessment!);
    expect(cold.dc.htd_f).toBeCloseTo(50, 2);
    expect(cold.b.heating_sensible).toBeGreaterThan(base.b.heating_sensible);
  });
});
