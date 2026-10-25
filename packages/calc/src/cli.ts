#!/usr/bin/env node
/**
 * rhoe-calc: the engine's command line (plan §Tech stack: "a CLI that takes a JSON
 * assessment"). The only file in this package that touches Node APIs.
 *
 *   rhoe-calc validate <fixture.json | dir>    validate fixture + input, refuse unaccepted fields
 *   rhoe-calc run <fixture.json> [--out f]     run the engine, write CalcOutput JSON
 *   rhoe-calc roundtrip <fixture.json | dir>   validate, run, re-validate output, check echo,
 *                                              and compare against the fixture's `expected` block
 *
 * Options: --engine-version 0.0.1 runs the WO-01 contract-only engine (WO-02 §8 rollback).
 *
 * Exit code 0 on success, 1 on validation, round-trip or expected-result failure, 2 on usage error.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CalcFixtureSchema } from "./fixture.js";
import { prepareInput, runCalculation } from "./engine.js";
import { CalcOutputSchema, CONTRACT_ONLY_ENGINE_VERSION, ENGINE_VERSION, type CalcOutput } from "./contracts.js";
import type { CalcFixture } from "./fixture.js";
import { canonicalJson } from "./canonical.js";

function usage(): never {
  process.stderr.write("usage: rhoe-calc <validate|run|roundtrip> <file-or-dir> [--out file]\n");
  process.exit(2);
}

function listFixtures(target: string): string[] {
  const abs = resolve(target);
  if (statSync(abs).isDirectory()) {
    return readdirSync(abs)
      .filter((f) => f.endsWith(".fixture.json"))
      .sort()
      .map((f) => join(abs, f));
  }
  return [abs];
}

function loadFixture(file: string) {
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  const parsed = CalcFixtureSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, issues: parsed.error.issues.map((i) => `${i.path.map(String).join(".")}: ${i.message}`) };
  }
  const prepared = prepareInput(parsed.data.input);
  if (!prepared.ok) {
    return { ok: false as const, issues: prepared.issues.map((i) => `${i.path}: ${i.message}`) };
  }
  return { ok: true as const, fixture: parsed.data, input: prepared.input };
}

/** Differential check against the fixture's independent expected result (QA-002, gate G1). */
function compareExpected(output: CalcOutput, fixture: CalcFixture): string[] {
  const issues: string[] = [];
  if (output.status !== "ok") {
    issues.push(`status=${output.status}: ${output.errors.map((e) => `${e.code} ${e.message}`).join("; ")}`);
    return issues;
  }
  const exp = fixture.expected;
  if (!exp) return issues;
  const got = output.results.building!;
  for (const key of ["heating_sensible", "cooling_sensible", "cooling_latent"] as const) {
    const diff = got[key] - exp.building[key];
    const abs = exp.tolerance.absolute;
    const rel = exp.tolerance.relative;
    const within = (abs !== undefined && Math.abs(diff) <= abs) || (rel !== undefined && Math.abs(diff) <= rel * Math.abs(exp.building[key]));
    if (!within) {
      issues.push(`${key}: got ${got[key].toFixed(1)}, expected ${exp.building[key]} (${exp.tolerance_basis} tolerance abs ${abs ?? "-"} rel ${rel ?? "-"}), diff ${diff.toFixed(1)}`);
    }
  }
  return issues;
}

async function main(argv: string[]): Promise<number> {
  const [command, target, ...rest] = argv;
  if (!command || !target) usage();
  const outFlag = rest.indexOf("--out");
  const outFile = outFlag >= 0 ? rest[outFlag + 1] : undefined;
  const evFlag = rest.indexOf("--engine-version");
  const engineVersionArg = evFlag >= 0 ? rest[evFlag + 1] : ENGINE_VERSION;
  if (engineVersionArg !== ENGINE_VERSION && engineVersionArg !== CONTRACT_ONLY_ENGINE_VERSION) {
    process.stderr.write(`rhoe-calc: --engine-version must be ${ENGINE_VERSION} or ${CONTRACT_ONLY_ENGINE_VERSION}\n`);
    process.exit(2);
  }
  const engineVersion = engineVersionArg;

  const files = listFixtures(target);
  if (files.length === 0) {
    process.stdout.write(`FAIL  no *.fixture.json files under ${resolve(target)} (a vacuous pass is not a pass)\n`);
    return 1;
  }

  let failures = 0;
  for (const file of files) {
    const loaded = loadFixture(file);
    if (!loaded.ok) {
      failures++;
      process.stdout.write(`FAIL  ${file}\n`);
      for (const issue of loaded.issues) process.stdout.write(`      ${issue}\n`);
      continue;
    }
    if (command === "validate") {
      process.stdout.write(`ok    ${file}  (${loaded.fixture.name})\n`);
      continue;
    }

    const output = await runCalculation(loaded.input, { engineVersion });
    if (command === "run") {
      const text = JSON.stringify(output, null, 2);
      if (outFile) writeFileSync(outFile, text + "\n");
      else process.stdout.write(text + "\n");
      continue;
    }

    if (command === "roundtrip") {
      const reparsed = CalcOutputSchema.safeParse(JSON.parse(JSON.stringify(output)));
      const echoMatches = canonicalJson(output.frozen_input) === canonicalJson(loaded.input);
      const expectedIssues = engineVersion === ENGINE_VERSION ? compareExpected(output, loaded.fixture) : [];
      if (!reparsed.success || !echoMatches || expectedIssues.length > 0) {
        failures++;
        process.stdout.write(`FAIL  ${file}\n`);
        if (!reparsed.success) for (const i of reparsed.error.issues) process.stdout.write(`      output.${i.path.map(String).join(".")}: ${i.message}\n`);
        if (!echoMatches) process.stdout.write("      frozen_input does not echo the validated input\n");
        for (const issue of expectedIssues) process.stdout.write(`      ${issue}\n`);
        continue;
      }
      const b = output.results.building;
      const summary = b
        ? ` heating=${Math.round(b.heating_sensible)} cooling_sensible=${Math.round(b.cooling_sensible)} cooling_latent=${Math.round(b.cooling_latent)}${loaded.fixture.expected ? " (matches expected)" : ""}`
        : "";
      process.stdout.write(
        `ok    ${file}  (${loaded.fixture.name}) engine=${output.manifest.engine.version} status=${output.status}${summary} input_hash=${output.manifest.input_hash.slice(0, 23)}…\n`,
      );
      continue;
    }
    usage();
  }
  return failures === 0 ? 0 : 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`rhoe-calc: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
