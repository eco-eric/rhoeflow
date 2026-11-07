#!/usr/bin/env node
/**
 * rhoe-county-import <dallas|tarrant> <zip> --out <rows.csv> [--roll-year <year>] [--stats <stats.json>] [--min-rows <n>]
 *
 * Reads a county appraisal district's download and writes the rows for rhoe.county_property as a
 * Postgres CSV (load.sql loads it). Prints counts only: the repository is public, so the log
 * names no address (ADR-048). --min-rows guards against a file whose layout changed (most rows
 * would then be skipped). Exit 0 when enough rows were written, 1 when not, 2 on usage error.
 */
import { createWriteStream, writeFileSync } from "node:fs";
import { once } from "node:events";
import { csvRows } from "./csv.js";
import { DALLAS_FILES, readDallas } from "./dallas.js";
import { csvHeader, csvLine, Stats, toRow, type CountyFacts } from "./row.js";
import { TARRANT_FILES, readTarrant } from "./tarrant.js";
import { findMember, memberChunks, memberLines, zipMembers } from "./zip.js";

function usage(msg: string): never {
  process.stderr.write(`${msg}\nusage: rhoe-county-import <dallas|tarrant> <zip> --out <rows.csv> [--roll-year <year>] [--stats <stats.json>] [--min-rows <n>]\n`);
  process.exit(2);
}

const args = process.argv.slice(2);
const county = args[0];
const zip = args[1];
if (county !== "dallas" && county !== "tarrant") usage("county must be dallas or tarrant");
if (!zip) usage("no zip given");
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const outPath = opt("--out") ?? usage("no --out given");
const statsPath = opt("--stats");
const yearArg = opt("--roll-year");
const roll_year = yearArg ? Number(yearArg) : undefined;
const minRows = Number(opt("--min-rows") ?? "1");
if (!Number.isInteger(minRows) || minRows < 1) usage("--min-rows must be a whole number of 1 or more");
if (roll_year !== undefined && !(Number.isInteger(roll_year) && roll_year >= 1990 && roll_year <= 2100)) usage("--roll-year must be a year");

const stats = new Stats();
const onSkip = (reason: string) => stats.skip(reason);
const members = zipMembers(zip);
const yearOpt = roll_year === undefined ? {} : { roll_year };

let facts: AsyncIterable<CountyFacts>;
if (county === "dallas") {
  facts = readDallas(
    {
      accounts: csvRows(memberChunks(zip, findMember(members, DALLAS_FILES.accounts))),
      detail: csvRows(memberChunks(zip, findMember(members, DALLAS_FILES.detail))),
      addl: csvRows(memberChunks(zip, findMember(members, DALLAS_FILES.addl))),
    },
    { ...yearOpt, onSkip },
  );
} else {
  facts = readTarrant(
    {
      detail: memberLines(zip, findMember(members, TARRANT_FILES.detail)),
      attr: memberLines(zip, findMember(members, TARRANT_FILES.attr)),
      info: memberLines(zip, findMember(members, TARRANT_FILES.info)),
    },
    { ...yearOpt, onSkip },
  );
}

const out = createWriteStream(outPath, { encoding: "utf8" });
const write = async (s: string) => {
  if (!out.write(s)) await once(out, "drain");
};
await write(csvHeader());
for await (const f of facts) {
  const r = toRow(f);
  if ("skip" in r) {
    stats.skip(r.skip);
    continue;
  }
  stats.add(r.row);
  await write(csvLine(r.row));
}
out.end();
await once(out, "finish");

const summary = { county, ...stats.toJSON() };
const text = JSON.stringify(summary, null, 2);
process.stdout.write(text + "\n");
if (statsPath) writeFileSync(statsPath, text + "\n");
if (stats.rows < minRows) {
  process.stderr.write(`only ${stats.rows} rows; expected at least ${minRows}. Has the file's layout changed?\n`);
  process.exit(1);
}
if (stats.roll_years.size !== 1) {
  process.stderr.write(`expected one roll year in the file, found ${stats.roll_years.size}\n`);
  process.exit(1);
}
process.exit(0);
