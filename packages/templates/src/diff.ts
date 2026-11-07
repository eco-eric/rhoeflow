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

/** What the quick pass knows about the house that bears on the template pick. */
export interface HouseShape {
  year_built?: number | null | undefined;
  stories?: number | null | undefined;
  /** The quick pass's foundation answer ("slab" or "crawlspace") or a template foundation type. */
  foundation?: string | null | undefined;
}

/** One template in the picker, with how well it fits the house. */
export interface RankedTemplate<T> {
  template: T;
  /** The year built falls inside the template's era. */
  era_match: boolean;
  /** Stories and foundation, each true, false, or null when the house's value isn't known yet. */
  stories_match: boolean | null;
  foundation_match: boolean | null;
  /** The one best fit: era matches and nothing known contradicts it. At most one per list. */
  suggested: boolean;
}

const crawl = (f: string): boolean => /crawl|pier/i.test(f);
const slab = (f: string): boolean => /slab/i.test(f);

/** Does a template's foundation type fit the house's answer? Null when the answer is unknown. */
function foundationFits(templateFoundation: string, answer: string | null | undefined): boolean | null {
  if (!answer) return null;
  if (crawl(answer)) return crawl(templateFoundation);
  if (slab(answer)) return slab(templateFoundation);
  return templateFoundation === answer;
}

/** Years between a year and an era; 0 inside it. */
function eraDistance(era: Pick<Template, "era">["era"], year: number): number {
  if (era.year_from !== null && year < era.year_from) return era.year_from - year;
  if (era.year_to !== null && year > era.year_to) return year - era.year_to;
  return 0;
}

/**
 * Every template, ranked for the house (owner 2026-11-07: a job shows all templates, the
 * suggested one first and marked). Order: era match, then stories match, then foundation match,
 * then the nearest era, then the list's own order. Only the first is marked suggested, and only
 * when its era covers the year and neither stories nor foundation contradicts the answers. A person
 * still picks; nothing is applied automatically (ADR-003). With no year, nothing is suggested and
 * the list keeps its order (stories and foundation still lead).
 */
export function rankFrom<T extends Pick<Template, "era" | "style">>(templates: readonly T[], house: HouseShape): RankedTemplate<T>[] {
  const year = typeof house.year_built === "number" ? house.year_built : null;
  const stories = typeof house.stories === "number" ? house.stories : null;
  const rows = templates.map((t, i) => {
    const era_match = year !== null && eraDistance(t.era, year) === 0;
    const stories_match = stories === null ? null : t.style.stories === Math.round(stories);
    const foundation_match = foundationFits(t.style.foundation, house.foundation);
    return { template: t, era_match, stories_match, foundation_match, suggested: false, i, dist: year === null ? 0 : eraDistance(t.era, year) };
  });
  rows.sort(
    (a, b) =>
      Number(b.era_match) - Number(a.era_match) ||
      Number(b.stories_match === true) - Number(a.stories_match === true) ||
      Number(b.foundation_match === true) - Number(a.foundation_match === true) ||
      a.dist - b.dist ||
      a.i - b.i,
  );
  const best = rows[0];
  if (best && best.era_match && best.stories_match !== false && best.foundation_match !== false) best.suggested = true;
  return rows.map(({ template, era_match, stories_match, foundation_match, suggested }) => ({ template, era_match, stories_match, foundation_match, suggested }));
}

/**
 * Why a template doesn't fit the house, in words for the tech ("built 1946, it covers 1980 to
 * 2000"), or an empty list when it fits or the answers aren't in yet.
 */
export function templateMismatches(t: Pick<Template, "era" | "style">, house: HouseShape): string[] {
  const out: string[] = [];
  const year = typeof house.year_built === "number" ? house.year_built : null;
  if (year !== null && eraDistance(t.era, year) > 0) {
    const span = t.era.year_from === null ? `${t.era.year_to} and earlier` : t.era.year_to === null ? `${t.era.year_from} and later` : `${t.era.year_from} to ${t.era.year_to}`;
    out.push(`the house was built in ${year} and this template covers ${span}`);
  }
  const stories = typeof house.stories === "number" ? Math.round(house.stories) : null;
  if (stories !== null && t.style.stories !== stories) out.push(`the house has ${stories} ${stories === 1 ? "story" : "stories"} and this template has ${t.style.stories}`);
  if (foundationFits(t.style.foundation, house.foundation) === false) {
    out.push(`the house is on ${crawl(house.foundation!) ? "pier and beam" : "a slab"} and this template is ${crawl(t.style.foundation) ? "pier and beam" : "on a slab"}`);
  }
  return out;
}
