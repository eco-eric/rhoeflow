import type { Assessment, Field, Unit } from "@rhoeflow/schema";
import type { Template, TemplateSlot } from "./template.js";

export interface AppliedDefault {
  slot: TemplateSlot;
  path: string;
  value: number | boolean;
  unit?: Unit;
}

export interface SkippedDefault {
  slot: TemplateSlot;
  path?: string;
  reason: string;
}

export interface ApplyResult {
  assessment: Assessment;
  applied: AppliedDefault[];
  skipped: SkippedDefault[];
}

type AnyField = Field<unknown> & { unit?: Unit };

/** Split of total duct leakage to outside between the two measurements (WO-02 A2). */
export const DUCT_LEAKAGE_SHARES = { supply: 2 / 3, return: 1 / 3 } as const;

function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

function sourceString(template: Template, sourceIds: string[], basis: string): string {
  const cites = template.sources.filter((s) => sourceIds.includes(s.id)).map((s) => s.citation);
  return `template:${template.template_id} (${cites.join("; ")}). ${basis}`;
}

function replaceable(field: AnyField | undefined): boolean {
  return field === undefined || field.state === "unknown";
}

function defaultedField(template: Template, sourceIds: string[], basis: string, prior: AnyField | undefined, value: number | boolean, unit?: Unit): AnyField {
  const base = {
    value,
    state: "defaulted" as const,
    source: sourceString(template, sourceIds, basis),
    evidence: [] as string[],
    ...(prior?.state === "unknown" ? { note: `template default replaced unknown (${prior.reason})` } : {}),
  };
  return unit === undefined ? base : { ...base, unit };
}

/**
 * Seed an Assessment's unknown or absent inputs from a template (ADR-024). Rules:
 * - Only `unknown` or absent fields are written; measured/documented/assumed/derived/
 *   proposed values are never touched (the result lists them as skipped).
 * - A value is written only where the slot's unit matches the target field's unit. No
 *   conversion happens here: a per-100 ft2 duct leakage rate is skipped with a reason.
 * - Every written field is `defaulted` with the template id and citations as its source.
 * The input is not mutated; a deep copy is returned with `template_id` set.
 */
