import { z } from "zod";
import { BuildingConstructionSchema, ClimateAndRiskZonesSchema, SiteSchema } from "./site.js";
import { EnclosureSchema } from "./enclosure.js";
import { SystemsSchema } from "./systems.js";
import { ZoneSchema } from "./zones.js";

/**
 * The HPXML-shaped building model that is the canonical captured-house record inside an
 * Assessment (ADR-023). Shaped after HPXML v4 / OpenStudio-HPXML element names; the XML
 * serializer arrives with the engine port (WO-02), not here.
 */
export const HpxmlBuildingSchema = z.strictObject({
  /** HPXML schema version these element names follow. */
  hpxml_version: z.literal("4.0"),
  site: SiteSchema,
  building_construction: BuildingConstructionSchema,
  climate_and_risk_zones: ClimateAndRiskZonesSchema,
  zones: z.array(ZoneSchema),
  enclosure: EnclosureSchema,
  systems: SystemsSchema,
});
export type HpxmlBuilding = z.output<typeof HpxmlBuildingSchema>;
export type HpxmlBuildingInput = z.input<typeof HpxmlBuildingSchema>;

export * from "./enums.js";
export * from "./site.js";
export * from "./enclosure.js";
export * from "./systems.js";
export * from "./zones.js";
