/**
 * Artifact bundle for a frozen run (ENG-008; WO-02 Track C, item C5; plan §Frozen runs).
 * Node-only (it writes files), so it lives beside the CLI and outside the engine core.
 *
 * Layout of <dir>:
 *   frozen-input.json            the exact CalcInput the run consumed (pretty-printed)
 *   frozen-input.canonical.json  canonical JSON; its SHA-256 is the run's input_hash
 *   output.json                  the CalcOutput
 *   building.xml               the Assessment serialized for the oracle, when it serializes
 *   hpxml-error.txt              why it did not serialize, when it did not
 *   manifest.json                run id, engine, input hash, and SHA-256 + size of every file
 *
 * The reference-mode tool (tools/hpxml-oracle/check-fixtures.mjs) adds the oracle's outputs
 * under oracle/ and re-writes the manifest.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { assessmentToHpxml } from "@rhoeflow/hpxml";
import { canonicalJson } from "./canonical.js";
import type { CalcInput, CalcOutput } from "./contracts.js";
import { resolveWeatherStation } from "./weather/library.js";

export const BUNDLE_VERSION = "0.1.0" as const;

export interface BundleManifest {
  bundle_version: typeof BUNDLE_VERSION;
  run_id: string;
  created_at: string;
  engine: { name: string; version: string };
  status: string;
  input_hash: string;
  files: { path: string; sha256: string; bytes: number }[];
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function listFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, base));
    else if (name !== "manifest.json") out.push(relative(base, p).replace(/\\/g, "/"));
  }
  return out;
}

/** (Re)write manifest.json over every file currently in the bundle. */
export function writeManifest(dir: string, output: CalcOutput): BundleManifest {
  const manifest: BundleManifest = {
    bundle_version: BUNDLE_VERSION,
    run_id: output.manifest.run_id,
    created_at: output.manifest.created_at,
    engine: output.manifest.engine,
    status: output.status,
    input_hash: output.manifest.input_hash,
    files: listFiles(dir).map((p) => ({ path: p, sha256: sha256File(join(dir, p)), bytes: statSync(join(dir, p)).size })),
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

export function writeBundle(dir: string, input: CalcInput, output: CalcOutput): BundleManifest {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "frozen-input.json"), JSON.stringify(input, null, 2) + "\n");
  writeFileSync(join(dir, "frozen-input.canonical.json"), canonicalJson(input));
  writeFileSync(join(dir, "output.json"), JSON.stringify(output, null, 2) + "\n");
  try {
    const station = resolveWeatherStation(input.weather);
    writeFileSync(join(dir, "building.xml"), assessmentToHpxml(input.assessment, { epwFile: station.epwFile, stateCode: station.state }));
  } catch (e) {
    writeFileSync(join(dir, "hpxml-error.txt"), `${e instanceof Error ? e.message : String(e)}\n`);
  }
  return writeManifest(dir, output);
}
