/**
 * Sensitivity cases (WO-03 E4; QA-005, QA-004). Each sens-* fixture changes one input of a base
 * house; the justification for every assertion is in
 * packages/templates/src/fixtures/sensitivity.ts and claude/06-architecture/sensitivity-cases.md.
 *
 * Every expectation is checked twice: on the engine (exact, floating-point tolerance) and on the
 * committed oracle run (to the oracle's 1 Btu/h reporting precision), so a case cannot pass by the
 * engine and the expectation sharing the same mistake. The fixture suite separately checks the
 * engine against the oracle on each case, totals and components.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CalcFixtureSchema } from "../src/fixture.js";
import { prepareInput, runCalculation } from "../src/engine.js";

type Q = "heating_sensible" | "cooling_sensible" | "cooling_latent";
const QS: readonly Q[] = ["heating_sensible", "cooling_sensible", "cooling_latent"];
const ORACLE_KEY: Record<Q, string> = { heating_sensible: "Heating", cooling_sensible: "Cooling Sensible", cooling_latent: "Cooling Latent" };
const ORACLE_KIND: Record<string, string> = {
  wall: "Walls",
  window: "Windows",
  door: "Doors",
  ceiling: "Ceilings",
  slab: "Slabs",
  infiltration: "Infiltration",
  internal_gain: "Internal Gains",
  duct: "Ducts",
};

/** QA-004 tolerance categories for this file. */
const TOL = {
  /** Engine against itself: identical arithmetic paths, so only floating-point noise. */
  floating_point_rel: 1e-9,
  floating_point_abs: 1e-6,
  /** The oracle reports every component rounded to 1 Btu/h; a ratio of two rounded values carries up to 0.5 / value each. */
  oracle_rounding_btuh: 1,
};

const fixturesDir = resolve(import.meta.dirname, "../fixtures");
const runsDir = resolve(import.meta.dirname, "../../../claude/09-spikes");

interface Case {
  components: Map<string, { kind: string } & Record<Q, number>>;
  totals: Record<Q, number>;
  oracle: Record<string, number>;
}

const cache = new Map<string, Promise<Case>>();
function load(name: string, runs: string): Promise<Case> {
  const hit = cache.get(name);
  if (hit) return hit;
  const p = (async () => {
    const fx = CalcFixtureSchema.parse(JSON.parse(readFileSync(resolve(fixturesDir, `${name}.fixture.json`), "utf8")));
    const prepared = prepareInput(fx.input);
    if (!prepared.ok) throw new Error(`${name} should prepare`);
    const out = await runCalculation(prepared.input);
    if (out.status !== "ok") throw new Error(`${name} did not run: ${JSON.stringify(out.errors)}`);
    const components = new Map(
      out.results.components.map((c) => [c.component_id, { kind: c.component_kind, heating_sensible: c.heating_sensible ?? 0, cooling_sensible: c.cooling_sensible ?? 0, cooling_latent: c.cooling_latent ?? 0 }]),
    );
    const b = out.results.building!;
    const oracle = (JSON.parse(readFileSync(resolve(runsDir, runs, "runs", name, "results_annual.json"), "utf8")) as { "HVAC Design Load": Record<string, number> })["HVAC Design Load"];
    return { components, totals: { heating_sensible: b.heating_sensible, cooling_sensible: b.cooling_sensible, cooling_latent: b.cooling_latent }, oracle };
  })();
  cache.set(name, p);
  return p;
}
const sens = (name: string) => load(name, "wo03-sensitivity");

const byKind = (c: Case, kind: string, q: Q) => [...c.components.values()].filter((x) => x.kind === kind).reduce((s, x) => s + x[q], 0);
const oracleKind = (c: Case, kind: string, q: Q) => {
  const v = c.oracle[`${ORACLE_KEY[q]}: ${ORACLE_KIND[kind]} (Btu/h)`];
  if (v === undefined) throw new Error(`oracle has no ${ORACLE_KEY[q]}: ${ORACLE_KIND[kind]}`);
  return v;
};
const oracleTotal = (c: Case, q: Q) => c.oracle[`${ORACLE_KEY[q]}: Total (Btu/h)`]!;

function expectRatio(actual: number, base: number, ratio: number, label: string) {
  expect(Math.abs(actual - base * ratio), label).toBeLessThanOrEqual(Math.max(TOL.floating_point_abs, Math.abs(base * ratio) * TOL.floating_point_rel));
}
/** Oracle values are rounded to 1 Btu/h, so a scaled base may be off by 0.5 x ratio + 0.5. */
function expectOracleRatio(actual: number, base: number, ratio: number, label: string) {
  expect(Math.abs(actual - base * ratio), label).toBeLessThanOrEqual(TOL.oracle_rounding_btuh * (0.5 * ratio + 0.5) + 1e-9);
}
function expectSame(a: number, b: number, label: string) {
  expect(Math.abs(a - b), label).toBeLessThanOrEqual(TOL.floating_point_abs);
}

