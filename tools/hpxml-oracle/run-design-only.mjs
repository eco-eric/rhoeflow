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
import { runDesignOnly } from "./oracle.mjs";

const [xml, outDir] = process.argv.slice(2);
if (!xml || !outDir) {
  console.error("usage: run-design-only.mjs <file.xml> <out-dir>");
  process.exit(2);
}
try {
  const r = runDesignOnly(xml, outDir);
  console.log(r.command);
  console.log(`exit=${r.status} elapsed=${r.elapsedS.toFixed(1)}s outputs=${r.runDir}`);
  process.exit(r.status);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(2);
}
