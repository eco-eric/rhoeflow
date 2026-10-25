"use client";
import { useState } from "react";
import { getFieldAtPath } from "@rhoeflow/schema";
import { WINDOW_TYPES, type QuestionInfo, type QuestionKey, type QuickPassAnswers, type QuickPassResult } from "@rhoeflow/templates";

/**
 * One quick-pass question (D2, D3). It always shows what the build is using for it, with the
 * provenance state and source (PRV-001), offers the choices, an expert direct entry where the
 * map has one (ADR-027 "expert direct-entry on every question"), and the two kinds of unknown.
 * AI is off in WO-03, so this manual path is the only path (ADR-003).
 */

type Answer = { value: unknown; state: "measured" | "documented" | "assumed"; source?: string; note?: string; evidence: string[] };
type Unknown = { unknown: "didnt_inspect" | "inspected_cant_tell"; note?: string; evidence: string[] };
export type AnswerValue = Answer | Unknown | undefined;

interface Option {
  label: string;
  value: unknown;
}

interface DirectField {
  name: string;
  label: string;
  unit?: string;
  kind?: "number" | "select";
  options?: { value: string; label: string }[];
}

interface Direct {
  label: string;
  fields: DirectField[];
  build: (v: Record<string, string>) => unknown | null;
  /** State a direct entry starts in; the tech can switch measured / documented. */
  state: "measured" | "documented";
}

interface QuestionUi {
  hint?: string;
  options?: Option[];
  direct?: Direct[];
  /** Hidden when another answer makes it irrelevant. */
  show?: (a: QuickPassAnswers) => boolean;
}

const num = (s: string | undefined) => {
  const n = Number(s);
  return s !== undefined && s.trim() !== "" && Number.isFinite(n) ? n : null;
};
const given = <T,>(a: AnswerValue): T | undefined => (a && "value" in a ? (a.value as T) : undefined);

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].map((label, i) => ({ label, value: i * 45 }));

export const QUESTION_UI: Record<QuestionKey, QuestionUi> = {
  station_key: { hint: "The address comes from WorkEdge; it picks the design weather. This order covers DFW only.", options: [{ label: "DFW (722590)", value: "722590" }] },
  year_built: { hint: "Picks the era template and its defaults.", direct: [{ label: "Year", fields: [{ name: "v", label: "Year built" }], build: (v) => num(v["v"]), state: "documented" }] },
  floor_area: { hint: "Conditioned area only: no garage, porch or attic.", direct: [{ label: "Area", fields: [{ name: "v", label: "Floor area", unit: "ft²" }], build: (v) => num(v["v"]), state: "measured" }] },
  stories: { options: [1, 2, 3].map((n) => ({ label: `${n}`, value: n })) },
  garage: {
    hint: "Side as seen from the street, facing the front door.",
    options: [
      { label: "No garage", value: { cars: 0, side: "left" } },
      ...[1, 2, 3].flatMap((c) => (["left", "right"] as const).map((side) => ({ label: `${c}-car, ${side}`, value: { cars: c, side } }))),
    ],
  },
  room_over_garage: {
    options: [
      { label: "No", value: false },
      { label: "Yes", value: true },
    ],
    show: (a) => (given<number>(a.stories as AnswerValue) ?? 1) >= 2 && (given<{ cars: number }>(a.garage as AnswerValue)?.cars ?? 0) > 0,
  },
  ceiling_height: {
    options: [8, 9, 10].map((n) => ({ label: `${n} ft`, value: n })),
    direct: [{ label: "Measured", fields: [{ name: "v", label: "Height", unit: "ft" }], build: (v) => num(v["v"]), state: "measured" }],
  },
  front_azimuth: { hint: "Which way the front door faces. Use a compass app if you are unsure.", options: COMPASS },
  foundation: {
    options: [
      { label: "Slab", value: "slab" },
      { label: "Pier and beam (crawlspace)", value: "crawlspace" },
    ],
  },
  window_amount: {
    options: [
      { label: "Light", value: "light" },
      { label: "Typical", value: "typical" },
      { label: "Lots of glass", value: "lots" },
    ],
    direct: [{ label: "Measured total", fields: [{ name: "v", label: "Total window area", unit: "ft²" }], build: (v) => (num(v["v"]) ? { total_area_ft2: num(v["v"]) } : null), state: "measured" }],
  },
  window_type: {
    options: Object.entries(WINDOW_TYPES).map(([value, w]) => ({ label: w.label, value })),
    direct: [
      {
        label: "From the NFRC label",
        fields: [
          { name: "u", label: "U-factor" },
          { name: "s", label: "SHGC" },
        ],
        build: (v) => (num(v["u"]) && num(v["s"]) ? { ufactor: num(v["u"]), shgc: num(v["s"]) } : null),
        state: "documented",
      },
    ],
  },
  attic_insulation: {
    hint: "Tape in frame gives a measured depth.",
    options: [
      { label: "None", value: "none" },
      { label: "Some (about R-13)", value: "some" },
      { label: "Modern (about R-30)", value: "modern" },
      { label: "Upgraded (about R-38)", value: "upgraded" },
    ],
    direct: [
      {
        label: "Measured depth",
        fields: [
          { name: "d", label: "Depth", unit: "in" },
          {
            name: "m",
            label: "Material",
            kind: "select",
            options: [
              { value: "cellulose", label: "Cellulose" },
              { value: "fiberglass_loose", label: "Loose fiberglass" },
              { value: "fiberglass_batt", label: "Fiberglass batts" },
            ],
          },
        ],
        build: (v) => (num(v["d"]) !== null ? { depth_in: num(v["d"]), material: v["m"] || "cellulose" } : null),
        state: "measured",
      },
      { label: "Label R-value", fields: [{ name: "r", label: "Nominal R" }], build: (v) => (num(v["r"]) !== null ? { nominal_r: num(v["r"]) } : null), state: "documented" },
    ],
  },
  system: {
    options: [
      { label: "Furnace and AC", value: "furnace_ac" },
      { label: "Heat pump", value: "heat_pump" },
      { label: "Ductless mini-split", value: "ductless" },
    ],
  },
  duct_location: {
    options: [
      { label: "Attic", value: "attic" },
      { label: "Inside the house", value: "conditioned" },
      { label: "Garage", value: "garage" },
      { label: "Crawlspace", value: "crawlspace" },
    ],
    show: (a) => given<string>(a.system as AnswerValue) !== "ductless",
  },
  ducts_sealed: {
    options: [
      { label: "Not sealed", value: false },
      { label: "Sealed (mastic or tested)", value: true },
    ],
    direct: [{ label: "Duct blaster", fields: [{ name: "v", label: "Leakage to outside", unit: "CFM25" }], build: (v) => (num(v["v"]) !== null ? { leakage_to_outside_cfm25: num(v["v"]) } : null), state: "measured" }],
    show: (a) => given<string>(a.system as AnswerValue) !== "ductless",
  },
  tightness: {
    options: [
      { label: "Leaky", value: "leaky" },
      { label: "Average", value: "average" },
      { label: "Tight", value: "tight" },
    ],
    direct: [
      { label: "Blower door ACH50", fields: [{ name: "v", label: "ACH50" }], build: (v) => (num(v["v"]) ? { ach50: num(v["v"]) } : null), state: "measured" },
      { label: "Blower door CFM50", fields: [{ name: "v", label: "CFM50" }], build: (v) => (num(v["v"]) ? { cfm50: num(v["v"]) } : null), state: "measured" },
    ],
  },
  bedrooms: {
    hint: "Occupants are bedrooms + 1.",
    options: [1, 2, 3, 4, 5, 6].map((n) => ({ label: `${n}`, value: n })),
  },
};

