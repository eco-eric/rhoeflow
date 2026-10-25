import { z } from "zod";
import { field, quantity, quantityOf } from "../provenance.js";
import { ElementIdSchema } from "../ids.js";
import {
  AIR_DISTRIBUTION_TYPES,
  BACKUP_TYPES,
  COMPRESSOR_TYPES,
  COOLING_EFFICIENCY_UNITS,
  COOLING_SYSTEM_TYPES,
  DISTRIBUTION_SYSTEM_TYPES,
  DUCT_LEAKAGE_TOTAL_OR_OUTSIDE,
  DUCT_TYPES,
  FUEL_TYPES,
  HEATING_SYSTEM_TYPES,
  HEAT_PUMP_HEATING_EFFICIENCY_UNITS,
  HEAT_PUMP_SIZING_METHODOLOGIES,
  HEAT_PUMP_TYPES,
  HPXML_LOCATIONS,
} from "./enums.js";

/**
 * HPXML Systems/HVAC, block-load subset (ADR-023).
 *
 * Existing equipment here is an engineering input (capacity, efficiency, distribution),
 * not the equipment registry: model and serial stay in WorkEdge (ADR-028) and a system's
 * `source` cites the WorkEdge equipment id it was read from.
 *
 * `x_served_zone_ids` is a RhoeFlow extension (HPXML allows `extension` elements) that
 * makes "which zones does this system serve" explicit (DAT-002, ADR-007).
 */

const Location = z.enum(HPXML_LOCATIONS);

/**
 * Rated efficiencies. HPXML carries Units + Value; here the quantity's own unit plays the
 * Units role, so AFUE and SEER2 cannot be mixed by accident. "Percent" in HPXML is the
 * "fraction" unit here (PRV-003: no bare percentages).
 */
const HeatingEfficiency = quantity(["AFUE", "fraction"]);
const CoolingEfficiency = quantity(COOLING_EFFICIENCY_UNITS);
const HeatPumpHeatingEfficiency = quantity(HEAT_PUMP_HEATING_EFFICIENCY_UNITS);

export const HeatingSystemSchema = z.strictObject({
  id: ElementIdSchema,
  heating_system_type: field(z.enum(HEATING_SYSTEM_TYPES)),
  heating_system_fuel: field(z.enum(FUEL_TYPES)),
  heating_capacity: quantityOf("Btu/h").optional(),
  annual_heating_efficiency: HeatingEfficiency.optional(),
  fraction_heat_load_served: quantityOf("fraction"),
  distribution_system: ElementIdSchema.optional(),
  x_served_zone_ids: z.array(ElementIdSchema).optional(),
});

export const CoolingSystemSchema = z.strictObject({
  id: ElementIdSchema,
  cooling_system_type: field(z.enum(COOLING_SYSTEM_TYPES)),
  cooling_system_fuel: field(z.enum(FUEL_TYPES)),
  cooling_capacity: quantityOf("Btu/h").optional(),
  compressor_type: field(z.enum(COMPRESSOR_TYPES)).optional(),
  annual_cooling_efficiency: CoolingEfficiency.optional(),
  fraction_cool_load_served: quantityOf("fraction"),
  distribution_system: ElementIdSchema.optional(),
  x_served_zone_ids: z.array(ElementIdSchema).optional(),
});

export const HeatPumpSchema = z.strictObject({
  id: ElementIdSchema,
  heat_pump_type: field(z.enum(HEAT_PUMP_TYPES)),
  heat_pump_fuel: field(z.enum(FUEL_TYPES)),
  heating_capacity: quantityOf("Btu/h").optional(),
  cooling_capacity: quantityOf("Btu/h").optional(),
  compressor_type: field(z.enum(COMPRESSOR_TYPES)).optional(),
  backup_type: field(z.enum(BACKUP_TYPES)).optional(),
  backup_system_fuel: field(z.enum(FUEL_TYPES)).optional(),
  backup_heating_capacity: quantityOf("Btu/h").optional(),
  annual_cooling_efficiency: CoolingEfficiency.optional(),
  annual_heating_efficiency: HeatPumpHeatingEfficiency.optional(),
  fraction_heat_load_served: quantityOf("fraction"),
  fraction_cool_load_served: quantityOf("fraction"),
  distribution_system: ElementIdSchema.optional(),
  x_served_zone_ids: z.array(ElementIdSchema).optional(),
});

