/**
 * Artifact bundle for a frozen run, built in memory (ENG-008; plan §Frozen runs). Pure: no
 * Node imports, so the same bundle is written to a directory by the CLI (`bundle.ts`) and to
 * object storage by the server (`@rhoeflow/store`, WO-03 C3). Both copies hash identically.
 *
 * Files:
 *   frozen-input.json            the exact CalcInput the run consumed (pretty-printed)
 *   frozen-input.canonical.json  canonical JSON; its SHA-256 is the run's input_hash
 *   output.json                  the CalcOutput
 *   building.xml                 the Assessment serialized for the oracle, when it serializes
 *   hpxml-error.txt              why it did not serialize, when it did not
 *   manifest.json                run id, engine, input hash, and SHA-256 + size of every file
 */
import { assessmentToHpxml } from "@rhoeflow/hpxml";
import { canonicalJson, sha256Hex } from "./canonical.js";
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

export interface BundleFile {
  path: string;
  content_type: string;
  bytes: Uint8Array;
}

export interface Bundle {
  files: BundleFile[];
  manifest: BundleManifest;
}

const enc = new TextEncoder();

function text(path: string, content_type: string, s: string): BundleFile {
  return { path, content_type, bytes: enc.encode(s) };
}

/** Hash and size every file, sorted by path, and return the manifest (manifest.json itself excluded). */
export async function manifestFor(files: BundleFile[], output: CalcOutput): Promise<BundleManifest> {
  const listed = files.filter((f) => f.path !== "manifest.json").sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    bundle_version: BUNDLE_VERSION,
    run_id: output.manifest.run_id,
    created_at: output.manifest.created_at,
    engine: output.manifest.engine,
    status: output.status,
    input_hash: output.manifest.input_hash,
    files: await Promise.all(listed.map(async (f) => ({ path: f.path, sha256: await sha256Hex(f.bytes), bytes: f.bytes.byteLength }))),
  };
}

export function manifestFile(manifest: BundleManifest): BundleFile {
  return text("manifest.json", "application/json", JSON.stringify(manifest, null, 2) + "\n");
}

/** Build the bundle. `files` includes manifest.json last. */
export async function buildBundle(input: CalcInput, output: CalcOutput): Promise<Bundle> {
  const files: BundleFile[] = [
    text("frozen-input.json", "application/json", JSON.stringify(input, null, 2) + "\n"),
    text("frozen-input.canonical.json", "application/json", canonicalJson(input)),
    text("output.json", "application/json", JSON.stringify(output, null, 2) + "\n"),
  ];
  try {
    const station = resolveWeatherStation(input.weather);
    files.push(text("building.xml", "application/xml", assessmentToHpxml(input.assessment, { epwFile: station.epwFile, stateCode: station.state })));
  } catch (e) {
    files.push(text("hpxml-error.txt", "text/plain", `${e instanceof Error ? e.message : String(e)}\n`));
  }
  const manifest = await manifestFor(files, output);
  files.push(manifestFile(manifest));
  return { files, manifest };
}