export function isShown(key: QuestionKey, answers: QuickPassAnswers): boolean {
  return QUESTION_UI[key].show?.(answers) ?? true;
}

/** Human wording for an answer's value. */
export function describeValue(key: QuestionKey, value: unknown): string {
  const ui = QUESTION_UI[key];
  const opt = ui.options?.find((o) => JSON.stringify(o.value) === JSON.stringify(value));
  if (opt) return opt.label;
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("total_area_ft2" in v) return `${v["total_area_ft2"]} ft² of windows`;
    if ("ufactor" in v) return `U ${v["ufactor"]}, SHGC ${v["shgc"]}`;
    if ("depth_in" in v) return `${v["depth_in"]} in of ${String(v["material"]).replace(/_/g, " ")}`;
    if ("nominal_r" in v) return `R-${v["nominal_r"]}`;
    if ("leakage_to_outside_cfm25" in v) return `${v["leakage_to_outside_cfm25"]} CFM25 to outside`;
    if ("ach50" in v) return `${v["ach50"]} ACH50`;
    if ("cfm50" in v) return `${v["cfm50"]} CFM50`;
  }
  if (key === "floor_area") return `${String(value)} ft²`;
  if (key === "ceiling_height") return `${String(value)} ft`;
  return String(value);
}

type ShownField = { value: unknown; state: string; source?: string; note?: string; unit?: string };

/** What the build used for a question: the first Assessment field the question set. */
function usedField(key: QuestionKey, result: QuickPassResult | null): ShownField | null {
  const path = result?.fields[key]?.[0];
  if (!path || !result?.assessment) return null;
  return (getFieldAtPath(result.assessment, path) as ShownField | undefined) ?? null;
}

const STATUS_WORDS = { answered: "Answered", didnt_inspect: "Didn't inspect", inspected_cant_tell: "Inspected, can't tell", not_answered: "Not answered" } as const;

