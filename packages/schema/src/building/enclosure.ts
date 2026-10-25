import { z } from "zod";
import { field, quantity, quantityOf } from "../provenance.js";
import { ElementIdSchema } from "../ids.js";
import {
  ATTIC_TYPES,
  FOUNDATION_TYPES,
  HPXML_LOCATIONS,
  ROOF_TYPES,
  SIDING_TYPES,
  WALL_TYPES,
  WINDOW_INTERIOR_SHADING,
} from "./enums.js";

/**
 * HPXML Enclosure, block-load subset (ADR-023, ADR-014). Every surface carries a stable
 * id (DAT-001) and may be attached to a space (DAT-002, ADR-007) so room-level work in
 * later phases does not re-key the model.
 */

const Location = z.enum(HPXML_LOCATIONS);

/** HPXML AirInfiltration/AirInfiltrationMeasurement. One measurement per building. */
export const AirInfiltrationSchema = z.strictObject({
  id: ElementIdSchema,
  /** Test pressure for a blower-door result; absent for ACHnatural. */
  house_pressure: quantityOf("Pa").optional(),
  air_leakage: quantity(["ACH50", "cfm50", "ACHnatural"]),
});
export type AirInfiltration = z.output<typeof AirInfiltrationSchema>;

export const AtticSchema = z.strictObject({
  id: ElementIdSchema,
  attic_type: field(z.enum(ATTIC_TYPES)),
});

export const FoundationSchema = z.strictObject({
  id: ElementIdSchema,
  foundation_type: field(z.enum(FOUNDATION_TYPES)),
});

export const RoofSchema = z.strictObject({
  id: ElementIdSchema,
  interior_adjacent_to: field(Location),
  attached_to_space: ElementIdSchema.optional(),
  area: quantityOf("ft2"),
  azimuth: quantityOf("degrees").optional(),
  roof_type: field(z.enum(ROOF_TYPES)),
  solar_absorptance: quantityOf("fraction"),
  emittance: quantityOf("fraction"),
  pitch: quantityOf("in:12"),
  radiant_barrier: field(z.boolean()),
  insulation_assembly_r_value: quantityOf("h-ft2-F/Btu"),
});

export const WallSchema = z.strictObject({
  id: ElementIdSchema,
  exterior_adjacent_to: field(Location),
  interior_adjacent_to: field(Location),
  attached_to_space: ElementIdSchema.optional(),
  wall_type: field(z.enum(WALL_TYPES)),
  area: quantityOf("ft2"),
  azimuth: quantityOf("degrees"),
  siding: field(z.enum(SIDING_TYPES)),
  solar_absorptance: quantityOf("fraction"),
  emittance: quantityOf("fraction"),
  insulation_assembly_r_value: quantityOf("h-ft2-F/Btu"),
});

/** HPXML Floor: ceilings below attics and floors over crawlspaces/garages are both Floors. */
export const FloorSchema = z.strictObject({
  id: ElementIdSchema,
  exterior_adjacent_to: field(Location),
  interior_adjacent_to: field(Location),
  attached_to_space: ElementIdSchema.optional(),
  /** HPXML FloorOrCeiling; required when both adjacent spaces are conditioned-ish. */
  floor_or_ceiling: field(z.enum(["floor", "ceiling"])).optional(),
  area: quantityOf("ft2"),
  insulation_assembly_r_value: quantityOf("h-ft2-F/Btu"),
});

export const SlabSchema = z.strictObject({
  id: ElementIdSchema,
  interior_adjacent_to: field(Location),
  attached_to_space: ElementIdSchema.optional(),
  area: quantityOf("ft2"),
  thickness: quantityOf("in"),
  exposed_perimeter: quantityOf("ft"),
  perimeter_insulation_r_value: quantityOf("h-ft2-F/Btu"),
  perimeter_insulation_depth: quantityOf("ft"),
  under_slab_insulation_r_value: quantityOf("h-ft2-F/Btu"),
  under_slab_insulation_width: quantityOf("ft").optional(),
  carpet_fraction: quantityOf("fraction"),
  carpet_r_value: quantityOf("h-ft2-F/Btu"),
});

export const OverhangsSchema = z.strictObject({
  depth: quantityOf("ft"),
  distance_to_top_of_window: quantityOf("ft"),
  distance_to_bottom_of_window: quantityOf("ft"),
});

export const WindowSchema = z.strictObject({
  id: ElementIdSchema,
  attached_to_wall: ElementIdSchema,
  area: quantityOf("ft2"),
  azimuth: quantityOf("degrees"),
  ufactor: quantityOf("Btu/h-ft2-F"),
  shgc: quantityOf("fraction"),
  interior_shading: field(z.enum(WINDOW_INTERIOR_SHADING)).optional(),
  overhangs: OverhangsSchema.optional(),
  /** HPXML FractionOperable; defaults are an engine policy, so it is explicit here. */
  fraction_operable: quantityOf("fraction").optional(),
});

export const DoorSchema = z.strictObject({
  id: ElementIdSchema,
  attached_to_wall: ElementIdSchema,
  area: quantityOf("ft2"),
  azimuth: quantityOf("degrees"),
  r_value: quantityOf("h-ft2-F/Btu"),
});

export const EnclosureSchema = z.strictObject({
  air_infiltration: AirInfiltrationSchema,
  attics: z.array(AtticSchema),
  foundations: z.array(FoundationSchema),
  roofs: z.array(RoofSchema),
  walls: z.array(WallSchema),
  floors: z.array(FloorSchema),
  slabs: z.array(SlabSchema),
  windows: z.array(WindowSchema),
  doors: z.array(DoorSchema),
});
export type Enclosure = z.output<typeof EnclosureSchema>;
