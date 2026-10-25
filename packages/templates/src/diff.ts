import type { Template } from "./template.js";

/** One changed value between two template payloads (D9: the editor shows them before saving). */
export interface TemplateChange {
  path: string;
  from: unknown;
  to: unknown;
}

function walk(a: unknown, b: unknown, path: string, out: TemplateChange[]): void {
  const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
  // A side that is missing counts as empty, so an added or removed block lists its leaves.
  if (a === undefined && isObj(b)) a = {};
  if (b === undefined && isObj(a)) b = {};
  if (a === undefined && Array.isArray(b)) a = [];
  if (b === undefined && Array.isArray(a)) b = [];
  if (isObj(a) && isObj(b)) {
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) walk(a[k], b[k], path ? `${path}.${k}` : k, out);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.every((x) => isObj(x) && "id" in x) && b.every((x) => isObj(x) && "id" in x)) {
    // Source lists are keyed by id, so a reorder is not a change.
    const ids = [...new Set([...a, ...b].map((x) => String((x as { id: unknown }).id)))].sort();
    for (const id of ids) walk(a.find((x) => (x as { id: unknown }).id === id), b.find((x) => (x as { id: unknown }).id === id), `${path}[${id}]`, out);
    return;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path, from: a, to: b });
}

/** Leaf-level differences from `before` to `after`, with stable paths such as `defaults.window_shgc.value`. */
export function diffTemplates(before: Template | null, after: Template): TemplateChange[] {
  const out: TemplateChange[] = [];
  walk(before ?? {}, after, "", out);
  return out;
}

/**
 * Templates whose era covers the year, best style match first (D2). A person picks; nothing is
 * applied automatically (ADR-003). Works on any list: the repo set or the team's stored versions.
 */
export function suggestFrom<T extends Pick<Template, "era" | "style">>(templates: readonly T[], year_built: number, stories?: number): T[] {
  return templates
    .filter((t) => (t.era.year_from ?? -Infinity) <= year_built && year_built <= (t.era.year_to ?? Infinity))
    .sort((a, b) => Number(b.style.stories === stories) - Number(a.style.stories === stories));
}