export function QuestionCard(props: {
  q: QuestionInfo;
  answer: AnswerValue;
  result: QuickPassResult | null;
  onChange: (a: AnswerValue) => void;
}) {
  const { q, answer, result, onChange } = props;
  const ui = QUESTION_UI[q.key];
  const [direct, setDirect] = useState<Record<string, string>>({});
  const [directState, setDirectState] = useState<"measured" | "documented" | null>(null);
  const [directSource, setDirectSource] = useState("");
  const status = result?.status[q.key] ?? "not_answered";
  const used = usedField(q.key, result);
  const issues = result?.issues.filter((i) => i.question === q.key) ?? [];
  const current = answer && "value" in answer ? answer.value : undefined;

  const choose = (value: unknown) => onChange({ value, state: "assumed", evidence: [] });
  const submitDirect = (d: Direct) => {
    const value = d.build(Object.fromEntries(d.fields.map((f) => [f.name, direct[`${d.label}:${f.name}`] ?? (f.kind === "select" ? (f.options?.[0]?.value ?? "") : "")])));
    if (value === null) return;
    const source = directSource.trim();
    onChange({ value, state: directState ?? d.state, ...(source ? { source } : {}), evidence: [] });
  };

  return (
    <section className="panel" id={`q-${q.key}`} aria-labelledby={`h-${q.key}`}>
      <h2 id={`h-${q.key}`}>
        Q{q.number}. {q.label}
        {q.required ? <span className="muted"> (required)</span> : null}
      </h2>
      {ui.hint ? <p className="muted" style={{ margin: "0 0 6px" }}>{ui.hint}</p> : null}

      <div className="status">
        <span className="pill">{STATUS_WORDS[status]}</span>
        {answer && "value" in answer ? <strong>{describeValue(q.key, answer.value)}</strong> : null}
        {used ? (
          <>
            <span className={`state ${used.state}`}>{used.state}</span>
            {!(answer && "value" in answer) ? (
              <span>
                using {String(used.value)}
                {used.unit ? ` ${used.unit}` : ""}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      {used?.source ? <div className="source">Source: {used.source}</div> : answer && "value" in answer && answer.source ? <div className="source">Source: {answer.source}</div> : null}
      {used?.note ? <div className="source">Note: {used.note}</div> : null}

      {ui.options ? (
        <div className="choices" role="group" aria-label={`${q.label} choices`}>
          {ui.options.map((o) => (
            <button type="button" key={o.label} className="choice" aria-pressed={JSON.stringify(current) === JSON.stringify(o.value)} onClick={() => choose(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      ) : null}

      {ui.direct?.map((d) => (
        <form
          key={d.label}
          className="row"
          style={{ margin: "10px 0" }}
          onSubmit={(e) => {
            e.preventDefault();
            submitDirect(d);
          }}
        >
          {d.fields.map((f) => (
            <label className="field" key={f.name}>
              {f.label}
              {f.unit ? ` (${f.unit})` : ""}
              {f.kind === "select" ? (
                <select value={direct[`${d.label}:${f.name}`] ?? f.options?.[0]?.value ?? ""} onChange={(e) => setDirect({ ...direct, [`${d.label}:${f.name}`]: e.target.value })}>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input inputMode="decimal" aria-label={`${q.label} ${f.label}`} value={direct[`${d.label}:${f.name}`] ?? ""} onChange={(e) => setDirect({ ...direct, [`${d.label}:${f.name}`]: e.target.value })} />
              )}
            </label>
          ))}
          <label className="field">
            How known
            <select value={directState ?? d.state} onChange={(e) => setDirectState(e.target.value as "measured" | "documented")}>
              <option value="measured">Measured</option>
              <option value="documented">From a document</option>
            </select>
          </label>
          <label className="field">
            Source (optional)
            <input className="wide" placeholder="e.g. blower door, plan sheet A2" value={directSource} onChange={(e) => setDirectSource(e.target.value)} />
          </label>
          <button type="submit" className="secondary">
            Use {d.label.toLowerCase()}
          </button>
        </form>
      ))}

      <div className="choices">
        {!q.required ? (
          <>
            <button type="button" className="choice unknown" aria-pressed={status === "didnt_inspect"} onClick={() => onChange({ unknown: "didnt_inspect", evidence: [] })}>
              Didn&apos;t inspect
            </button>
            <button type="button" className="choice unknown" aria-pressed={status === "inspected_cant_tell"} onClick={() => onChange({ unknown: "inspected_cant_tell", evidence: [] })}>
              Inspected, can&apos;t tell
            </button>
          </>
        ) : null}
        {answer ? (
          <button type="button" className="choice unknown" onClick={() => onChange(undefined)}>
            Clear answer
          </button>
        ) : null}
      </div>
      {!q.required && (status === "didnt_inspect" || status === "inspected_cant_tell" || status === "not_answered") ? (
        <p className="muted" style={{ fontSize: 14 }}>
          The template default stays in place and shows on the report as assumed, not measured.
        </p>
      ) : null}
      {issues.map((i) => (
        <div key={i.code + i.message} className={`issue ${i.severity}`}>
          {i.message}
        </div>
      ))}
    </section>
  );
}