/**
 * HPXML DuctLeakageMeasurement. HPXML's Units (CFM25 | CFM50 | Percent) is carried by the
 * quantity's own unit (cfm25 | cfm50 | fraction); the serializer maps fraction -> Percent.
 * A per-100 ft2 rate is not representable here on purpose: converting it needs the served
 * floor area and is a WO-02 derivation, not a template default.
 */
export const DuctLeakageMeasurementSchema = z.strictObject({
  duct_type: field(z.enum(DUCT_TYPES)),
  value: quantity(["cfm25", "cfm50", "fraction"]),
  total_or_to_outside: field(z.enum(DUCT_LEAKAGE_TOTAL_OR_OUTSIDE)),
});

export const DuctSchema = z.strictObject({
  id: ElementIdSchema,
  duct_type: field(z.enum(DUCT_TYPES)),
  duct_insulation_r_value: quantityOf("h-ft2-F/Btu"),
  duct_location: field(Location),
  /** HPXML FractionDuctArea or DuctSurfaceArea; block load needs one of them. */
  duct_fraction_area: quantityOf("fraction").optional(),
  duct_surface_area: quantityOf("ft2").optional(),
});

export const HvacDistributionSchema = z.strictObject({
  id: ElementIdSchema,
  distribution_system_type: field(z.enum(DISTRIBUTION_SYSTEM_TYPES)),
  air_distribution_type: field(z.enum(AIR_DISTRIBUTION_TYPES)).optional(),
  duct_leakage_measurements: z.array(DuctLeakageMeasurementSchema),
  ducts: z.array(DuctSchema),
  conditioned_floor_area_served: quantityOf("ft2").optional(),
  number_of_return_registers: quantityOf("count").optional(),
});

/** HPXML HVACControl: setpoints only; schedules are an energy-model concern. */
export const HvacControlSchema = z.strictObject({
  id: ElementIdSchema,
  heating_setpoint: quantityOf("F"),
  cooling_setpoint: quantityOf("F"),
});

/**
 * HPXML HVACSizingControl and its ManualJInputs. Required in every Assessment so the
 * sizing policy and design conditions are explicit, sourced inputs (ADR-005, ENG-003/004;
 * plan §Era-based defaults). The engine never fills these in.
 */
export const HvacSizingControlSchema = z.strictObject({
  heat_pump_sizing_methodology: field(z.enum(HEAT_PUMP_SIZING_METHODOLOGIES)),
  allow_increased_fixed_capacities: field(z.boolean()),
  manualj_inputs: z.strictObject({
    heating_design_temperature: quantityOf("F"),
    cooling_design_temperature: quantityOf("F"),
    daily_temperature_range: field(z.enum(["low", "medium", "high"])),
    humidity_setpoint: quantityOf("fraction"),
    /** Design grains difference, outdoor minus indoor; derived from the weather station's MCWB when absent. */
    humidity_difference: quantityOf("grains").optional(),
    internal_loads_sensible: quantityOf("Btu/h"),
    internal_loads_latent: quantityOf("Btu/h"),
    number_of_occupants: quantityOf("count"),
  }),
});

export const HvacSchema = z.strictObject({
  heating_systems: z.array(HeatingSystemSchema),
  cooling_systems: z.array(CoolingSystemSchema),
  heat_pumps: z.array(HeatPumpSchema),
  hvac_control: HvacControlSchema.optional(),
  hvac_distributions: z.array(HvacDistributionSchema),
  hvac_sizing_control: HvacSizingControlSchema,
});
export type Hvac = z.output<typeof HvacSchema>;

export const SystemsSchema = z.strictObject({
  hvac: HvacSchema,
});
export type Systems = z.output<typeof SystemsSchema>;