/** Every component of `v` equals the base's, except those listed. */
function unchangedExcept(base: Case, v: Case, changed: (id: string, kind: string, q: Q) => boolean) {
  expect([...v.components.keys()].sort()).toEqual([...base.components.keys()].sort());
  for (const [id, b] of base.components) {
    for (const q of QS) if (!changed(id, b.kind, q)) expectSame(v.components.get(id)![q], b[q], `${id} ${q} should not change`);
  }
}

const HTD_BASE = 70 - 25.88;
const HTD_COLD = 70 - 20.88;
const CONDUCTION = new Set(["wall", "window", "door", "ceiling", "slab"]);

describe("sensitivity cases (QA-005)", () => {
  it("the base matches the quick-pass ranch except for the pinned ACH50 (sanity)", async () => {
    const b = await sens("sens-base");
    expect(b.totals.heating_sensible).toBeGreaterThan(0);
    expect(byKind(b, "duct", "heating_sensible")).toBeGreaterThan(0);
    expect(byKind(b, "infiltration", "heating_sensible")).toBeGreaterThan(0);
  });

  it("glazing typical to lots: windows scale by 0.22 / 0.15, walls lose the same U x dA x TD each, totals rise", async () => {
    const [b, v] = await Promise.all([sens("sens-base"), sens("sens-glazing-lots")]);
    const r = 0.22 / 0.15;
    for (const [id, c] of b.components) {
      if (c.kind !== "window") continue;
      for (const q of ["heating_sensible", "cooling_sensible"] as const) expectRatio(v.components.get(id)![q], c[q], r, `${id} ${q}`);
    }
    for (const q of ["heating_sensible", "cooling_sensible"] as const) {
      const walls = [...b.components].filter(([, c]) => c.kind === "wall").map(([id, c]) => v.components.get(id)![q] - c[q]);
      expect(walls.length).toBe(4);
      for (const d of walls) {
        expect(d).toBeLessThan(0);
        expectSame(d, walls[0]!, `every wall loses the same ${q}`);
      }
      expectOracleRatio(oracleKind(v, "window", q), oracleKind(b, "window", q), r, `oracle windows ${q}`);
      expect(oracleKind(v, "wall", q)).toBeLessThan(oracleKind(b, "wall", q));
    }
    unchangedExcept(b, v, (_id, kind) => kind === "window" || kind === "wall" || kind === "duct");
    for (const q of ["heating_sensible", "cooling_sensible"] as const) {
      expect(byKind(v, "duct", q)).toBeGreaterThan(byKind(b, "duct", q));
      expect(v.totals[q]).toBeGreaterThan(b.totals[q]);
      expect(oracleTotal(v, q)).toBeGreaterThan(oracleTotal(b, q));
    }
  });

  it("leakage 10 to 15 ACH50: infiltration scales by exactly 1.5, envelope unchanged, all totals rise", async () => {
    const [b, v] = await Promise.all([sens("sens-base"), sens("sens-leakage-up")]);
    for (const q of QS) {
      expectRatio(byKind(v, "infiltration", q), byKind(b, "infiltration", q), 1.5, `infiltration ${q}`);
      expectOracleRatio(oracleKind(v, "infiltration", q), oracleKind(b, "infiltration", q), 1.5, `oracle infiltration ${q}`);
      expect(v.totals[q]).toBeGreaterThan(b.totals[q]);
      expect(oracleTotal(v, q)).toBeGreaterThan(oracleTotal(b, q));
    }
    unchangedExcept(b, v, (_id, kind) => kind === "infiltration" || kind === "duct");
  });

  it("ducts attic to conditioned space: duct component goes to 0, totals fall by exactly the base duct load", async () => {
    const [b, v] = await Promise.all([sens("sens-base"), sens("sens-ducts-conditioned")]);
    for (const q of QS) {
      expect(byKind(b, "duct", q)).toBeGreaterThan(0);
      expectSame(byKind(v, "duct", q), 0, `duct ${q}`);
      expect(oracleKind(v, "duct", q)).toBe(0);
      expectSame(v.totals[q], b.totals[q] - byKind(b, "duct", q), `total ${q}`);
      expect(Math.abs(oracleTotal(v, q) - (oracleTotal(b, q) - oracleKind(b, "duct", q)))).toBeLessThanOrEqual(TOL.oracle_rounding_btuh);
    }
    unchangedExcept(b, v, (_id, kind) => kind === "duct");
  });

  it("heating design 5 F colder: conduction heating scales by HTD'/HTD, infiltration by more, cooling unchanged", async () => {
    const [b, v] = await Promise.all([sens("sens-base"), sens("sens-heating-design-colder")]);
    const r = HTD_COLD / HTD_BASE;
    for (const [id, c] of b.components) {
      if (CONDUCTION.has(c.kind)) expectRatio(v.components.get(id)!.heating_sensible, c.heating_sensible, r, `${id} heating`);
    }
    for (const kind of CONDUCTION) expectOracleRatio(oracleKind(v, kind, "heating_sensible"), oracleKind(b, kind, "heating_sensible"), r, `oracle ${kind} heating`);
    expect(byKind(v, "infiltration", "heating_sensible")).toBeGreaterThan(byKind(b, "infiltration", "heating_sensible") * r);
    expect(oracleKind(v, "infiltration", "heating_sensible")).toBeGreaterThan(oracleKind(b, "infiltration", "heating_sensible") * r);
    unchangedExcept(b, v, (_id, _kind, q) => q === "heating_sensible");
    expect(oracleTotal(v, "cooling_sensible")).toBe(oracleTotal(b, "cooling_sensible"));
    expect(oracleTotal(v, "cooling_latent")).toBe(oracleTotal(b, "cooling_latent"));
  });

  it("cooling design 5 F hotter: each conduction component rises by the Btu/h it rises by for 5 F colder heating; heating unchanged", async () => {
    const [b, hot, cold] = await Promise.all([sens("sens-base"), sens("sens-cooling-design-hotter"), sens("sens-heating-design-colder")]);
    for (const [id, c] of b.components) {
      if (!CONDUCTION.has(c.kind) || c.kind === "slab") continue;
      const dCool = hot.components.get(id)!.cooling_sensible - c.cooling_sensible;
      const dHeat = cold.components.get(id)!.heating_sensible - c.heating_sensible;
      expect(dCool, id).toBeGreaterThan(0);
      expectSame(dCool, dHeat, `${id}: U x A x 5`);
    }
    for (const kind of ["wall", "window", "door", "ceiling"]) {
      const dCool = oracleKind(hot, kind, "cooling_sensible") - oracleKind(b, kind, "cooling_sensible");
      const dHeat = oracleKind(cold, kind, "heating_sensible") - oracleKind(b, kind, "heating_sensible");
      expect(Math.abs(dCool - dHeat), `oracle ${kind}`).toBeLessThanOrEqual(2 * TOL.oracle_rounding_btuh);
    }
    for (const q of ["cooling_sensible", "cooling_latent"] as const) {
      expect(byKind(hot, "infiltration", q)).toBeGreaterThan(byKind(b, "infiltration", q));
      expect(oracleKind(hot, "infiltration", q)).toBeGreaterThan(oracleKind(b, "infiltration", q));
      expect(hot.totals[q]).toBeGreaterThan(b.totals[q]);
    }
    unchangedExcept(b, hot, (_id, kind, q) => q !== "heating_sensible" && (CONDUCTION.has(kind) || kind === "infiltration" || kind === "duct"));
    expect(byKind(hot, "slab", "cooling_sensible")).toBe(byKind(b, "slab", "cooling_sensible"));
    expect(oracleTotal(hot, "heating_sensible")).toBe(oracleTotal(b, "heating_sensible"));
  });

  it("R01 ranch rotated 90 degrees: heating and walls unchanged, south and north glass move to west and east, cooling rises", async () => {
    const [b, v] = await Promise.all([load("ranch-1960s-dfw", "r01"), sens("sens-orientation-r01-rot90")]);
    for (const [id, c] of b.components) expectSame(v.components.get(id)!.heating_sensible, c.heating_sensible, `${id} heating`);
    expect(oracleTotal(v, "heating_sensible")).toBe(oracleTotal(b, "heating_sensible"));
    // win-s (60 ft2) now faces west and win-n (50 ft2) east: both gain; win-e and win-w now face south and north: both lose.
    for (const id of ["win-s", "win-n"]) expect(v.components.get(id)!.cooling_sensible, id).toBeGreaterThan(b.components.get(id)!.cooling_sensible);
    for (const id of ["win-e", "win-w"]) expect(v.components.get(id)!.cooling_sensible, id).toBeLessThan(b.components.get(id)!.cooling_sensible);
    expect(byKind(v, "window", "cooling_sensible")).toBeGreaterThan(byKind(b, "window", "cooling_sensible"));
    expect(oracleKind(v, "window", "cooling_sensible")).toBeGreaterThan(oracleKind(b, "window", "cooling_sensible"));
    expect(v.totals.cooling_sensible).toBeGreaterThan(b.totals.cooling_sensible);
    expect(oracleTotal(v, "cooling_sensible")).toBeGreaterThan(oracleTotal(b, "cooling_sensible"));
    unchangedExcept(b, v, (_id, kind, q) => q !== "heating_sensible" && (kind === "window" || kind === "duct"));
  });
});
