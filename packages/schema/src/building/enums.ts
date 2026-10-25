/**
 * Enumerations shaped after HPXML v4 as used by OpenStudio-HPXML (ADR-023).
 * Element names are snake_cased HPXML names; string values are HPXML's own spellings so
 * the later XML serializer is a rename, not a translation. Subsets only: a value is added
 * when a work order needs it, never speculatively (OWN-004).
 */

export const HPXML_LOCATIONS = [
  "conditioned space",
  "attic - vented",
  "attic - unvented",
  "basement - conditioned",
  "basement - unconditioned",
  "crawlspace - vented",
  "crawlspace - unvented",
  "crawlspace - conditioned",
  "garage",
  "outside",
  "ground",
] as const;
export type HpxmlLocation = (typeof HPXML_LOCATIONS)[number];

export const RESIDENTIAL_FACILITY_TYPES = [
  "single-family detached",
  "single-family attached",
  "apartment unit",
  "manufactured home",
] as const;

export const SITE_SHIELDING = ["normal", "exposed", "well-shielded"] as const;

/** HPXML Site/SiteType; feeds the Manual J infiltration shielding class. */
export const SITE_TYPES = ["suburban", "urban", "rural"] as const;

/** HPXML Site/Soil SoilType and MoistureType; set the ground conductivity for slab losses. */
export const SOIL_TYPES = ["unknown", "clay", "gravel", "loam", "sand", "silt", "other"] as const;
export const SOIL_MOISTURE_TYPES = ["mixed", "wet", "dry"] as const;

export const IECC_CLIMATE_ZONES = [
  "1A",
  "2A",
  "2B",
  "3A",
  "3B",
  "3C",
  "4A",
  "4B",
  "4C",
  "5A",
  "5B",
  "6A",
  "6B",
  "7",
  "8",
] as const;

export const ATTIC_TYPES = ["vented", "unvented", "conditioned"] as const;

/** HPXML Floor/FloorType (required by HPXML for every floor and ceiling). */
export const FLOOR_TYPES = ["wood frame", "steel frame", "structurally insulated panel", "solid concrete"] as const;

export const FOUNDATION_TYPES = [
  "slab-on-grade",
  "vented crawlspace",
  "unvented crawlspace",
  "conditioned crawlspace",
  "conditioned basement",
  "unconditioned basement",
  "ambient",
] as const;

export const WALL_TYPES = [
  "wood stud",
  "double wood stud",
  "concrete masonry unit",
  "structural brick",
  "steel frame",
  "insulated concrete forms",
  "structurally insulated panel",
  "log wall",
  "stone",
  "solid concrete",
  "adobe",
] as const;

/** HPXML FoundationWall/Type (needed for vented crawlspaces, WO-03 B1). */
export const FOUNDATION_WALL_TYPES = [
  "solid concrete",
  "concrete block",
  "concrete block foam core",
  "concrete block perlite core",
  "concrete block vermiculite core",
  "concrete block solid core",
  "double brick",
  "wood",
] as const;

export const ROOF_TYPES = [
  "asphalt or fiberglass shingles",
  "wood shingles or shakes",
  "slate or tile shingles",
  "metal surfacing",
  "concrete",
  "cool roof",
] as const;

export const SIDING_TYPES = [
  "wood siding",
  "vinyl siding",
  "aluminum siding",
  "fiber cement siding",
  "brick veneer",
  "stucco",
  "masonite siding",
  "synthetic stucco",
  "none",
] as const;

/** HPXML v5 Window/InteriorShading/Type values (engine supports all but "other"). */
export const WINDOW_INTERIOR_SHADING = [
  "not present",
  "light curtains",
  "medium curtains",
  "dark curtains",
  "light shades",
  "medium shades",
  "dark shades",
  "light blinds",
  "medium blinds",
  "dark blinds",
  "other",
] as const;

export const HEATING_SYSTEM_TYPES = [
  "Furnace",
  "WallFurnace",
  "FloorFurnace",
  "ElectricResistance",
  "Boiler",
  "Stove",
  "SpaceHeater",
  "Fireplace",
] as const;

export const COOLING_SYSTEM_TYPES = [
  "central air conditioner",
  "room air conditioner",
  "evaporative cooler",
  "mini-split",
  "packaged terminal air conditioner",
] as const;

export const HEAT_PUMP_TYPES = ["air-to-air", "mini-split", "ground-to-air", "packaged terminal heat pump"] as const;

export const FUEL_TYPES = ["electricity", "natural gas", "propane", "fuel oil", "wood"] as const;

export const COMPRESSOR_TYPES = ["single stage", "two stage", "variable speed"] as const;

export const HEATING_EFFICIENCY_UNITS = ["AFUE", "Percent"] as const;
export const COOLING_EFFICIENCY_UNITS = ["SEER", "SEER2", "EER", "EER2"] as const;
export const HEAT_PUMP_HEATING_EFFICIENCY_UNITS = ["HSPF", "HSPF2", "COP"] as const;

export const BACKUP_TYPES = ["integrated", "separate"] as const;

export const DISTRIBUTION_SYSTEM_TYPES = ["AirDistribution", "HydronicDistribution", "DSE"] as const;
export const AIR_DISTRIBUTION_TYPES = ["regular velocity", "gravity", "fan coil"] as const;
export const DUCT_TYPES = ["supply", "return"] as const;
export const DUCT_LEAKAGE_TOTAL_OR_OUTSIDE = ["to outside", "total"] as const;

/**
 * Heat-pump sizing methodology as OpenStudio-HPXML spells it. HPXML defaults this to HERS
 * when absent (ADR-005); RhoeFlow makes it a required, sourced field so no autosizing
 * policy is ever inherited silently (ENG-004).
 */
export const HEAT_PUMP_SIZING_METHODOLOGIES = ["ACCA", "HERS", "MaxLoad"] as const;

export const ZONE_TYPES = ["conditioned", "unconditioned"] as const;
