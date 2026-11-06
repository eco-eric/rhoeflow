import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CalcFixtureSchema, prepareInput, runCalculation, type CalcOutput } from "@rhoeflow/calc";
import { buildReport, type PrintedNumber, type ReportModel } from "@rhoeflow/report";
import { deflateSync } from "node:zlib";
import { NAIP, type ReportSatellite } from "../src/index.js";

/** The engine's committed fixtures, run fresh, as the report tests in packages/report do. */
export const FIXTURE_DIR = resolve(import.meta.dirname, "../../calc/fixtures");
export const FIXTURES = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".fixture.json"));

export async function outputFor(file: string): Promise<CalcOutput> {
  const fx = CalcFixtureSchema.parse(JSON.parse(readFileSync(resolve(FIXTURE_DIR, file), "utf8")));
  const p = prepareInput(fx.input);
  if (!p.ok) throw new Error(`${file} should prepare`);
  return runCalculation(p.input, { run_id: "6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b", now: () => new Date("2026-10-26T12:00:00Z") });
}

/** The report model for a fixture run, built from a JSON round trip of the output, as a stored run is. */
export async function modelFor(file: string, extra: { property_label?: { text: string; source: string } } = {}): Promise<{ out: CalcOutput; model: ReportModel }> {
  const out = await outputFor(file);
  const model = buildReport({
    run: { run_id: out.manifest.run_id, assessment_id: out.frozen_input.assessment.assessment_id, revision: 1, status: "ok", stale: false, stale_reason: null },
    output: JSON.parse(JSON.stringify(out)),
    ...extra,
  });
  return { out, model };
}

/** Every printed number in a report model, with where it sits. */
export function* printedNumbers(x: unknown, path = ""): Generator<{ path: string; n: PrintedNumber }> {
  if (Array.isArray(x)) {
    for (let i = 0; i < x.length; i++) yield* printedNumbers(x[i], `${path}[${i}]`);
    return;
  }
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    if (typeof o["raw"] === "number" && typeof o["rule"] === "string" && typeof o["text"] === "string") {
      yield { path, n: o as unknown as PrintedNumber };
      return;
    }
    for (const [k, v] of Object.entries(o)) yield* printedNumbers(v, path ? `${path}.${k}` : k);
  }
}

export interface MarkupNumber {
  raw: number;
  rule: string;
  text: string;
  unit: string | null;
}

const UNESCAPE: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|#39);/g, (m) => UNESCAPE[m]!);

/** The printed numbers in report markup, in document order (`<span class="num" data-raw data-rule>`). */
export function markupNumbers(markup: string): MarkupNumber[] {
  const re = /<span class="num" data-raw="([^"]*)" data-rule="([^"]*)">([^<]*)(?:<span class="unit"> ([^<]*)<\/span>)?<\/span>/g;
  return [...markup.matchAll(re)].map((m) => ({ raw: Number(unescape(m[1]!)), rule: unescape(m[2]!), text: unescape(m[3]!), unit: m[4] === undefined ? null : unescape(m[4]) }));
}

/** Text compared between the page and the PDF: Unicode-compatibility form, no whitespace, no list bullets. */
export function comparable(s: string): string {
  return s.normalize("NFKC").replace(/[\s ­​•]/g, "");
}

/**
 * A 64×64 PNG of noise, standing in for the aerial image. Not 1×1: Chrome prints a one-pixel image
 * as a filled square, not an image, and it must be big enough to pass as a real picture.
 */
export const STAND_IN_PNG: Uint8Array = (() => {
  const w = 64;
  const raw = Buffer.alloc((w * 3 + 1) * w);
  let seed = 7;
  for (let y = 0; y < w; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let i = 1; i <= w * 3; i++) raw[y * (w * 3 + 1) + i] = (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24;
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(w, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
})();

/** A satellite view with the stand-in image, for layout checks without the network. */
export function fakeSatellite(): ReportSatellite {
  return { data_url: `data:image/png;base64,${Buffer.from(STAND_IN_PNG).toString("base64")}`, credit: NAIP.credit };
}
