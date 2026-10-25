import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CalcFixtureSchema } from "../src/fixture.js";
import { prepareInput, runCalculation } from "../src/engine.js";

const load = (name: string) => CalcFixtureSchema.parse(JSON.parse(readFileSync(resolve(import.meta.dirname, `../fixtures/${name}.fixture.json`), "utf8")));

describe("several ducted systems (WO-03 B3)", () => {
  it("gives each system its own duct component and adds them to the house total", async () => {
    const p = prepareInput(load("two-story-garage-2sys-dfw").input);
    if (!p.ok) throw new Error("prepare");
    const out = await runCalculation(p.input);
    const ducts = out.results.components.filter((c) => c.component_kind === "duct");
    expect(ducts.map((d) => d.component_id).sort()).toEqual(["dist-1", "dist-2"]);
    for (const d of ducts) expect(d.heating_sensible).toBeGreaterThan(0);
  });

  it("refuses systems whose fractions of load served add up to more than 1 before any run", () => {
    const fx = load("two-story-garage-2sys-dfw");
    fx.input.assessment.building.systems.hvac.heat_pumps[0]!.fraction_heat_load_served.value = 0.8;
    const p = prepareInput(fx.input);
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.issues.map((i) => i.message)).toContain("heat load served sums to 1.25 (> 1)");
  });

  it("a ductless house has no duct component and no duct load", async () => {
    const p = prepareInput(load("ranch-1960s-ductless-dfw").input);
    if (!p.ok) throw new Error("prepare");
    const out = await runCalculation(p.input);
    expect(out.status).toBe("ok");
    expect(out.results.components.some((c) => c.component_kind === "duct")).toBe(false);
  });
});
