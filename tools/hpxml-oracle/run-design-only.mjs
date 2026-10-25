#!/usr/bin/env node
/**
 * Run OpenStudio-HPXML design-only (Manual J loads + autosizing, no EnergyPlus) on an HPXML
 * file, using the pinned engine (tools/hpxml-oracle/pin.json). Reproduces the R01 commands.
 *
 *   node tools/hpxml-oracle/run-design-only.mjs <file.xml> <out-dir>
 *
 * Environment (defaults from pin.json "local_paths_dev_machine"):
 *   OPENSTUDIO_EXE        path to openstudio(.exe)
 *   OPENSTUDIO_HPXML_DIR  path to the extracted OpenStudio-HPXML release
 *
 * Exits non-zero if the engine fails or if its version does not match the pin.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pin = JSON.parse(readFileSync(join(here, "pin.json"), "utf8"));
const [xml, outDir] = process.argv.slice(2);
if (!xml || !outDir) {
  console.error("usage: run-design-only.mjs <file.xml> <out-dir>");
  process.exit(2);
}
const exe = process.env.OPENSTUDIO_EXE ?? pin.local_paths_dev_machine.OPENSTUDIO_EXE;
const hpxmlDir = process.env.OPENSTUDIO_HPXML_DIR ?? pin.local_paths_dev_machine.OPENSTUDIO_HPXML_DIR;
if (!existsSync(exe)) {
  console.error(`OpenStudio not found at ${exe} (set OPENSTUDIO_EXE)`);
  process.exit(2);
}
const runner = join(hpxmlDir, "workflow", "run_simulation.rb");
if (!existsSync(runner)) {
  console.error(`OpenStudio-HPXML workflow not found at ${runner} (set OPENSTUDIO_HPXML_DIR)`);
  process.exit(2);
}

const version = spawnSync(exe, ["--version"], { encoding: "utf8" }).stdout.trim();
if (version !== pin.openstudio.version) {
  console.error(`OpenStudio version ${version} does not match pin ${pin.openstudio.version}`);
  process.exit(1);
}
const hpxmlVersion = /Version = '([^']+)'/.exec(readFileSync(join(hpxmlDir, "HPXMLtoOpenStudio", "resources", "version.rb"), "utf8"))?.[1];
if (hpxmlVersion && `v${hpxmlVersion}` !== pin.openstudio_hpxml.version) {
  console.error(`OpenStudio-HPXML version v${hpxmlVersion} does not match pin ${pin.openstudio_hpxml.version}`);
  process.exit(1);
}

const args = [runner, "-x", resolve(xml), "-o", resolve(outDir), pin.openstudio_hpxml.design_only_flag, "--output-format", "json"];
console.log(`${exe} ${args.join(" ")}`);
const started = Date.now();
const r = spawnSync(exe, args, { cwd: hpxmlDir, stdio: "inherit" });
console.log(`exit=${r.status} elapsed=${((Date.now() - started) / 1000).toFixed(1)}s outputs=${resolve(outDir, "run")}`);
process.exit(r.status ?? 1);
