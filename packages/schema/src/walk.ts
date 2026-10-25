import { isField, type Field } from "./provenance.js";

export interface FieldVisit {
  /** JSON-pointer-like path, e.g. `building.enclosure.walls[0].area`. */
  path: string;
  field: Field<unknown>;
}

/**
 * Walk any plain object tree and yield every provenance field in it. Structural, so it
 * works on a validated Assessment, a raw fixture, or a template payload alike. Used by the
 * provenance lint (PRV-001, PRV-003) and by the template applier (ADR-024).
 */
export function* walkFields(root: unknown, basePath = ""): Generator<FieldVisit> {
  if (isField(root)) {
    yield { path: basePath, field: root };
    return;
  }
  if (Array.isArray(root)) {
    for (let i = 0; i < root.length; i++) {
      yield* walkFields(root[i], `${basePath}[${i}]`);
    }
    return;
  }
  if (typeof root === "object" && root !== null) {
    for (const [key, value] of Object.entries(root as Record<string, unknown>)) {
      yield* walkFields(value, basePath ? `${basePath}.${key}` : key);
    }
  }
}

export function collectFields(root: unknown): FieldVisit[] {
  return [...walkFields(root)];
}
