import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CalcFixtureSchema } from "../src/fixture.js";
import { prepareInput, runCalculation } from "../src/engine.js";

const load = (name: string) => CalcFixtureSchema.parse(JSON.parse(readFileSync(resolve(import.meta.dirname, `../fixtures/${name}.fixture.json`), "utf8")));
const perTon = (cfa: number, b: { cooling_sensible: number; cooling_latent: number }) => cfa / ((b.cooling_sensible + b.cooling_latent) / 12000);

describe("template sanity band (WO-03 A4)", () => {
  it("the R01 ranch sits inside the pre-1980 band and gets no warning", async () => {
    const fx = load("ranch-1960s-dfw");
    expect(fx.input.checks?.sanity_band?.low_ft2_per_ton).toBe(350);
    const p = prepareInput(fx.input);
    if (!p.ok) throw new Error("prepare");
    const out = await runCalculation(p.input);
    expect(perTon(1600, out.results.building!)).toBeCloseTo(367.9, 1);
    expect(out.warnings.some((w) => w.code === "SANITY_BAND_OUTSIDE")).toBe(false);
  });

  it("outside the band is a warning with the numbers, never an error", async () => {
    const fx = load("ranch-1960s-dfw");
    fx.input.checks!.sanity_band!.low_ft2_per_ton = 400;
    const p = prepareInput(fx.input);
    if (!p.ok) throw new Error("prepare");
    const out = await runCalculation(p.input);
    expect(out.status).toBe("ok");
    const w = out.warnings.find((x) => x.code === "SANITY_BAND_OUTSIDE");
    expect(w?.message).toMatch(/^368 ft2 per ton .* outside the 400 to 450 band of template dfw-pre1980-ranch-slab/);
  });

  it("a template with no band on file adds no check", () => {
    expect(load("two-story-2010-dfw").input.checks).toBeUndefined();
  });
});
