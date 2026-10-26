import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CalcFixtureSchema, prepareInput, runCalculation, type CalcOutput } from "@rhoeflow/calc";
import { getFieldAtPath } from "@rhoeflow/schema";
import { buildReport, NOTICES, parsePrinted, printed, ReportError, roundHalfAway, ROUNDING_RULES, type PrintedNumber, type ReportModel } from "../src/index.js";

const dir = resolve(import.meta.dirname, "../../calc/fixtures");
const files = readdirSync(dir).filter((f) => f.endsWith(".fixture.json"));

async function outputFor(file: string): Promise<CalcOutput> {
  const fx = CalcFixtureSchema.parse(JSON.parse(readFileSync(resolve(dir, file), "utf8")));
  const p = prepareInput(fx.input);
  if (!p.ok) throw new Error(`${file} should prepare`);
  return runCalculation(p.input, { run_id: "6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b", now: () => new Date("2026-10-26T12:00:00Z") });
}
const runInfo = (out: CalcOutput, over: Partial<{ status: string; stale: boolean; run_id: string }> = {}) => ({
  run_id: out.manifest.run_id,
  assessment_id: out.frozen_input.assessment.assessment_id,
  revision: 1,
  status: "ok",
  stale: false,
  stale_reason: null,
  ...over,
});

function* printedNumbers(x: unknown, path = ""): Generator<{ path: string; n: PrintedNumber }> {
  if (Array.isArray(x)) {
    for (let i = 0; i < x.length; i++) yield* printedNumbers(x[i], `${path}[${i}]`);
    return;
  }
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    if (typeof o["raw"] === "number" && typeof o["rule"] === "string" && typeof o["text"] === "string") {
      yield { path, n: o as unknown as PrintedNumber };
      return;
    }
    for (const [k, v] of Object.entries(o)) yield* printedNumbers(v, path ? `${path}.${k}` : k);
  }
}

describe("rounding rules (RPT-001)", () => {
  it("rounds half away from zero, robust to binary representation", () => {
    expect(roundHalfAway(1.005, 2)).toBe(1.01);
    expect(roundHalfAway(2.5, 0)).toBe(3);
    expect(roundHalfAway(-2.5, 0)).toBe(-3);
    expect(roundHalfAway(-0.4, 0)).toBe(0);
    expect(Object.is(roundHalfAway(-0.4, 0), -0)).toBe(false);
    expect(roundHalfAway(63567.6, 0)).toBe(63568);
  });

  it("prints with grouping except years and azimuths, and the text parses back to the value", () => {
    expect(printed(63567.6, "btuh").text).toBe("63,568");
    expect(printed(1964, "year").text).toBe("1964");
    expect(printed(4.4123, "tons").text).toBe("4.41");
    expect(printed(0.5, "shgc").text).toBe("0.50");
    for (const n of [printed(12345.678, "area_ft2"), printed(0.0789, "u_value"), printed(-3.25, "htm")]) expect(parsePrinted(n.text)).toBe(n.value);
  });
});

