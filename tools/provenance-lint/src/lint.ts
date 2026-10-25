import { PROVENANCE_STATES, UNKNOWN_REASONS } from "@rhoeflow/schema";

/**
 * Structural provenance lint (PRV-001, PRV-003; CLAUDE.md hard rules). Independent of the
 * Zod schema on purpose: it runs over any JSON data file (fixtures, templates, exported
 * assessments) and catches the rule violations even where the schema is not applied.
 *
 * Rules:
 *  P001  a field with a value (state != unknown) has a non-empty string `source`
 *  P002  a field in state unknown has `value: null` and a known `reason`
 *  P003  a field's `state` is one of the seven provenance states
 *  P004  evidence entries are media ids, never URLs or file paths
 *  P005  no key named confidence / probability / certainty / likelihood anywhere
 *        (no invented confidence percentages)
 *  P006  a template default has non-empty `sources` and `basis`
 */
export interface LintViolation {
  rule: "P001" | "P002" | "P003" | "P004" | "P005" | "P006";
  path: string;
  message: string;
}

const CONFIDENCE_KEYS = /^(confidence|probability|certainty|likelihood)(_?(pct|percent|score))?$/i;
const STATES = new Set<string>(PROVENANCE_STATES);
const REASONS = new Set<string>(UNKNOWN_REASONS);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function looksLikeField(v: Record<string, unknown>): boolean {
  return "state" in v && "value" in v;
}

function looksLikeTemplateDefault(v: Record<string, unknown>): boolean {
  return "value" in v && ("sources" in v || "basis" in v) && !("state" in v);
}

export function lintValue(root: unknown, basePath = ""): LintViolation[] {
  const out: LintViolation[] = [];
  const visit = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => visit(item, `${path}[${i}]`));
      return;
    }
    if (!isObject(node)) return;

    for (const key of Object.keys(node)) {
      if (CONFIDENCE_KEYS.test(key)) {
        out.push({ rule: "P005", path: path ? `${path}.${key}` : key, message: `confidence-style key "${key}" is not allowed (PRV-003)` });
      }
    }

    if (looksLikeField(node)) {
      const state = node["state"];
      if (typeof state !== "string" || !STATES.has(state)) {
        out.push({ rule: "P003", path, message: `state ${JSON.stringify(state)} is not a provenance state` });
      } else if (state === "unknown") {
        if (node["value"] !== null) {
          out.push({ rule: "P002", path, message: `unknown field must have value null, got ${JSON.stringify(node["value"])}` });
        }
        const reason = node["reason"];
        if (typeof reason !== "string" || !REASONS.has(reason)) {
          out.push({ rule: "P002", path, message: `unknown field needs a reason (${[...REASONS].join(" | ")})` });
        }
      } else {
        const source = node["source"];
        if (typeof source !== "string" || source.trim().length === 0) {
          out.push({ rule: "P001", path, message: `${state} field has a value but no source citation` });
        }
        if (node["value"] === null || node["value"] === undefined) {
          out.push({ rule: "P001", path, message: `${state} field has no value; use state unknown with a reason` });
        }
      }
      const evidence = node["evidence"];
      if (Array.isArray(evidence)) {
        evidence.forEach((ev, i) => {
          if (typeof ev !== "string" || ev.trim() === "" || /^[a-z]+:\/\//i.test(ev) || /^([A-Za-z]:\\|\/|\.\.?\/)/.test(ev)) {
            out.push({ rule: "P004", path: `${path}.evidence[${i}]`, message: `evidence must be a media id, not ${JSON.stringify(ev)}` });
          }
        });
      }
      // Do not descend into a field's value: nested objects there are data, not fields.
      return;
    }

    if (looksLikeTemplateDefault(node)) {
      const sources = node["sources"];
      if (!Array.isArray(sources) || sources.length === 0 || sources.some((s) => typeof s !== "string" || s.trim() === "")) {
        out.push({ rule: "P006", path, message: "template default needs at least one non-empty source id" });
      }
      const basis = node["basis"];
      if (typeof basis !== "string" || basis.trim().length === 0) {
        out.push({ rule: "P006", path, message: "template default needs a basis" });
      }
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      visit(value, path ? `${path}.${key}` : key);
    }
  };
  visit(root, basePath);
  return out;
}

export interface FieldCount {
  fields: number;
  unknown: number;
}

/** Count provenance fields so a file with zero fields is reported, not silently passed. */
export function countFields(root: unknown): FieldCount {
  const c: FieldCount = { fields: 0, unknown: 0 };
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!isObject(node)) return;
    if (looksLikeField(node)) {
      c.fields++;
      if (node["state"] === "unknown") c.unknown++;
      return;
    }
    Object.values(node).forEach(visit);
  };
  visit(root);
  return c;
}
