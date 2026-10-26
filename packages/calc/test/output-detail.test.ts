/**
 * Engine 0.3.0 output detail (RPT-002, WTH-001): per-component values and the design conditions
 * the run used, so the report prints what the engine used instead of recomputing it. On every
 * committed fixture the detail must reproduce the component's load exactly.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CalcFixtureSchema } from "../src/fixture.js";
import { prepareInput, runCalculation } from "../src/engine.js";
import { CalcOutputSchema, CALC_OUTPUT_VERSION } from "../src/contracts.js";

const dir = resolve(import.meta.dirname, "../fixtures");
const files = readdirSync(dir).filter((f) => f.endsWith(".fixture.json"));
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

async function run(file: string) {
  const fx = CalcFixtureSchema.parse(JSON.parse(readFileSync(resolve(dir, file), "utf8")));
  const p = prepareInput(fx.input);
  if (!p.ok) throw new Error(`${file} should prepare`);
  return { fx, out: await runCalculation(p.input) };
}

describe("component detail (engine 0.3.0)", () => {
  for (const file of files) {
    it(`${file}: every component carries detail that reproduces its load`, async () => {
      const { out } = await run(file);
      expect(out.calc_output_version).toBe(CALC_OUTPUT_VERSION);
      for (const c of out.results.components) {
        const d = c.detail;
        if (c.component_kind === "aed_excursion") continue;
        expect(d, c.component_id).toBeDefined();
        switch (c.component_kind) {
          case "wall":
          case "door":
          case "window":
          case "ceiling":
          case "floor":
          case "roof":
            expect(close(d!.htm_heating! * d!.area_ft2!, c.heating_sensible!), `${c.component_id} heating = HTM x area`).toBe(true);
            expect(close(d!.htm_cooling! * d!.area_ft2!, c.cooling_sensible!), `${c.component_id} cooling = HTM x area`).toBe(true);
            expect(d!.u_value).toBeGreaterThan(0);
            expect(d!.adjacent_to).toBeTruthy();
            break;
          case "slab":
            expect(close(d!.htm_heating! * d!.perimeter_ft!, c.heating_sensible!), `${c.component_id} heating = HTM x perimeter`).toBe(true);
            expect(d!.f_value).toBeGreaterThan(0);
            break;
          case "infiltration":
            expect(d!.ach50).toBeGreaterThan(0);
            expect(d!.cfm_heating).toBeGreaterThan(0);
            expect(d!.cfm_cooling).toBeGreaterThan(0);
            break;
          case "internal_gain":
            expect(d!.occupants).toBeGreaterThan(0);
            break;
          case "duct":
            expect(d!.duct_sides!.map((s) => s.duct_type)).toEqual(["supply", "return"]);
            break;
        }
      }
    });
  }

  it("windows report the U-factor and SHGC the method read", async () => {
    const { fx, out } = await run("ranch-1960s-dfw.fixture.json");
    for (const w of fx.input.assessment.building.enclosure.windows) {
      const d = out.results.components.find((c) => c.component_id === w.id)!.detail!;
      expect(d.u_value).toBe(w.ufactor.value);
      expect(d.shgc).toBe(w.shgc.value);
      expect(d.azimuth_deg).toBe(w.azimuth.value);
    }
  });

  it("ducts inside conditioned space read as such", async () => {
    const { out } = await run("sens-ducts-conditioned.fixture.json");
    const sides = out.results.components.find((c) => c.component_kind === "duct")!.detail!.duct_sides!;
    for (const s of sides) {
      expect(s.location).toBe("conditioned space");
      expect(s.surface_area_ft2).toBe(0);
      expect(s.effective_r_value).toBeNull();
    }
  });
});

describe("design conditions in the output (WTH-001)", () => {
  it("records the station, the job's design temperatures and the derived psychrometrics", async () => {
    const { fx, out } = await run("sens-cooling-design-hotter.fixture.json");
    const dc = out.results.design_conditions!;
    const mj = fx.input.assessment.building.systems.hvac.hvac_sizing_control.manualj_inputs;
    expect(dc.method_id).toBe("MJ8.design_conditions");
    expect(dc.station.station_key).toBe("722590");
    expect(dc.station.cooling_db_1_f).toBe(98.42);
    expect(dc.cooling_design_temp_f).toBe(mj.cooling_design_temperature.value);
    expect(dc.cooling_design_temp_f).toBe(103.42);
    expect(dc.heating_design_temp_f).toBe(mj.heating_design_temperature.value);
    expect(dc.ctd_f).toBeCloseTo(103.42 - 75, 9);
    expect(dc.htd_f).toBeCloseTo(70 - 25.88, 9);
    expect(dc.design_grains).toBeGreaterThan(0);
    expect(dc.pressure_psi).toBeLessThan(14.696);
  });

  it("error runs carry none", async () => {
    const { fx } = await run("ranch-1960s-dfw.fixture.json");
    const broken = structuredClone(fx.input);
    broken.assessment.building.enclosure.air_infiltration.air_leakage = { ...broken.assessment.building.enclosure.air_infiltration.air_leakage, unit: "ACHnatural" };
    const p = prepareInput(broken);
    if (!p.ok) throw new Error("should prepare");
    const out = await runCalculation(p.input);
    expect(out.status).toBe("error");
    expect(out.results.design_conditions).toBeUndefined();
  });

  it("a frozen 0.2.0 output without detail still parses", async () => {
    const { out } = await run("ranch-1960s-dfw.fixture.json");
    const old = JSON.parse(JSON.stringify(out)) as { calc_output_version: string; results: { design_conditions?: unknown; components: { detail?: unknown }[] } };
    old.calc_output_version = "0.2.0";
    delete old.results.design_conditions;
    for (const c of old.results.components) delete c.detail;
    expect(CalcOutputSchema.safeParse(old).success).toBe(true);
  });
});