describe("report model from a frozen run (RPT-001, RPT-002, WTH-001)", () => {
  for (const file of files) {
    it(`${file}: every printed number equals its run or input value under its rule`, async () => {
      const out = await outputFor(file);
      const m = buildReport({ run: runInfo(out), output: JSON.parse(JSON.stringify(out)) });
      const all = [...printedNumbers(m)];
      expect(all.length).toBeGreaterThan(50);
      for (const { path, n } of all) {
        expect(n.value, path).toBe(roundHalfAway(n.raw, ROUNDING_RULES[n.rule].decimals));
        expect(parsePrinted(n.text), path).toBe(n.value);
      }

      // Totals print the run's totals.
      const b = out.results.building!;
      expect(m.totals.heating.value).toMatchObject({ raw: b.heating_sensible });
      expect(m.totals.cooling_sensible.value).toMatchObject({ raw: b.cooling_sensible });
      expect(m.totals.cooling_latent.value).toMatchObject({ raw: b.cooling_latent });
      expect(m.worksheet.totals.heating.raw).toBe(b.heating_sensible);

      // Every input cell prints the frozen field at its path, with that field's state and source.
      for (const c of m.inputs) {
        const f = getFieldAtPath(out.frozen_input.assessment, c.path) as { value: unknown; state: string; source: string };
        expect(f, c.path).toBeDefined();
        expect(c.state).toBe(f.state);
        expect(c.source).toBe(f.source);
        if (typeof f.value === "number") expect((c.value as PrintedNumber).raw, c.path).toBe(f.value);
      }
      for (const t of m.construction) {
        for (const r of t.rows) {
          for (const c of r.cells) {
            if (!c) continue;
            const f = getFieldAtPath(out.frozen_input.assessment, c.path) as { value: unknown } | undefined;
            expect(f, `${t.title} ${r.id} ${c.path}`).toBeDefined();
            if (typeof f!.value === "number") expect((c.value as PrintedNumber).raw).toBe(f!.value);
          }
        }
      }

      // One worksheet row per component, carrying the component's own loads.
      expect(m.worksheet.recorded).toBe(true);
      expect(m.worksheet.rows.map((r) => r.component_id)).toEqual(out.results.components.map((c) => c.component_id));
      out.results.components.forEach((c, i) => {
        const r = m.worksheet.rows[i]!;
        expect(r.heating.raw).toBe(c.heating_sensible ?? 0);
        expect(r.cooling_sensible.raw).toBe(c.cooling_sensible ?? 0);
        expect(r.cooling_latent.raw).toBe(c.cooling_latent ?? 0);
      });

      // Provenance: every field counted, none unknown or proposed in a run.
      const sum = Object.values(m.provenance.counts).reduce((s, x) => s + x, 0);
      expect(sum).toBe(m.provenance.total);
      expect(m.provenance.counts.unknown).toBe(0);
      expect(m.provenance.counts.proposed).toBe(0);
      expect(m.provenance.defaulted_by_source.reduce((s, g) => s + g.count, 0)).toBe(m.provenance.counts.defaulted);

      // Design conditions: station and dataset, setpoints and RH, and psychrometrics (WTH-001).
      expect(m.design_conditions.recorded).toBe(true);
      const labels = m.design_conditions.rows.map((r) => r.label);
      for (const l of ["Weather station", "Weather dataset", "Atmospheric pressure (standard, at elevation)", "Indoor relative humidity (cooling)", "Design grains difference (outdoor − indoor)"]) expect(labels).toContain(l);

      // Sanity band flag agrees with the engine's warning.
      if (m.sanity.band) expect(m.sanity.band.inside).toBe(!out.warnings.some((w) => w.code === "SANITY_BAND_OUTSIDE"));

      expect(m.notices.map((n) => n.id)).toEqual(["independent_software", "non_approval", "openstudio_hpxml"]);
      expect(m.excluded.map((x) => x.page)).toEqual(["Equipment selection (Manual S)", "Room-by-room loads", "Duct design (Manual D)"]);
    });
  }

  it("lists a moved design temperature as an override against the station value", async () => {
    const out = await outputFor("sens-cooling-design-hotter.fixture.json");
    const m = buildReport({ run: runInfo(out), output: out });
    expect(m.design_conditions.overrides).toEqual([
      expect.objectContaining({ label: "Outdoor cooling design", station: "98.4 °F", used: "103.4 °F", state: "assumed" }),
    ]);
    const base = buildReport({ run: runInfo(await outputFor("sens-base.fixture.json")), output: await outputFor("sens-base.fixture.json") });
    expect(base.design_conditions.overrides).toEqual([]);
  });

  it("shows tech answers and documented records apart from defaults", async () => {
    const out = await outputFor("qp-ranch-1964-slab.fixture.json");
    const m = buildReport({ run: runInfo(out), output: out });
    expect(m.provenance.measured_or_documented.map((c) => c.path)).toEqual(expect.arrayContaining(["building.building_construction.year_built", "building.building_construction.conditioned_floor_area"]));
    expect(m.provenance.assumed.map((c) => c.path)).toContain("building.site.azimuth_of_front_of_home");
    expect(m.provenance.defaulted_by_source.map((g) => g.source)).toEqual(expect.arrayContaining(["Era template dfw-pre1980-ranch-slab", "Weather library (ASHRAE design conditions)"]));
  });

  it("refuses a run that is not ok, and an output from another run", async () => {
    const out = await outputFor("ranch-1960s-dfw.fixture.json");
    expect(() => buildReport({ run: runInfo(out, { status: "error" }), output: out })).toThrow(ReportError);
    expect(() => buildReport({ run: runInfo(out, { run_id: "00000000-0000-4000-8000-000000000000" }), output: out })).toThrow(/belongs to run/);
    expect(() => buildReport({ run: runInfo(out), output: { nonsense: true } })).toThrow(/does not parse/);
  });

  it("marks a stale run and carries the property label it is given", async () => {
    const out = await outputFor("ranch-1960s-dfw.fixture.json");
    const m: ReportModel = buildReport({ run: { ...runInfo(out), stale: true, stale_reason: "template changed" }, output: out, property_label: { text: "123 Example St", source: "WorkEdge property we_property_x" } });
    expect(m.meta.stale).toBe(true);
    expect(m.meta.stale_reason).toBe("template changed");
    expect(m.home.property_label?.text).toBe("123 Example St");
  });

  it("renders a frozen 0.2.0 run and says what it did not record", async () => {
    const out = await outputFor("ranch-1960s-dfw.fixture.json");
    const old = JSON.parse(JSON.stringify(out)) as { calc_output_version: string; results: { design_conditions?: unknown; components: { detail?: unknown }[] } };
    old.calc_output_version = "0.2.0";
    delete old.results.design_conditions;
    for (const c of old.results.components) delete c.detail;
    const m = buildReport({ run: runInfo(out), output: old });
    expect(m.worksheet.recorded).toBe(false);
    expect(m.design_conditions.recorded).toBe(false);
    expect(m.worksheet.rows[0]!.htm_heating).toBeNull();
    expect(m.design_conditions.rows.map((r) => r.label)).toContain("Outdoor cooling design (1 % dry bulb)");
  });

  it("carries the notices verbatim", () => {
    expect(NOTICES.find((n) => n.id === "openstudio_hpxml")!.text).toContain("Alliance for Energy Innovation, LLC");
    expect(NOTICES.find((n) => n.id === "non_approval")!.text).toMatch(/not a permit approval/);
    expect(NOTICES.find((n) => n.id === "independent_software")!.text).toMatch(/not produced, licensed or endorsed by ACCA/);
  });
});
