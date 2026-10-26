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
  QUICK_PASS_FIXTURE_TIMESTAMP,
  QUICK_PASS_HOUSES,
  SENSITIVITY_BASE_ANSWERS,
  SENSITIVITY_CASES,
  buildQuickPass,
  applyTemplate,
  crawlRanchBaseAssessment,
  ductlessRanchBaseAssessment,
  garageOneStoryBaseAssessment,
  getTemplate,
  ranchBaseAssessment,
  sanityBandCheck,
  twoStoryBaseAssessment,
  twoSystemTwoStoryBaseAssessment,
} from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const outDir = resolve(repo, "packages/calc/fixtures");
mkdirSync(outDir, { recursive: true });

const ENGINE_VERSION = "0.3.0";

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

/** Expected block from a committed oracle run, or null when none is recorded yet (QA-002). */
function expectedFrom(runs, input, name) {
  const runPath = resolve(repo, `${runs}/${name}/results_annual.json`);
  const load = existsSync(runPath) ? JSON.parse(readFileSync(runPath, "utf8"))["HVAC Design Load"] : null;
  if (!load) {
    console.log(`  ${name}: no committed oracle run at ${runs}/${name}; expected left null until one is recorded`);
    return null;
  }
  return {
    source: `OpenStudio-HPXML v1.12.0 (OpenStudio 3.11.0+241b8abb4d) design-only run of ${input}/${name}.xml, committed at ${runs}/${name}/results_annual.json (HVAC Design Load totals, rounded to 1 Btu/h by the oracle)`,
    tolerance_basis: "floating_point",
    tolerance: { absolute: 5 },
    building: {
      heating_sensible: load["Heating: Total (Btu/h)"],
      cooling_sensible: load["Cooling Sensible: Total (Btu/h)"],
      cooling_latent: load["Cooling Latent: Total (Btu/h)"],
      unit: "Btu/h",
    },
  };
}

