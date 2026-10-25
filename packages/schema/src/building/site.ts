import { z } from "zod";
import { field, quantityOf } from "../provenance.js";
import { ElementIdSchema } from "../ids.js";
import {
  IECC_CLIMATE_ZONES,
  RESIDENTIAL_FACILITY_TYPES,
  SITE_SHIELDING,
} from "./enums.js";

/** HPXML Building/Site. */
export const SiteSchema = z.strictObject({
  /** Azimuth of the front of the home, degrees clockwise from north. */
  azimuth_of_front_of_home: quantityOf("degrees"),
  shielding_of_home: field(z.enum(SITE_SHIELDING)),
});
export type Site = z.output<typeof SiteSchema>;

/**
 * HPXML BuildingSummary/BuildingConstruction.
 *
 * `year_built` and `conditioned_floor_area` are engineering inputs that the WorkEdge
 * Property record also knows. They are not a copy of that record (ADR-028): they are the
 * values the calculation was frozen against, carrying a `documented` state whose source
 * cites the WorkEdge property id (e.g. `workedge:property:<id>.year_built`). If WorkEdge
 * changes, the run goes stale; it is never silently rewritten.
 */
export const BuildingConstructionSchema = z.strictObject({
  year_built: quantityOf("year"),
  residential_facility_type: field(z.enum(RESIDENTIAL_FACILITY_TYPES)),
  number_of_conditioned_floors: quantityOf("count"),
  number_of_conditioned_floors_above_grade: quantityOf("count"),
  number_of_bedrooms: quantityOf("count"),
  conditioned_floor_area: quantityOf("ft2"),
  average_ceiling_height: quantityOf("ft"),
  conditioned_building_volume: quantityOf("ft3").optional(),
});
export type BuildingConstruction = z.output<typeof BuildingConstructionSchema>;

/** HPXML ClimateandRiskZones. Weather station is a reference, not a weather file. */
export const ClimateAndRiskZonesSchema = z.strictObject({
  iecc_climate_zone: field(z.enum(IECC_CLIMATE_ZONES)),
  /** IECC year the zone designation comes from (zones moved between editions). */
  iecc_year: quantityOf("year"),
  weather_station: z.strictObject({
    id: ElementIdSchema,
    /** Station name as the weather library spells it, e.g. "Dallas Fort Worth Intl AP". */
    name: field(z.string().min(1)),
    /** WMO or library key; the weather library version is pinned on the run, not here. */
    station_key: field(z.string().min(1)),
  }),
});
export type ClimateAndRiskZones = z.output<typeof ClimateAndRiskZonesSchema>;
