#!/usr/bin/env node
/**
 * rhoe-calc: the engine's command line (plan §Tech stack: "a CLI that takes a JSON
 * assessment"). The only file in this package that touches Node APIs.
 *
 *   rhoe-calc validate <fixture.json | dir>    validate fixture + input, refuse unaccepted fields
 *   rhoe-calc run <fixture.json> [--out f]     run the engine, write CalcOutput JSON
 *   rhoe-calc roundtrip <fixture.json | dir>   validate, run, re-validate output, check echo
 *
 * Exit code 0 on success, 1 on validation or round-trip failure, 2 on usage error.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CalcFixtureSchema } from "./fixture.js";
import { prepareInput, runCalculation } from "./engine.js";
import { CalcOutputSchema } from "./contracts.js";
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

async function main(argv: string[]): Promise<number> {
  const [command, target, ...rest] = argv;
  if (!command || !target) usage();
  const outFlag = rest.indexOf("--out");
  const outFile = outFlag >= 0 ? rest[outFlag + 1] : undefined;

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

    const output = await runCalculation(loaded.input);
    if (command === "run") {
      const text = JSON.stringify(output, null, 2);
      if (outFile) writeFileSync(outFile, text + "\n");
      else process.stdout.write(text + "\n");
      continue;
    }

    if (command === "roundtrip") {
      const reparsed = CalcOutputSchema.safeParse(JSON.parse(JSON.stringify(output)));
      const echoMatches = canonicalJson(output.frozen_input) === canonicalJson(loaded.input);
      if (!reparsed.success || !echoMatches) {
        failures++;
        process.stdout.write(`FAIL  ${file}\n`);
        if (!reparsed.success) for (const i of reparsed.error.issues) process.stdout.write(`      output.${i.path.map(String).join(".")}: ${i.message}\n`);
        if (!echoMatches) process.stdout.write("      frozen_input does not echo the validated input\n");
        continue;
      }
      process.stdout.write(
        `ok    ${file}  (${loaded.fixture.name}) status=${output.status} input_hash=${output.manifest.input_hash.slice(0, 23)}…\n`,
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
