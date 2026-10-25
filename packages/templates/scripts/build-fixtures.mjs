#!/usr/bin/env node
/**
 * Regenerate the committed calc fixtures from the template package's reference houses.
 * Run after `pnpm build`:  pnpm --filter @rhoeflow/templates build:fixtures
 *
 * Writes packages/calc/fixtures/ranch-1960s-dfw.fixture.json. The templates test suite
 * checks the committed file matches what this script produces, so a template edit that
 * changes a default shows up as a test failure until the fixture is regenerated and reviewed.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAssessment } from "@rhoeflow/schema";
import { applyTemplate, getTemplate, ranchBaseAssessment } from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../../calc/fixtures");
mkdirSync(outDir, { recursive: true });

const base = validateAssessment(ranchBaseAssessment());
if (!base.ok) {
  console.error("ranch base assessment is invalid:", base.issues);
  process.exit(1);
}
const { assessment, applied, skipped } = applyTemplate(base.assessment, getTemplate("dfw-pre1980-ranch-slab"));

const fixture = {
  fixture_version: "0.1.0",
  name: "ranch-1960s-dfw",
  description:
    "1964 brick-veneer slab ranch, 1600 ft2, DFW (IECC 3A). Illustrative reference house for WO-01 and Track A (R01) reference run 1. Template dfw-pre1980-ranch-slab applied; placeholders noted in field notes. Not a real property.",
  label: "fixture",
  input: {
    calc_input_version: "0.1.0",
    requested_engine: { name: "@rhoeflow/calc", version: "0.0.1" },
    method_ids: [],
    weather: { library: "fixture-weather", version: "0", station_key: "722590" },
    scenario: { id: "baseline", name: "Baseline", overrides: [] },
    assessment,
  },
  expected: null,
};

const outFile = resolve(outDir, "ranch-1960s-dfw.fixture.json");
writeFileSync(outFile, JSON.stringify(fixture, null, 2) + "\n");
console.log(`wrote ${outFile}`);
console.log(`applied ${applied.length} template defaults:`);
for (const a of applied) console.log(`  ${a.path} = ${a.value}${a.unit ? " " + a.unit : ""}`);
console.log(`skipped ${skipped.length}:`);
for (const s of skipped) console.log(`  ${s.slot}${s.path ? " @ " + s.path : ""}: ${s.reason}`);