export function applyTemplate(input: Assessment, template: Template): ApplyResult {
  const assessment = structuredClone(input);
  const applied: AppliedDefault[] = [];
  const skipped: SkippedDefault[] = [];
  const e = assessment.building.enclosure;
  const d = template.defaults;

  const setNumeric = (
    slot: TemplateSlot,
    path: string,
    holder: Record<string, unknown>,
    key: string,
    allowedUnits: readonly Unit[],
    share?: { factor: number; note: string },
  ) => {
    const spec = d[slot];
    if (!spec || !("unit" in spec)) return;
    const prior = holder[key] as AnyField | undefined;
    if (!replaceable(prior)) {
      skipped.push({ slot, path, reason: `kept ${prior!.state} value` });
      return;
    }
    if (!allowedUnits.includes(spec.unit as Unit)) {
      skipped.push({ slot, path, reason: `unit ${spec.unit} needs a conversion the target does not accept (WO-02)` });
      return;
    }
    const value = share ? round4(spec.value * share.factor) : spec.value;
    const basis = share ? `${spec.basis} Applier: ${share.note}.` : spec.basis;
    holder[key] = defaultedField(template, spec.sources, basis, prior, value, spec.unit as Unit);
    applied.push({ slot, path, value, unit: spec.unit as Unit });
  };

  // Ceilings: floors whose exterior side is an attic.
  e.floors.forEach((f, i) => {
    if (typeof f.exterior_adjacent_to.value === "string" && f.exterior_adjacent_to.value.startsWith("attic")) {
      setNumeric("ceiling_insulation_cavity_r", `building.enclosure.floors[${i}].insulation_cavity_r_value`, f as unknown as Record<string, unknown>, "insulation_cavity_r_value", ["h-ft2-F/Btu"]);
    }
  });

  // Exterior walls.
  e.walls.forEach((w, i) => {
    if (w.exterior_adjacent_to.value === "outside") {
      const holder = w as unknown as Record<string, unknown>;
      setNumeric("wall_insulation_cavity_r", `building.enclosure.walls[${i}].insulation_cavity_r_value`, holder, "insulation_cavity_r_value", ["h-ft2-F/Btu"]);
      setNumeric("wall_insulation_continuous_r", `building.enclosure.walls[${i}].insulation_continuous_r_value`, holder, "insulation_continuous_r_value", ["h-ft2-F/Btu"]);
    }
  });

  // Windows.
  e.windows.forEach((w, i) => {
    const holder = w as unknown as Record<string, unknown>;
    setNumeric("window_ufactor", `building.enclosure.windows[${i}].ufactor`, holder, "ufactor", ["Btu/h-ft2-F"]);
    setNumeric("window_shgc", `building.enclosure.windows[${i}].shgc`, holder, "shgc", ["fraction"]);
  });

  // Air leakage: the field carries one of ACH50 | cfm50 | ACHnatural; the slot must match it.
  {
    const prior = e.air_infiltration.air_leakage as AnyField;
    const allowed: readonly Unit[] = prior.unit ? [prior.unit] : ["ACH50", "cfm50", "ACHnatural"];
    setNumeric("air_leakage", "building.enclosure.air_infiltration.air_leakage", e.air_infiltration as unknown as Record<string, unknown>, "air_leakage", allowed);
  }

  // Ducts and duct leakage.
  assessment.building.systems.hvac.hvac_distributions.forEach((dist, di) => {
    dist.ducts.forEach((duct, ki) => {
      setNumeric("duct_insulation_r", `building.systems.hvac.hvac_distributions[${di}].ducts[${ki}].duct_insulation_r_value`, duct as unknown as Record<string, unknown>, "duct_insulation_r_value", ["h-ft2-F/Btu"]);
    });
    // The slot is TOTAL leakage to outside (owner decision 2026-10-25, WO-02 A2): the supply
    // measurement gets 2/3 of it and the return 1/3. Values are rounded to 4 decimals so the
    // two shares still sum to the template total.
    dist.duct_leakage_measurements.forEach((m, mi) => {
      if (m.total_or_to_outside.value !== "to outside") return;
      const share = DUCT_LEAKAGE_SHARES[m.duct_type.value as "supply" | "return"];
      if (!share) return;
      const prior = m.value as AnyField;
      const allowed: readonly Unit[] = prior.unit ? [prior.unit] : ["cfm25", "cfm50", "fraction"];
      setNumeric(
        "duct_leakage_to_outside",
        `building.systems.hvac.hvac_distributions[${di}].duct_leakage_measurements[${mi}].value`,
        m as unknown as Record<string, unknown>,
        "value",
        allowed,
        { factor: share, note: `${m.duct_type.value} share ${share === 2 / 3 ? "2/3" : "1/3"} of the template total` },
      );
    });
  });

  // Radiant barrier (boolean slot).
  if (d.roof_radiant_barrier) {
    const spec = d.roof_radiant_barrier;
    e.roofs.forEach((r, i) => {
      const path = `building.enclosure.roofs[${i}].radiant_barrier`;
      const prior = r.radiant_barrier as AnyField;
      if (!replaceable(prior)) {
        skipped.push({ slot: "roof_radiant_barrier", path, reason: `kept ${prior.state} value` });
        return;
      }
      (r as unknown as Record<string, unknown>)["radiant_barrier"] = defaultedField(template, spec.sources, spec.basis, prior, spec.value);
      applied.push({ slot: "roof_radiant_barrier", path, value: spec.value });
    });
  }

  // Slots the template defines but the assessment has no target for.
  for (const slot of Object.keys(d) as TemplateSlot[]) {
    if (d[slot] && !applied.some((a) => a.slot === slot) && !skipped.some((s) => s.slot === slot)) {
      skipped.push({ slot, reason: "no matching element in the assessment" });
    }
  }

  assessment.template_id = template.template_id;
  return { assessment, applied, skipped };
}
