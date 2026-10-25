/**
 * Shared runner for the pinned OpenStudio-HPXML oracle (ADR-004, ADR-006).
 * Environment: OPENSTUDIO_EXE and OPENSTUDIO_HPXML_DIR, defaulting to the dev-machine paths in pin.json.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const pin = JSON.parse(readFileSync(join(here, "pin.json"), "utf8"));

export function oracleEnv() {
  const exe = process.env.OPENSTUDIO_EXE ?? pin.local_paths_dev_machine.OPENSTUDIO_EXE;
  const hpxmlDir = process.env.OPENSTUDIO_HPXML_DIR ?? pin.local_paths_dev_machine.OPENSTUDIO_HPXML_DIR;
  if (!existsSync(exe)) throw new Error(`OpenStudio not found at ${exe} (set OPENSTUDIO_EXE)`);
  const runner = join(hpxmlDir, "workflow", "run_simulation.rb");
  if (!existsSync(runner)) throw new Error(`OpenStudio-HPXML workflow not found at ${runner} (set OPENSTUDIO_HPXML_DIR)`);
  const version = spawnSync(exe, ["--version"], { encoding: "utf8" }).stdout.trim();
  if (version !== pin.openstudio.version) throw new Error(`OpenStudio version ${version} does not match pin ${pin.openstudio.version}`);
  const versionRb = readFileSync(join(hpxmlDir, "HPXMLtoOpenStudio", "resources", "version.rb"), "utf8");
  const hpxmlVersion = /Version = '([^']+)'/.exec(versionRb)?.[1];
  if (hpxmlVersion && `v${hpxmlVersion}` !== pin.openstudio_hpxml.version) {
    throw new Error(`OpenStudio-HPXML version v${hpxmlVersion} does not match pin ${pin.openstudio_hpxml.version}`);
  }
  return { exe, hpxmlDir, runner, version, hpxmlVersion: hpxmlVersion ? `v${hpxmlVersion}` : "unknown" };
}

/**
 * Run design-only on an HPXML file. Returns the exit status and the output paths.
 * Refuses output paths that would cross the Windows 260-character limit: Ruby fails to open
 * results files there with a misleading "No such file" error (seen in WO-02 Track C).
 */
export function runDesignOnly(xml, outDir, { quiet = false } = {}) {
  const env = oracleEnv();
  const out = resolve(outDir);
  const longest = join(out, "run", "results_design_load_details.json");
  if (process.platform === "win32" && longest.length >= 250) {
    throw new Error(`output path is ${longest.length} characters; keep it under 250 on Windows: ${longest}`);
  }
  const args = [env.runner, "-x", resolve(xml), "-o", out, pin.openstudio_hpxml.design_only_flag, "--output-format", "json"];
  const started = Date.now();
  const r = spawnSync(env.exe, args, { cwd: env.hpxmlDir, stdio: quiet ? "pipe" : "inherit", encoding: "utf8" });
  const errorLines = `${r.stdout ?? ""}\n${r.stderr ?? ""}`
    .split(/\r?\n/)
    .filter((l) => /Error|error:|does not exist/.test(l) && !/^\s+(eval|<internal)/.test(l));
  // The oracle writes validation errors to run/run.log rather than to the console.
  if ((r.status ?? 1) !== 0 && errorLines.length === 0 && existsSync(join(out, "run", "run.log"))) {
    for (const l of readFileSync(join(out, "run", "run.log"), "utf8").split(/\r?\n/)) if (/^Error/.test(l)) errorLines.push(l);
  }
  return {
    status: r.status ?? 1,
    error: (r.status ?? 1) === 0 ? null : errorLines.slice(0, 3).join(" | ") || "no error text captured",
    elapsedS: (Date.now() - started) / 1000,
    runDir: join(out, "run"),
    command: `${env.exe} ${args.join(" ")}`,
    env,
  };
}
