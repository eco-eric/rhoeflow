import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { collectFields } from "@rhoeflow/schema";
import { CalcFixtureSchema } from "../src/fixture.js";
import { prepareInput, runCalculation } from "../src/engine.js";
import { CalcOutputSchema, ENGINE_VERSION } from "../src/contracts.js";
import { canonicalJson } from "../src/canonical.js";

const dir = resolve(import.meta.dirname, "../fixtures");
const files = readdirSync(dir).filter((f) => f.endsWith(".fixture.json"));

interface Tolerances {
  comparisons: { quantity: string; absolute_btuh: number; basis: string; observed_max_btuh: number }[];
}
const tolerances = JSON.parse(readFileSync(resolve(dir, "tolerances.json"), "utf8")) as Tolerances;
const tol = (quantity: string) => {
  const t = tolerances.comparisons.find((c) => c.quantity === quantity);
  if (!t) throw new Error(`no tolerance for ${quantity}`);
  return t;
};

describe("tolerance table (ADR-015)", () => {
  it("names a basis for every comparison and keeps observed differences inside the tolerance", () => {
    for (const c of tolerances.comparisons) {
      expect(["floating_point", "interpolation", "method_difference"]).toContain(c.basis);
      expect(c.observed_max_btuh).toBeLessThanOrEqual(c.absolute_btuh);
    }
  });

  it("each fixture's expected block uses the table's building tolerance", () => {
    for (const file of files) {
      const fx = CalcFixtureSchema.parse(JSON.parse(readFileSync(resolve(dir, file), "utf8")));
      for (const k of ["heating_sensible", "cooling_sensible", "cooling_latent"]) {
        expect(fx.expected!.tolerance.absolute, `${file} ${k}`).toBe(tol(`building.${k}`).absolute_btuh);
        expect(fx.expected!.tolerance_basis).toBe(tol(`building.${k}`).basis);
      }
    }
  });
});

