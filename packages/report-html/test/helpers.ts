import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CalcFixtureSchema, prepareInput, runCalculation, type CalcOutput } from "@rhoeflow/calc";
import { buildReport, type PrintedNumber, type ReportModel } from "@rhoeflow/report";

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
