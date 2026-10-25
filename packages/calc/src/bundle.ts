/**
 * Artifact bundle written to a directory (ENG-008; WO-02 Track C, item C5). Node-only (it
 * writes files), so it lives beside the CLI and outside the engine core. The bundle itself is
 * built by `bundle-core.ts`, which the server shares (WO-03 C3).
 *
 * The reference-mode tool (tools/hpxml-oracle/check-fixtures.mjs) adds the oracle's outputs
 * under oracle/ and re-writes the manifest with `writeManifest`.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { BUNDLE_VERSION, buildBundle, type BundleManifest } from "./bundle-core.js";
import type { CalcInput, CalcOutput } from "./contracts.js";

export { BUNDLE_VERSION, type BundleManifest };

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

/** (Re)write manifest.json over every file currently in the bundle directory. */
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

/** Build the bundle and write every file under `dir`. */
export async function writeBundle(dir: string, input: CalcInput, output: CalcOutput): Promise<BundleManifest> {
  const bundle = await buildBundle(input, output);
  mkdirSync(dir, { recursive: true });
  for (const f of bundle.files) {
    mkdirSync(dirname(join(dir, f.path)), { recursive: true });
    writeFileSync(join(dir, f.path), f.bytes);
  }
  return bundle.manifest;
}
