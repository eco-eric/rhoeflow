import { z } from "zod";
import { IECC_CLIMATE_ZONES, FOUNDATION_TYPES, type Unit } from "@rhoeflow/schema";

/**
 * Era/style template format (ADR-024). A template is data: a bibliography plus a set of
 * slot values. Each slot names one kind of engineering input and the unit it is given in.
 * Applying a template (see apply.ts) writes those values into an Assessment's matching
 * fields as `defaulted` with the template's citation, never over a measured, documented
 * or assumed value, and never by converting units (conversions are WO-02 methods).
 */
export const TEMPLATE_VERSION = "0.1.0" as const;

export const TEMPLATE_SLOTS = [
  "ceiling_insulation_cavity_r",
  "wall_insulation_cavity_r",
  "wall_insulation_continuous_r",
  "window_ufactor",
  "window_shgc",
  "air_leakage",
  "duct_insulation_r",
  "duct_leakage_to_outside",
  "roof_radiant_barrier",
] as const;
export type TemplateSlot = (typeof TEMPLATE_SLOTS)[number];

/** Which units each slot may be expressed in; `boolean` slots carry no unit. */
export const SLOT_SPECS: Readonly<Record<TemplateSlot, { units: readonly Unit[] | "boolean"; target: string }>> = {
  ceiling_insulation_cavity_r: { units: ["h-ft2-F/Btu"], target: "enclosure.floors[exterior_adjacent_to=attic*].insulation_cavity_r_value" },
  wall_insulation_cavity_r: { units: ["h-ft2-F/Btu"], target: "enclosure.walls[exterior_adjacent_to=outside].insulation_cavity_r_value" },
  wall_insulation_continuous_r: { units: ["h-ft2-F/Btu"], target: "enclosure.walls[exterior_adjacent_to=outside].insulation_continuous_r_value" },
  window_ufactor: { units: ["Btu/h-ft2-F"], target: "enclosure.windows[*].ufactor" },
  window_shgc: { units: ["fraction"], target: "enclosure.windows[*].shgc" },
  air_leakage: { units: ["ACH50", "cfm50", "ACHnatural"], target: "enclosure.air_infiltration.air_leakage" },
  duct_insulation_r: { units: ["h-ft2-F/Btu"], target: "systems.hvac.hvac_distributions[*].ducts[*].duct_insulation_r_value" },
  duct_leakage_to_outside: {
    units: ["cfm25", "cfm50", "fraction", "cfm25/100ft2"],
    target: "systems.hvac.hvac_distributions[*].duct_leakage_measurements[total_or_to_outside=to outside].value",
  },
  roof_radiant_barrier: { units: "boolean", target: "enclosure.roofs[*].radiant_barrier" },
};

const SourceRefSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  citation: z.string().min(1),
  url: z.string().url().optional(),
});

const NumericSlotValueSchema = z.strictObject({
  value: z.number().finite(),
  unit: z.enum(["h-ft2-F/Btu", "Btu/h-ft2-F", "fraction", "ACH50", "cfm50", "ACHnatural", "cfm25", "cfm25/100ft2"]),
  /** Ids from `sources`; at least one (PRV-001). */
  sources: z.array(z.string()).min(1),
  /** The range the sources give; the single `value` is the deterministic pick (PRV-003). */
  range: z.strictObject({ low: z.number().finite(), high: z.number().finite() }).optional(),
  /** Why this value was picked from the range, and what to inspect to replace it. */
  basis: z.string().min(1),
});

const BooleanSlotValueSchema = z.strictObject({
  value: z.boolean(),
  sources: z.array(z.string()).min(1),
  basis: z.string().min(1),
});

export const TemplateSchema = z
  .strictObject({
    template_version: z.literal(TEMPLATE_VERSION),
    template_id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().min(1),
    description: z.string().min(1),
    region: z.strictObject({
      market: z.string().min(1),
      state: z.string().length(2),
      iecc_climate_zone: z.enum(IECC_CLIMATE_ZONES),
    }),
    era: z.strictObject({
      year_from: z.number().int().nullable(),
      year_to: z.number().int().nullable(),
      /** Energy code in force for the era, as the sources describe it. */
      code_basis: z.string().min(1),
    }),
    style: z.strictObject({
      stories: z.number().int().min(1).max(3),
      foundation: z.enum(FOUNDATION_TYPES),
      attic: z.enum(["vented", "unvented", "conditioned"]),
      typical_cladding: z.string().min(1),
    }),
    sources: z.array(SourceRefSchema).min(1),
    defaults: z.strictObject({
      ceiling_insulation_cavity_r: NumericSlotValueSchema.optional(),
      wall_insulation_cavity_r: NumericSlotValueSchema.optional(),
      wall_insulation_continuous_r: NumericSlotValueSchema.optional(),
      window_ufactor: NumericSlotValueSchema.optional(),
      window_shgc: NumericSlotValueSchema.optional(),
      air_leakage: NumericSlotValueSchema.optional(),
      duct_insulation_r: NumericSlotValueSchema.optional(),
      duct_leakage_to_outside: NumericSlotValueSchema.optional(),
      roof_radiant_barrier: BooleanSlotValueSchema.optional(),
    }),
  })
  .superRefine((t, ctx) => {
    const ids = new Set(t.sources.map((s) => s.id));
    for (const [slot, v] of Object.entries(t.defaults)) {
      if (!v) continue;
      for (const sid of v.sources) {
        if (!ids.has(sid)) ctx.addIssue({ code: "custom", path: ["defaults", slot, "sources"], message: `unknown source id "${sid}"` });
      }
      if ("unit" in v) {
        const allowed = SLOT_SPECS[slot as TemplateSlot].units;
        if (allowed === "boolean" || !allowed.includes(v.unit as Unit)) {
          ctx.addIssue({ code: "custom", path: ["defaults", slot, "unit"], message: `unit "${v.unit}" not allowed for slot ${slot}` });
        }
      }
      if ("range" in v && v.range && (v.value < v.range.low || v.value > v.range.high)) {
        ctx.addIssue({ code: "custom", path: ["defaults", slot, "value"], message: "value must lie within its stated range" });
      }
    }
    if (t.era.year_from !== null && t.era.year_to !== null && t.era.year_from > t.era.year_to) {
      ctx.addIssue({ code: "custom", path: ["era"], message: "year_from must not exceed year_to" });
    }
  });

export type Template = z.output<typeof TemplateSchema>;
export type NumericSlotValue = z.output<typeof NumericSlotValueSchema>;
export type BooleanSlotValue = z.output<typeof BooleanSlotValueSchema>;
