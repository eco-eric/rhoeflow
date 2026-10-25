import { z } from "zod";
import { field, quantityOf } from "../provenance.js";
import { ElementIdSchema } from "../ids.js";
import { ZONE_TYPES } from "./enums.js";

/**
 * HPXML Zones/Zone/Spaces/Space (ADR-007, DAT-002). A physical room (Space), a thermal
 * zone (Zone) and an HVAC system are distinct records from the first schema version even
 * though the block-load UI exposes one conditioned zone with no spaces (ADR-014).
 *
 * A space's `name` is a display field with provenance; its `id` is its identity (DAT-001).
 */
export const SpaceSchema = z.strictObject({
  id: ElementIdSchema,
  name: field(z.string().min(1)),
  floor_area: quantityOf("ft2"),
  /** HPXML ManualJInputs on a Space; present when room-level work begins (phase 4). */
  manualj_inputs: z
    .strictObject({
      internal_loads_sensible: quantityOf("Btu/h"),
      internal_loads_latent: quantityOf("Btu/h"),
      number_of_occupants: quantityOf("count"),
    })
    .optional(),
});
export type Space = z.output<typeof SpaceSchema>;

export const ZoneSchema = z.strictObject({
  id: ElementIdSchema,
  zone_type: field(z.enum(ZONE_TYPES)),
  spaces: z.array(SpaceSchema),
});
export type Zone = z.output<typeof ZoneSchema>;
