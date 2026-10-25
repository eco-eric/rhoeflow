#!/usr/bin/env node
/**
 * rhoe-provenance-lint <file-or-dir>...   Lints every *.json under the given paths.
 * Exit 0 when clean, 1 on violations or when no JSON file was found, 2 on usage error.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { countFields, lintValue } from "./lint.js";

function collectJson(target: string, acc: string[]): void {
  const abs = resolve(target);
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const name of readdirSync(abs).sort()) {
      if (name === "node_modules" || name === "dist") continue;
      collectJson(join(abs, name), acc);
    }
  } else if (abs.endsWith(".json")) {
    acc.push(abs);
  }
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  process.stderr.write("usage: rhoe-provenance-lint <file-or-dir>...\n");
  process.exit(2);
}

const files: string[] = [];
for (const t of targets) collectJson(t, files);
if (files.length === 0) {
  process.stdout.write("FAIL  no .json files found under the given paths\n");
  process.exit(1);
}

let violations = 0;
let fieldsTotal = 0;
for (const file of files) {
  const rel = relative(process.cwd(), file);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    violations++;
    process.stdout.write(`FAIL  ${rel}: not valid JSON (${e instanceof Error ? e.message : String(e)})\n`);
    continue;
  }
  const found = lintValue(data);
  const counts = countFields(data);
  fieldsTotal += counts.fields;
  if (found.length === 0) {
    process.stdout.write(`ok    ${rel}  (${counts.fields} fields, ${counts.unknown} unknown)\n`);
  } else {
    violations += found.length;
    process.stdout.write(`FAIL  ${rel}\n`);
    for (const v of found) process.stdout.write(`      ${v.rule} ${v.path}: ${v.message}\n`);
  }
}
process.stdout.write(`${files.length} files, ${fieldsTotal} provenance fields, ${violations} violations\n`);
process.exit(violations === 0 ? 0 : 1);