for (const h of houses) {
  const base = validateAssessment(h.base());
  if (!base.ok) {
    console.error(`${h.name}: base assessment is invalid`, base.issues);
    process.exit(1);
  }
  const template = getTemplate(h.template);
  const { assessment, applied, skipped } = applyTemplate(base.assessment, template);
  const band = sanityBandCheck(template);

  const runPath = resolve(repo, `${h.runs}/${h.name}/results_annual.json`);
  const load = existsSync(runPath) ? JSON.parse(readFileSync(runPath, "utf8"))["HVAC Design Load"] : null;
  if (!load) console.log(`  ${h.name}: no committed oracle run at ${h.runs}/${h.name}; expected left null until one is recorded`);

  const fixture = {
    fixture_version: "0.1.0",
    name: h.name,
    description: h.description,
    label: "fixture",
    input: {
      calc_input_version: "0.2.0",
      requested_engine: { name: "@rhoeflow/calc", version: ENGINE_VERSION },
      method_ids: [],
      weather: { ...DFW_WEATHER_REF },
      scenario: { id: "baseline", name: "Baseline", overrides: [] },
      assessment,
      ...(band ? { checks: { sanity_band: band } } : {}),
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

// Quick-pass houses (WO-03 D2): answers + template through RHOE.quick_pass.box_geometry.
const QP_RUNS = "claude/09-spikes/wo03-quickpass/runs";
const QP_INPUT = "claude/09-spikes/wo03-quickpass";
for (const h of QUICK_PASS_HOUSES) {
  const template = getTemplate(h.template);
  const r = buildQuickPass(h.answers, {
    template,
    template_version: null,
    assessment_id: h.assessment_id,
    created_at: QUICK_PASS_FIXTURE_TIMESTAMP,
    updated_at: QUICK_PASS_FIXTURE_TIMESTAMP,
    workedge: { team_id: "we_team_fixture", project_id: h.project_id, property_id: h.property_id },
  });
  if (!r.assessment) {
    console.error(`${h.name}: quick pass did not build`, r.issues);
    process.exit(1);
  }
  for (const i of r.issues) console.log(`  ${h.name} ${i.severity}: ${i.code} ${i.message}`);
  const band = sanityBandCheck(template);
  const fixture = {
    fixture_version: "0.1.0",
    name: h.name,
    description: h.description,
    label: "fixture",
    input: {
      calc_input_version: "0.2.0",
      requested_engine: { name: "@rhoeflow/calc", version: ENGINE_VERSION },
      method_ids: [],
      weather: { ...DFW_WEATHER_REF },
      scenario: { id: "baseline", name: "Baseline", overrides: [] },
      assessment: r.assessment,
      ...(band ? { checks: { sanity_band: band } } : {}),
    },
    expected: expectedFrom(QP_RUNS, QP_INPUT, h.name),
  };
  const outFile = resolve(outDir, `${h.name}.fixture.json`);
  writeFileSync(outFile, JSON.stringify(fixture, null, 2) + "\n");
  console.log(`wrote ${outFile}`);
}

// Sensitivity cases (WO-03 E4; QA-005): one input changed per case, expectations in
// packages/templates/src/fixtures/sensitivity.ts and claude/06-architecture/sensitivity-cases.md.
const SENS_RUNS = "claude/09-spikes/wo03-sensitivity/runs";
const SENS_INPUT = "claude/09-spikes/wo03-sensitivity";
const SENS_SOURCE = "sensitivity case (WO-03 E4, QA-005)";
const qpBase = QUICK_PASS_HOUSES[0];
for (const c of SENSITIVITY_CASES) {
  let assessment;
  let band = null;
  if (c.base === "qp") {
    const template = getTemplate(qpBase.template);
    const r = buildQuickPass({ ...SENSITIVITY_BASE_ANSWERS, ...(c.answers ?? {}) }, {
      template,
      template_version: null,
      assessment_id: qpBase.assessment_id,
      created_at: QUICK_PASS_FIXTURE_TIMESTAMP,
      updated_at: QUICK_PASS_FIXTURE_TIMESTAMP,
      workedge: { team_id: "we_team_fixture", project_id: qpBase.project_id, property_id: qpBase.property_id },
    });
    if (!r.assessment) {
      console.error(`${c.name}: quick pass did not build`, r.issues);
      process.exit(1);
    }
    assessment = r.assessment;
    band = sanityBandCheck(template);
  } else {
    const base = validateAssessment(ranchBaseAssessment());
    if (!base.ok) {
      console.error(`${c.name}: base assessment is invalid`, base.issues);
      process.exit(1);
    }
    const template = getTemplate("dfw-pre1980-ranch-slab");
    assessment = JSON.parse(JSON.stringify(applyTemplate(base.assessment, template).assessment));
    band = sanityBandCheck(template);
  }
  if (c.rotate_degrees) {
    const enc = assessment.building.enclosure;
    const rotate = (q, what) => {
      q.value = (q.value + c.rotate_degrees) % 360;
      q.state = "assumed";
      q.source = `${SENS_SOURCE}: ${what} rotated ${c.rotate_degrees} degrees from the R01 ranch`;
    };
    rotate(assessment.building.site.azimuth_of_front_of_home, "front of home");
    for (const k of ["walls", "windows", "doors"]) for (const x of enc[k] ?? []) if (x.azimuth) rotate(x.azimuth, k.slice(0, -1));
  }
  if (c.design) {
    const q = assessment.building.systems.hvac.hvac_sizing_control.manualj_inputs[c.design.field];
    const from = q.value;
    q.value = Math.round((from + c.design.delta_f) * 100) / 100;
    q.state = "assumed";
    q.source = `${SENS_SOURCE}: ${c.design.field} ${from} F ${c.design.delta_f > 0 ? "+" : ""}${c.design.delta_f} F (weather library value moved on purpose)`;
  }
  const checked = validateAssessment(assessment);
  if (!checked.ok) {
    console.error(`${c.name}: assessment is invalid`, checked.issues);
    process.exit(1);
  }
  const fixture = {
    fixture_version: "0.1.0",
    name: c.name,
    description: c.description,
    label: "fixture",
    input: {
      calc_input_version: "0.2.0",
      requested_engine: { name: "@rhoeflow/calc", version: ENGINE_VERSION },
      method_ids: [],
      weather: { ...DFW_WEATHER_REF },
      scenario: { id: "baseline", name: "Baseline", overrides: [] },
      assessment: checked.assessment,
      ...(band ? { checks: { sanity_band: band } } : {}),
    },
    expected: expectedFrom(SENS_RUNS, SENS_INPUT, c.name),
  };
  const outFile = resolve(outDir, `${c.name}.fixture.json`);
  writeFileSync(outFile, JSON.stringify(fixture, null, 2) + "\n");
  console.log(`wrote ${outFile}`);
}