describe("committed fixtures", () => {
  it("the R01 houses and the WO-03 houses are present", () => {
    expect(files.sort()).toEqual([
      "one-story-2018-garage-dfw.fixture.json",
      "ranch-1950s-crawl-dfw.fixture.json",
      "ranch-1960s-dfw.fixture.json",
      "ranch-1960s-ductless-dfw.fixture.json",
      "two-story-2010-dfw.fixture.json",
      "two-story-garage-2sys-dfw.fixture.json",
    ]);
  });

  for (const file of files) {
    describe(file, () => {
      const raw: unknown = JSON.parse(readFileSync(resolve(dir, file), "utf8"));

      it("is a labeled fixture whose input the engine accepts", () => {
        const fx = CalcFixtureSchema.parse(raw);
        expect(fx.label).toBe("fixture");
        const prepared = prepareInput(fx.input);
        expect(prepared.issues).toEqual([]);
        expect(prepared.ok).toBe(true);
      });

      it("every field has a state and a source, and none is unknown or proposed", () => {
        const fx = CalcFixtureSchema.parse(raw);
        const fields = collectFields(fx.input.assessment);
        expect(fields.length).toBeGreaterThan(100);
        for (const { path, field } of fields) {
          if (field.state === "unknown") throw new Error(`${path} is unknown (${field.reason}); fixtures must be fully accepted`);
          expect(field.state, path).not.toBe("proposed");
          expect(field.source.length, path).toBeGreaterThan(0);
        }
        expect(fields.some((f) => f.field.state === "defaulted" && f.field.source.startsWith("template:"))).toBe(true);
        expect(fields.some((f) => f.field.state === "defaulted" && f.field.source.startsWith("weather: openstudio-hpxml-weather"))).toBe(true);
      });

      it("runs to status ok and matches the oracle's expected totals (gate G1)", async () => {
        const fx = CalcFixtureSchema.parse(raw);
        const prepared = prepareInput(fx.input);
        if (!prepared.ok) throw new Error("fixture should prepare");
        const out = await runCalculation(prepared.input);
        expect(out.errors).toEqual([]);
        expect(out.status).toBe("ok");
        expect(out.manifest.engine.version).toBe(ENGINE_VERSION);
        expect(CalcOutputSchema.safeParse(JSON.parse(JSON.stringify(out))).success).toBe(true);
        expect(canonicalJson(out.frozen_input)).toBe(canonicalJson(prepared.input));

        const exp = fx.expected!;
        expect(exp.tolerance.absolute).toBeDefined();
        const b = out.results.building!;
        for (const k of ["heating_sensible", "cooling_sensible", "cooling_latent"] as const) {
          expect(Math.abs(b[k] - exp.building[k]), k).toBeLessThanOrEqual(exp.tolerance.absolute!);
        }

        // Components sum exactly to the building totals (MTH-003: every number traces to a component).
        const sum = (k: "heating_sensible" | "cooling_sensible" | "cooling_latent") => out.results.components.reduce((s, c) => s + (c[k] ?? 0), 0);
        expect(sum("heating_sensible")).toBeCloseTo(b.heating_sensible, 6);
        expect(sum("cooling_sensible")).toBeCloseTo(b.cooling_sensible, 6);
        expect(sum("cooling_latent")).toBeCloseTo(b.cooling_latent, 6);
        expect(out.results.zones.length).toBe(1);
      });

      it("component loads match the oracle's components within 2 Btu/h", async () => {
        const fx = CalcFixtureSchema.parse(raw);
        const prepared = prepareInput(fx.input);
        if (!prepared.ok) throw new Error("fixture should prepare");
        const out = await runCalculation(prepared.input);
        const runFile = ["r01", "wo03"].map((d) => resolve(import.meta.dirname, `../../../claude/09-spikes/${d}/runs/${fx.name}/results_annual.json`)).find((p) => existsSync(p));
        if (!runFile) throw new Error(`no committed oracle run for ${fx.name}`);
        const run = JSON.parse(readFileSync(runFile, "utf8")) as { "HVAC Design Load": Record<string, number> };
        const o = run["HVAC Design Load"];
        const byKind = (kind: string, k: "heating_sensible" | "cooling_sensible" | "cooling_latent") =>
          out.results.components.filter((c) => c.component_kind === kind).reduce((s, c) => s + (c[k] ?? 0), 0);
        const pairs: [string, "heating_sensible" | "cooling_sensible" | "cooling_latent", string][] = [
          ["wall", "heating_sensible", "Heating: Walls (Btu/h)"],
          ["wall", "cooling_sensible", "Cooling Sensible: Walls (Btu/h)"],
          ["window", "heating_sensible", "Heating: Windows (Btu/h)"],
          ["window", "cooling_sensible", "Cooling Sensible: Windows (Btu/h)"],
          ["door", "heating_sensible", "Heating: Doors (Btu/h)"],
          ["door", "cooling_sensible", "Cooling Sensible: Doors (Btu/h)"],
          ["ceiling", "heating_sensible", "Heating: Ceilings (Btu/h)"],
          ["ceiling", "cooling_sensible", "Cooling Sensible: Ceilings (Btu/h)"],
          ["floor", "heating_sensible", "Heating: Floors (Btu/h)"],
          ["floor", "cooling_sensible", "Cooling Sensible: Floors (Btu/h)"],
          ["slab", "heating_sensible", "Heating: Slabs (Btu/h)"],
          ["infiltration", "heating_sensible", "Heating: Infiltration (Btu/h)"],
          ["infiltration", "cooling_sensible", "Cooling Sensible: Infiltration (Btu/h)"],
          ["infiltration", "cooling_latent", "Cooling Latent: Infiltration (Btu/h)"],
          ["internal_gain", "cooling_sensible", "Cooling Sensible: Internal Gains (Btu/h)"],
          ["internal_gain", "cooling_latent", "Cooling Latent: Internal Gains (Btu/h)"],
          ["aed_excursion", "cooling_sensible", "Cooling Sensible: AED Excursion (Btu/h)"],
          ["duct", "heating_sensible", "Heating: Ducts (Btu/h)"],
          ["duct", "cooling_sensible", "Cooling Sensible: Ducts (Btu/h)"],
          ["duct", "cooling_latent", "Cooling Latent: Ducts (Btu/h)"],
        ];
        for (const [kind, k, oracleKey] of pairs) {
          expect(Math.abs(byKind(kind, k) - o[oracleKey]!), `${kind} ${k}`).toBeLessThanOrEqual(tol("component").absolute_btuh);
        }
      });
    });
  }
});
