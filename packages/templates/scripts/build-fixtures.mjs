#!/usr/bin/env node
/**
 * Regenerate the committed calc fixtures from the template package's reference houses.
 * Run after `pnpm build`:  pnpm --filter @rhoeflow/templates build:fixtures
 *
 * For each house: validate the base Assessment, apply its era template, and write
 * packages/calc/fixtures/<name>.fixture.json with an `expected` block read from the committed
 * oracle run in claude/09-spikes/r01/runs/<name>/results_annual.json (QA-002). The templates
 * test suite checks the committed files match this script's output.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAssessment } from "@rhoeflow/schema";
import {
  DFW_WEATHER_REF,
  applyTemplate,
  crawlRanchBaseAssessment,
  ductlessRanchBaseAssessment,
  garageOneStoryBaseAssessment,
  getTemplate,
  ranchBaseAssessment,
  twoStoryBaseAssessment,
  twoSystemTwoStoryBaseAssessment,
} from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const outDir = resolve(repo, "packages/calc/fixtures");
mkdirSync(outDir, { recursive: true });

const ENGINE_VERSION = "0.2.0";

const houses = [
  {
    name: "ranch-1960s-dfw",
    base: ranchBaseAssessment,
    template: "dfw-pre1980-ranch-slab",
    runs: "claude/09-spikes/r01/runs",
    input: "claude/09-spikes/r01",
    description:
      "1964 brick-veneer slab ranch, 1,600 ft2, DFW (IECC 3A). Illustrative reference house 1 for R01 and WO-02. Template dfw-pre1980-ranch-slab applied; design conditions from the pinned weather library (ADR-034); placeholders noted in field notes. Not a real property.",
  },
  {
    name: "two-story-2010-dfw",
    base: twoStoryBaseAssessment,
    template: "dfw-2001-2011-two-story-iecc2000",
    runs: "claude/09-spikes/r01/runs",
    input: "claude/09-spikes/r01",
    description:
      "2010 brick-veneer slab two-story, 2,400 ft2, DFW (IECC 3A). Illustrative reference house 2 for R01 and WO-02. Template dfw-2001-2011-two-story-iecc2000 applied; duct leakage derived from the template rate; design conditions from the pinned weather library (ADR-034). Not a real property.",
  },
  {
    name: "ranch-1950s-crawl-dfw",
    base: crawlRanchBaseAssessment,
    template: "dfw-pre1980-ranch-slab",
    runs: "claude/09-spikes/wo03/runs",
    input: "claude/09-spikes/wo03",
    description:
      "1955 pier-and-beam ranch, 1,600 ft2, DFW: the R01 ranch on a vented crawlspace with a brick skirt and the return duct under the floor (WO-03 B1, B5). Not a real property.",
  },
  {
    name: "one-story-2018-garage-dfw",
    base: garageOneStoryBaseAssessment,
    template: "dfw-2016-2020-iecc2015",
    runs: "claude/09-spikes/wo03/runs",
    input: "claude/09-spikes/wo03",
    description:
      "2018 one-story, 1,600 ft2, DFW, with an attached 2-car garage (shared wall and door) and a grade-1 radiant barrier (WO-03 B1, B2, B5). Not a real property.",
  },
  {
    name: "two-story-garage-2sys-dfw",
    base: twoSystemTwoStoryBaseAssessment,
    template: "dfw-2001-2011-two-story-iecc2000",
    runs: "claude/09-spikes/wo03/runs",
    input: "claude/09-spikes/wo03",
    description:
      "The R01 two-story with a bonus room over an attached 2-car garage (2,820 ft2) and two ducted systems: furnace and AC downstairs with the return in the garage, heat pump upstairs (WO-03 B1, B3, B5). Not a real property.",
  },
  {
    name: "ranch-1960s-ductless-dfw",
    base: ductlessRanchBaseAssessment,
    template: "dfw-pre1980-ranch-slab",
    runs: "claude/09-spikes/wo03/runs",
    input: "claude/09-spikes/wo03",
    description: "The R01 ranch with one ductless mini-split heat pump and no ducts (WO-03 B7). Not a real property.",
  },
];

for (const h of houses) {
  const base = validateAssessment(h.base());
  if (!base.ok) {
    console.error(`${h.name}: base assessment is invalid`, base.issues);
    process.exit(1);
  }
  const { assessment, applied, skipped } = applyTemplate(base.assessment, getTemplate(h.template));

  const runPath = resolve(repo, `${h.runs}/${h.name}/results_annual.json`);
  const load = existsSync(runPath) ? JSON.parse(readFileSync(runPath, "utf8"))["HVAC Design Load"] : null;
  if (!load) console.log(`  ${h.name}: no committed oracle run at ${h.runs}/${h.name}; expected left null until one is recorded`);

  const fixture = {
    fixture_version: "0.1.0",
    name: h.name,
    description: h.description,
    label: "fixture",
    input: {
      calc_input_version: "0.1.0",
      requested_engine: { name: "@rhoeflow/calc", version: ENGINE_VERSION },
      method_ids: [],
      weather: { ...DFW_WEATHER_REF },
      scenario: { id: "baseline", name: "Baseline", overrides: [] },
      assessment,
    },
    expected: load && {
      source: `OpenStudio-HPXML v1.12.0 (OpenStudio 3.11.0+241b8abb4d) design-only run of ${h.input}/${h.name}.xml, committed at ${h.runs}/${h.name}/results_annual.json (HVAC Design Load totals, rounded to 1 Btu/h by the oracle)`,
      tolerance_basis: "floating_point",
      tolerance: { absolute: 5 },
      building: {
        heating_sensible: load["Heating: Total (Btu/h)"],
        cooling_sensible: load["Cooling Sensible: Total (Btu/h)"],
        cooling_latent: load["Cooling Latent: Total (Btu/h)"],
        unit: "Btu/h",
      },
    },
  };

  const outFile = resolve(outDir, `${h.name}.fixture.json`);
  writeFileSync(outFile, JSON.stringify(fixture, null, 2) + "\n");
  console.log(`wrote ${outFile}`);
  console.log(`  template ${h.template}: applied ${applied.length}, skipped ${skipped.length}`);
  for (const s of skipped) console.log(`    skipped ${s.slot}${s.path ? " @ " + s.path : ""}: ${s.reason}`);
  if (fixture.expected) console.log(`  expected heating ${fixture.expected.building.heating_sensible}, cooling sensible ${fixture.expected.building.cooling_sensible}, cooling latent ${fixture.expected.building.cooling_latent}`);
}
