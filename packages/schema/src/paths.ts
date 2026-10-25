import { isField, type Field } from "./provenance.js";

/**
 * Field paths (SCN-001; plan §Domain model). The grammar matches what `walkFields` yields:
 * dot-separated keys with zero-based array indexes in brackets, e.g.
 * `building.enclosure.windows[0].shgc`. A path names a position; element ids, not paths,
 * are identity (DAT-001), so a caller that stores a path must also store the revision it
 * was taken against.
 */
export const FIELD_PATH_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(\[\d+\])*(\.[A-Za-z_][A-Za-z0-9_]*(\[\d+\])*)*$/;

export type PathSegment = string | number;

export function parseFieldPath(path: string): PathSegment[] {
  if (!FIELD_PATH_PATTERN.test(path)) throw new Error(`invalid field path "${path}"`);
  const out: PathSegment[] = [];
  for (const part of path.split(".")) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)((?:\[\d+\])*)$/.exec(part)!;
    out.push(m[1]!);
    for (const idx of m[2]!.matchAll(/\[(\d+)\]/g)) out.push(Number(idx[1]));
  }
  return out;
}

/** The value at `path`, or `undefined` when any segment is missing. Never throws on shape. */
export function getAtPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of parseFieldPath(path)) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<PropertyKey, unknown>)[seg];
  }
  return cur;
}

/** The provenance field at `path`, or `undefined` when there is none there. */
export function getFieldAtPath(root: unknown, path: string): Field<unknown> | undefined {
  const v = getAtPath(root, path);
  return isField(v) ? v : undefined;
}

/**
 * Return a deep copy of `root` with the field at `path` replaced. Refuses to create a new
 * position: the path must already hold a provenance field, so an override can never add an
 * input the baseline did not have (SCN-001 "explicit modifications").
 */
export function setFieldAtPath<T>(root: T, path: string, field: Field<unknown> & { unit?: string }): T {
  const copy = deepClone(root);
  const segs = parseFieldPath(path);
  let cur: unknown = copy;
  for (const seg of segs.slice(0, -1)) {
    if (typeof cur !== "object" || cur === null) throw new Error(`no field at "${path}"`);
    cur = (cur as Record<PropertyKey, unknown>)[seg];
  }
  const last = segs[segs.length - 1]!;
  if (typeof cur !== "object" || cur === null || !isField((cur as Record<PropertyKey, unknown>)[last])) {
    throw new Error(`no field at "${path}"`);
  }
  (cur as Record<PropertyKey, unknown>)[last] = field;
  return copy;
}

/** Plain-data deep copy (the schema package compiles without the DOM lib that types structuredClone). */
export function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => deepClone(v)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = deepClone(v);
    return out as T;
  }
  return value;
}
