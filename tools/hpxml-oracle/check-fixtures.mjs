#!/usr/bin/env node
/**
 * Reference-mode check of every calc fixture against the live oracle (WO-02 Track C; gate G1).
 *
 *   node tools/hpxml-oracle/check-fixtures.mjs [--out <dir>]
 *
 * For each packages/calc/fixtures/*.fixture.json:
 *   1. run the RhoeFlow engine and write an artifact bundle (rhoe-calc run --bundle equivalent)
 *   2. serialize the Assessment to HPXML and run the pinned oracle design-only on it
 *   3. compare oracle vs fixture `expected` and oracle vs engine, totals and components,
 *      using packages/calc/fixtures/tolerances.json
 *   4. read back the oracle's software defaults and list the load-affecting ones
 *   5. copy the oracle outputs into the bundle under oracle/, add reference-report.json,
 *      and re-write the bundle manifest
 * Exits 1 on any mismatch or oracle failure, 2 on setup errors.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CalcFixtureSchema, prepareInput, resolveWeatherStation, runCalculation } from "@rhoeflow/calc";
import { writeBundle, writeManifest } from "@rhoeflow/calc/bundle";
import { readSoftwareDefaults } from "@rhoeflow/hpxml";
import { oracleEnv, runDesignOnly } from "./oracle.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const fixturesDir = join(repo, "packages/calc/fixtures");
const outFlag = process.argv.indexOf("--out");
const outRoot = resolve(outFlag >= 0 ? process.argv[outFlag + 1] : join(tmpdir(), "rhoe-oracle-check"));

let env;
try {
  env = oracleEnv();
} catch (e) {
  console.error(`setup: ${e.message}`);
  process.exit(2);
}
console.log(`oracle: OpenStudio ${env.version}, OpenStudio-HPXML ${env.hpxmlVersion}`);
console.log(`output: ${outRoot}`);

const tolerances = JSON.parse(readFileSync(join(fixturesDir, "tolerances.json"), "utf8"));
const tol = (q) => tolerances.comparisons.find((c) => c.quantity === q).absolute_btuh;
const COMPONENTS = [
  ["wall", "Walls"], ["window", "Windows"], ["door", "Doors"], ["ceiling", "Ceilings"], ["floor", "Floors"], ["roof", "Roofs"], ["slab", "Slabs"],
  ["infiltration", "Infiltration"], ["internal_gain", "Internal Gains"], ["aed_excursion", "AED Excursion"], ["duct", "Ducts"],
];
/**
 * Oracle defaults that affect the design load and that RhoeFlow is known to derive the same way
 * from inputs it already holds (WO-02 C4, re-checked on the WO-03 fixtures). A load-affecting
 * default outside this list fails the check, so a new oracle default is looked at, not ignored.
 */
const VERIFIED_DERIVATIONS = {
  HumidityDifference: "MJ8.design_conditions: grains from the station MCWB and the indoor setpoint and RH",
  InfiltrationHeight: "MJ8.infiltration.blower_door: from stories and ceiling height",
  RoofColor: "MJ8.envelope.conduction: color class from roof solar absorptance",
  Color: "MJ8.envelope.conduction: wall color class from solar absorptance",
  DuctBuriedInsulationLevel: "MJ8.ducts: ducts not buried (no buried-duct input exists)",
  DuctEffectiveRValue: "MJ8.ducts: effective R from nominal R, air films and round-duct geometry",
  DuctSurfaceArea: "MJ8.ducts: ASHRAE 152 default area from floor area served",
  BlowerFanHeatBtuh: "MJ8.ducts: blower heat not added, same as the oracle default of 0",
};
const PREFIX = { heating_sensible: "Heating: ", cooling_sensible: "Cooling Sensible: ", cooling_latent: "Cooling Latent: " };
const TOTAL = { heating_sensible: "Heating: Total (Btu/h)", cooling_sensible: "Cooling Sensible: Total (Btu/h)", cooling_latent: "Cooling Latent: Total (Btu/h)" };

