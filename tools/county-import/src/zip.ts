import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";

/**
 * Zip members through the system's unzip (on every GitHub runner), streamed so a 14 GB member
 * never sits in memory or on disk. The files are Latin-1.
 */
export function zipMembers(zip: string): string[] {
  return execFileSync("unzip", ["-Z1", zip], { encoding: "latin1", maxBuffer: 16 * 1024 * 1024 })
    .split(/\r?\n/)
    .filter((n) => n !== "" && !n.endsWith("/"));
}

/**
 * The one member named `name` ("ACCOUNT_INFO.CSV"), or, for a name starting with "_", the one whose
 * name ends with it ("_APPRAISAL_INFO.TXT"). Case is ignored; an error when none or several match.
 */
export function findMember(members: string[], name: string): string {
  const n = name.toUpperCase();
  const hits = members.filter((m) => {
    const base = m.toUpperCase().split("/").pop()!;
    return n.startsWith("_") ? base.endsWith(n) : base === n;
  });
  if (hits.length !== 1) throw new Error(`expected one ${name} in the zip, found ${hits.length}`);
  return hits[0]!;
}

function unzipStream(zip: string, member: string): NodeJS.ReadableStream {
  const child = spawn("unzip", ["-p", zip, member], { stdio: ["ignore", "pipe", "inherit"] });
  child.on("exit", (code) => {
    if (code !== 0) child.stdout.destroy(new Error(`unzip exited ${code} reading ${member}`));
  });
  child.stdout.setEncoding("latin1");
  return child.stdout;
}

/** A member's text in chunks. */
export async function* memberChunks(zip: string, member: string): AsyncGenerator<string> {
  for await (const chunk of unzipStream(zip, member)) yield chunk as string;
}

/** A member's lines, without line breaks. */
export async function* memberLines(zip: string, member: string): AsyncGenerator<string> {
  const rl = createInterface({ input: unzipStream(zip, member), crlfDelay: Infinity });
  for await (const line of rl) yield line;
}