rmSync(outRoot, { recursive: true, force: true });
let failures = 0;
for (const file of readdirSync(fixturesDir).filter((f) => f.endsWith(".fixture.json")).sort()) {
  const fx = CalcFixtureSchema.parse(JSON.parse(readFileSync(join(fixturesDir, file), "utf8")));
  const issues = [];
  const prepared = prepareInput(fx.input);
  if (!prepared.ok) {
    console.log(`FAIL  ${fx.name}: input does not prepare`, prepared.issues);
    failures++;
    continue;
  }
  const output = await runCalculation(prepared.input);
  const bundle = join(outRoot, fx.name);
  writeBundle(bundle, prepared.input, output);
  if (output.status !== "ok") issues.push(`engine status ${output.status}: ${JSON.stringify(output.errors)}`);

  const station = resolveWeatherStation(prepared.input.weather);
  const run = runDesignOnly(join(bundle, "building.xml"), join(outRoot, `${fx.name}-oracle`), { quiet: true });
  let report = { fixture: fx.name, oracle_command: run.command, oracle_status: run.status, epw: station.epwFile };
  if (run.status !== 0) {
    issues.push(`oracle exit ${run.status}: ${run.error}; run log ${join(run.runDir, "run.log")}`);
  } else {
    const oracle = JSON.parse(readFileSync(join(run.runDir, "results_annual.json"), "utf8"))["HVAC Design Load"];
    const b = output.results.building;
    const rows = [];
    for (const k of Object.keys(TOTAL)) {
      const o = oracle[TOTAL[k]];
      const t = tol(`building.${k}`);
      if (fx.expected && Math.abs(o - fx.expected.building[k]) > t) issues.push(`${k}: oracle ${o} vs fixture expected ${fx.expected.building[k]}`);
      if (b && Math.abs(b[k] - o) > t) issues.push(`${k}: engine ${b[k].toFixed(1)} vs oracle ${o} (tolerance ${t})`);
      rows.push({ quantity: `building.${k}`, engine: b ? b[k] : null, oracle: o, expected: fx.expected?.building[k] ?? null, tolerance_btuh: t });
    }
    for (const [kind, label] of COMPONENTS) {
      for (const k of Object.keys(PREFIX)) {
        const key = `${PREFIX[k]}${label} (Btu/h)`;
        if (!(key in oracle)) continue;
        const engine = output.results.components.filter((c) => c.component_kind === kind).reduce((s, c) => s + (c[k] ?? 0), 0);
        if (Math.abs(engine - oracle[key]) > tol("component")) issues.push(`${key}: engine ${engine.toFixed(1)} vs oracle ${oracle[key]}`);
        if (engine !== 0 || oracle[key] !== 0) rows.push({ quantity: key, engine, oracle: oracle[key], tolerance_btuh: tol("component") });
      }
    }
    const defaults = readSoftwareDefaults(readFileSync(join(run.runDir, "in.xml"), "utf8"));
    const loadAffecting = defaults.filter((d) => d.affectsDesignLoad);
    for (const d of loadAffecting) {
      if (!(d.element in VERIFIED_DERIVATIONS)) issues.push(`oracle defaulted a load-affecting value RhoeFlow has not verified it derives: ${d.path} = ${d.value}`);
    }
    report = { ...report, comparisons: rows, software_defaults_total: defaults.length, software_defaults_load_affecting: loadAffecting.map((d) => ({ ...d, rhoeflow_derivation: VERIFIED_DERIVATIONS[d.element] ?? null })) };
    mkdirSync(join(bundle, "oracle"), { recursive: true });
    for (const f of ["in.xml", "results_annual.json", "results_design_load_details.json", "run.log"]) copyFileSync(join(run.runDir, f), join(bundle, "oracle", f));
  }
  report.issues = issues;
  writeFileSync(join(bundle, "reference-report.json"), JSON.stringify(report, null, 2) + "\n");
  writeManifest(bundle, output);

  if (issues.length > 0) {
    failures++;
    console.log(`FAIL  ${fx.name}`);
    for (const i of issues) console.log(`      ${i}`);
  } else {
    const b = output.results.building;
    const la = report.software_defaults_load_affecting.length;
    console.log(
      `ok    ${fx.name}  engine ${Math.round(b.heating_sensible)} / ${Math.round(b.cooling_sensible)} / ${Math.round(b.cooling_latent)} Btu/h matches the oracle and the fixture; ${report.comparisons.length} comparisons; ${la} load-affecting oracle defaults, each a verified RhoeFlow derivation; oracle ${run.elapsedS.toFixed(1)} s`,
    );
  }
}
process.exit(failures === 0 ? 0 : 1);
