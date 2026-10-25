/**
 * Assessment → HPXML 5.0 (namespace http://hpxmlonline.com/2025/12), the input format of the
 * pinned OpenStudio-HPXML v1.12.0 oracle (ADR-023, ADR-004; WO-02 Track C, item C1).
 *
 * Rules:
 * - Only accepted fields are written (the same `proposed` / `unknown` refusal as the engine).
 * - Element names and order follow the oracle's own in.xml so the file validates against the
 *   HPXML schema and the oracle's Schematron.
 * - ManualJInputs, the heat-pump sizing methodology and the infiltration shielding class are
 *   always written, so the oracle never chooses a design condition or sizing policy silently
 *   (ADR-005, ADR-034).
 * - Sections the block load does not need (water heating, appliances, lighting, plug loads)
 *   are not written; R01 showed they are optional and do not change design loads.
 *
 * Unit mapping: quantity units carry HPXML's Units element (AFUE / SEER / … ; fraction →
 * Percent; cfm25 → CFM25); ACH50 → UnitofMeasure ACH with HousePressure.
 */
import { isAcceptedInput, type Assessment, type Field, type Unit } from "@rhoeflow/schema";
import { el, renderXml, text, type XmlElement } from "./xml.js";

export const HPXML_NAMESPACE = "http://hpxmlonline.com/2025/12";
export const HPXML_SCHEMA_VERSION = "5.0";
export const SERIALIZER_VERSION = "0.1.0";

export class HpxmlSerializationError extends Error {
  readonly code: "unaccepted_input" | "missing_input" | "unsupported";
  readonly path: string;
  constructor(code: HpxmlSerializationError["code"], message: string, path: string) {
    super(`${path}: ${message}`);
    this.name = "HpxmlSerializationError";
    this.code = code;
    this.path = path;
  }
}

export interface WeatherFileRef {
  /** EPW file name inside the oracle's weather directory. */
  epwFile: string;
  /** Two-letter state code for Building/Site/Address. */
  stateCode: string;
}

type AnyField = Field<unknown> & { unit?: Unit };

function req<T>(f: Field<T> | undefined, path: string): NonNullable<T> {
  if (f === undefined) throw new HpxmlSerializationError("missing_input", "required for HPXML", path);
  if (!isAcceptedInput(f as AnyField) || f.value === null || f.value === undefined) {
    const why = f.state === "unknown" ? `unknown (${f.reason})` : `${f.state}, not accepted`;
    throw new HpxmlSerializationError("unaccepted_input", `is ${why}`, path);
  }
  return f.value as NonNullable<T>;
}
function opt<T>(f: Field<T> | undefined, path: string): NonNullable<T> | undefined {
  return f === undefined ? undefined : req(f, path);
}
function unitOf(f: AnyField | undefined): Unit | undefined {
  return f?.unit;
}

const WALL_TYPE_ELEMENT: Record<string, string> = {
  "wood stud": "WoodStud",
  "double wood stud": "DoubleWoodStud",
  "concrete masonry unit": "ConcreteMasonryUnit",
  "structural brick": "StructuralBrick",
  "steel frame": "SteelFrame",
  "insulated concrete forms": "InsulatedConcreteForms",
  "structurally insulated panel": "StructuralInsulatedPanel",
  "log wall": "LogWall",
  stone: "Stone",
  "solid concrete": "SolidConcrete",
  adobe: "Adobe",
};
const FLOOR_TYPE_ELEMENT: Record<string, string> = {
  "wood frame": "WoodFrame",
  "steel frame": "SteelFrame",
  "structurally insulated panel": "StructuralInsulatedPanel",
  "solid concrete": "SolidConcrete",
};
const EFFICIENCY_UNITS: Partial<Record<Unit, string>> = {
  AFUE: "AFUE",
  fraction: "Percent",
  SEER: "SEER",
  SEER2: "SEER2",
  EER: "EER",
  EER2: "EER2",
  HSPF: "HSPF",
  HSPF2: "HSPF2",
  COP: "COP",
};
const DUCT_LEAKAGE_UNITS: Partial<Record<Unit, string>> = { fraction: "Percent", cfm25: "CFM25", cfm50: "CFM50" };

function foundationType(t: string, path: string): XmlElement {
  switch (t) {
    case "slab-on-grade":
      return el("FoundationType", el("SlabOnGrade"));
    case "vented crawlspace":
      return el("FoundationType", el("Crawlspace", text("Vented", true)));
    case "unvented crawlspace":
      return el("FoundationType", el("Crawlspace", text("Vented", false)));
    case "conditioned crawlspace":
      return el("FoundationType", el("Crawlspace", text("Conditioned", true)));
    case "conditioned basement":
      return el("FoundationType", el("Basement", text("Conditioned", true)));
    case "unconditioned basement":
      return el("FoundationType", el("Basement", text("Conditioned", false)));
    case "ambient":
      return el("FoundationType", el("Ambient"));
    default:
      throw new HpxmlSerializationError("unsupported", `foundation type "${t}"`, path);
  }
}

function atticType(t: string): XmlElement {
  if (t === "conditioned") return el("AtticType", el("Attic", text("Conditioned", true)));
  return el("AtticType", el("Attic", text("Vented", t === "vented")));
}

/** Manual J infiltration shielding class (OpenStudio-HPXML defaults.rb 369 to 391), written explicitly. */
export function manualJShieldingClass(shielding: string, siteType: string): number {
  let c = 4;
  if (shielding === "well-shielded") c += 1;
  else if (shielding === "exposed") c -= 1;
  if (siteType === "urban") c += 1;
  else if (siteType === "rural") c -= 1;
  return Math.min(5, Math.max(1, c));
}

export function assessmentToHpxml(assessment: Assessment, weather: WeatherFileRef): string {
  const b = assessment.building;
  const P = "building";
  const e = b.enclosure;
  const hvac = b.systems.hvac;
  const bc = b.building_construction;

  if (b.zones.some((z) => z.spaces.length > 0)) {
    throw new HpxmlSerializationError("unsupported", "zones with spaces (room-level loads) are not serialized in 0.1.0", `${P}.zones`);
  }

  // ------------------------------------------------------------- BuildingSummary
  const site = el(
    "Site",
    text("SiteType", req(b.site.site_type, `${P}.site.site_type`)),
    text("ShieldingofHome", req(b.site.shielding_of_home, `${P}.site.shielding_of_home`)),
    text("AzimuthOfFrontOfHome", req(b.site.azimuth_of_front_of_home, `${P}.site.azimuth_of_front_of_home`)),
    b.site.soil_type || b.site.moisture_type
      ? el("Soil", text("SoilType", opt(b.site.soil_type, `${P}.site.soil_type`)), text("MoistureType", opt(b.site.moisture_type, `${P}.site.moisture_type`)))
      : null,
  );
  const buildingConstruction = el(
    "BuildingConstruction",
    text("YearBuilt", opt(bc.year_built, `${P}.building_construction.year_built`)),
    text("ResidentialFacilityType", req(bc.residential_facility_type, `${P}.building_construction.residential_facility_type`)),
    text("NumberofConditionedFloors", req(bc.number_of_conditioned_floors, `${P}.building_construction.number_of_conditioned_floors`)),
    text("NumberofConditionedFloorsAboveGrade", req(bc.number_of_conditioned_floors_above_grade, `${P}.building_construction.number_of_conditioned_floors_above_grade`)),
    text("AverageCeilingHeight", req(bc.average_ceiling_height, `${P}.building_construction.average_ceiling_height`)),
    text("NumberofBedrooms", req(bc.number_of_bedrooms, `${P}.building_construction.number_of_bedrooms`)),
    text("ConditionedFloorArea", req(bc.conditioned_floor_area, `${P}.building_construction.conditioned_floor_area`)),
    text("ConditionedBuildingVolume", opt(bc.conditioned_building_volume, `${P}.building_construction.conditioned_building_volume`)),
  );

  const sc = hvac.hvac_sizing_control;
  const scP = `${P}.systems.hvac.hvac_sizing_control`;
  const mj = sc.manualj_inputs;
  const control = hvac.hvac_control;
  if (!control) throw new HpxmlSerializationError("missing_input", "setpoints are required", `${P}.systems.hvac.hvac_control`);
  const leakageUnit = e.air_infiltration.air_leakage.unit;
  const sizingControl = el(
    "HVACSizingControl",
    text("HeatPumpSizingMethodology", req(sc.heat_pump_sizing_methodology, `${scP}.heat_pump_sizing_methodology`)),
    text("AllowIncreasedFixedCapacities", req(sc.allow_increased_fixed_capacities, `${scP}.allow_increased_fixed_capacities`)),
    el(
      "ManualJInputs",
      text("HeatingDesignTemperature", req(mj.heating_design_temperature, `${scP}.manualj_inputs.heating_design_temperature`)),
      text("CoolingDesignTemperature", req(mj.cooling_design_temperature, `${scP}.manualj_inputs.cooling_design_temperature`)),
      text("DailyTemperatureRange", req(mj.daily_temperature_range, `${scP}.manualj_inputs.daily_temperature_range`)),
      text("HeatingSetpoint", req(control.heating_setpoint, `${P}.systems.hvac.hvac_control.heating_setpoint`)),
      text("CoolingSetpoint", req(control.cooling_setpoint, `${P}.systems.hvac.hvac_control.cooling_setpoint`)),
      text("HumiditySetpoint", req(mj.humidity_setpoint, `${scP}.manualj_inputs.humidity_setpoint`)),
      text("HumidityDifference", opt(mj.humidity_difference, `${scP}.manualj_inputs.humidity_difference`)),
      text("InternalLoadsSensible", req(mj.internal_loads_sensible, `${scP}.manualj_inputs.internal_loads_sensible`)),
      text("InternalLoadsLatent", req(mj.internal_loads_latent, `${scP}.manualj_inputs.internal_loads_latent`)),
      text("NumberofOccupants", req(mj.number_of_occupants, `${scP}.manualj_inputs.number_of_occupants`)),
      text("InfiltrationShieldingClass", manualJShieldingClass(req(b.site.shielding_of_home, `${P}.site.shielding_of_home`), req(b.site.site_type, `${P}.site.site_type`))),
      text("InfiltrationMethod", leakageUnit === "ACHnatural" ? null : "blower door"),
    ),
  );

  // ------------------------------------------------------------- Climate
  const cz = b.climate_and_risk_zones;
  const climate = el(
    "ClimateandRiskZones",
    el("ClimateZoneIECC", text("Year", req(cz.iecc_year, `${P}.climate_and_risk_zones.iecc_year`)), text("ClimateZone", req(cz.iecc_climate_zone, `${P}.climate_and_risk_zones.iecc_climate_zone`))),
    el(
      "WeatherStation",
      el("SystemIdentifier", { id: cz.weather_station.id }),
      text("Name", weather.epwFile.replace(/\.epw$/i, "")),
      el("extension", text("EPWFilePath", weather.epwFile)),
    ),
  );

  // ------------------------------------------------------------- Enclosure
  const ai = e.air_infiltration;
  const aiP = `${P}.enclosure.air_infiltration`;
  const leakage = req(ai.air_leakage, `${aiP}.air_leakage`);
  const airInfiltration = el(
    "AirInfiltration",
    el(
      "AirInfiltrationMeasurement",
      el("SystemIdentifier", { id: ai.id }),
      leakageUnit === "ACHnatural" ? null : text("HousePressure", req(ai.house_pressure, `${aiP}.house_pressure`)),
      el("BuildingAirLeakage", text("UnitofMeasure", leakageUnit === "ACH50" ? "ACH" : leakageUnit === "cfm50" ? "CFM" : "ACHnatural"), text("AirLeakage", leakage)),
      text("InfiltrationVolume", opt(bc.conditioned_building_volume, `${P}.building_construction.conditioned_building_volume`)),
    ),
  );

  const attics = e.attics.map((a) => el("Attic", el("SystemIdentifier", { id: a.id }), atticType(req(a.attic_type, `${P}.enclosure.attics[].attic_type`))));
  const foundations = e.foundations.map((f, i) => el("Foundation", el("SystemIdentifier", { id: f.id }), foundationType(req(f.foundation_type, `${P}.enclosure.foundations[${i}].foundation_type`), `${P}.enclosure.foundations[${i}]`)));

  const roofs = e.roofs.map((r, i) => {
    const rp = `${P}.enclosure.roofs[${i}]`;
    return el(
      "Roof",
      el("SystemIdentifier", { id: r.id }),
      text("InteriorAdjacentTo", req(r.interior_adjacent_to, `${rp}.interior_adjacent_to`)),
      text("Area", req(r.area, `${rp}.area`)),
      text("Azimuth", opt(r.azimuth, `${rp}.azimuth`)),
      text("RoofType", req(r.roof_type, `${rp}.roof_type`)),
      text("SolarAbsorptance", req(r.solar_absorptance, `${rp}.solar_absorptance`)),
      text("Emittance", req(r.emittance, `${rp}.emittance`)),
      text("Pitch", req(r.pitch, `${rp}.pitch`)),
      text("RadiantBarrier", req(r.radiant_barrier, `${rp}.radiant_barrier`)),
      el("Insulation", el("SystemIdentifier", { id: `${r.id}Insulation` }), text("AssemblyEffectiveRValue", req(r.insulation_assembly_r_value, `${rp}.insulation_assembly_r_value`))),
    );
  });
  if (e.roofs.some((r, i) => req(r.radiant_barrier, `${P}.enclosure.roofs[${i}].radiant_barrier`))) {
    throw new HpxmlSerializationError("unsupported", "radiant barriers need a grade, which the schema does not carry yet", `${P}.enclosure.roofs`);
  }

  const walls = e.walls.map((w, i) => {
    const wp = `${P}.enclosure.walls[${i}]`;
    const wt = req(w.wall_type, `${wp}.wall_type`);
    const siding = req(w.siding, `${wp}.siding`);
    return el(
      "Wall",
      el("SystemIdentifier", { id: w.id }),
      text("ExteriorAdjacentTo", req(w.exterior_adjacent_to, `${wp}.exterior_adjacent_to`)),
      text("InteriorAdjacentTo", req(w.interior_adjacent_to, `${wp}.interior_adjacent_to`)),
      el("WallType", el(WALL_TYPE_ELEMENT[wt]!)),
      text("Area", req(w.area, `${wp}.area`)),
      text("Azimuth", req(w.azimuth, `${wp}.azimuth`)),
      text("Siding", siding === "none" ? "not present" : siding),
      text("SolarAbsorptance", req(w.solar_absorptance, `${wp}.solar_absorptance`)),
      text("Emittance", req(w.emittance, `${wp}.emittance`)),
      el("Insulation", el("SystemIdentifier", { id: `${w.id}Insulation` }), text("AssemblyEffectiveRValue", req(w.insulation_assembly_r_value, `${wp}.insulation_assembly_r_value`))),
    );
  });

  const floors = e.floors.map((f, i) => {
    const fp = `${P}.enclosure.floors[${i}]`;
    return el(
      "Floor",
      el("SystemIdentifier", { id: f.id }),
      text("ExteriorAdjacentTo", req(f.exterior_adjacent_to, `${fp}.exterior_adjacent_to`)),
      text("InteriorAdjacentTo", req(f.interior_adjacent_to, `${fp}.interior_adjacent_to`)),
      text("FloorOrCeiling", opt(f.floor_or_ceiling, `${fp}.floor_or_ceiling`)),
      el("FloorType", el(FLOOR_TYPE_ELEMENT[req(f.floor_type, `${fp}.floor_type`)]!)),
      text("Area", req(f.area, `${fp}.area`)),
      el("Insulation", el("SystemIdentifier", { id: `${f.id}Insulation` }), text("AssemblyEffectiveRValue", req(f.insulation_assembly_r_value, `${fp}.insulation_assembly_r_value`))),
    );
  });

  const slabs = e.slabs.map((s, i) => {
    const sp = `${P}.enclosure.slabs[${i}]`;
    const underR = req(s.under_slab_insulation_r_value, `${sp}.under_slab_insulation_r_value`);
    const underW = s.under_slab_insulation_width ? req(s.under_slab_insulation_width, `${sp}.under_slab_insulation_width`) : underR > 0 ? undefined : 0;
    if (underW === undefined) throw new HpxmlSerializationError("missing_input", "under-slab insulation width is required when its R-value is above zero", `${sp}.under_slab_insulation_width`);
    return el(
      "Slab",
      el("SystemIdentifier", { id: s.id }),
      text("InteriorAdjacentTo", req(s.interior_adjacent_to, `${sp}.interior_adjacent_to`)),
      text("Area", req(s.area, `${sp}.area`)),
      text("Thickness", req(s.thickness, `${sp}.thickness`)),
      text("ExposedPerimeter", req(s.exposed_perimeter, `${sp}.exposed_perimeter`)),
      el(
        "PerimeterInsulation",
        el("SystemIdentifier", { id: `${s.id}PerimeterInsulation` }),
        el("Layer", text("NominalRValue", req(s.perimeter_insulation_r_value, `${sp}.perimeter_insulation_r_value`)), text("InsulationDepth", req(s.perimeter_insulation_depth, `${sp}.perimeter_insulation_depth`))),
      ),
      el("UnderSlabInsulation", el("SystemIdentifier", { id: `${s.id}UnderSlabInsulation` }), el("Layer", text("NominalRValue", underR), text("InsulationWidth", underW))),
      el("extension", text("CarpetFraction", req(s.carpet_fraction, `${sp}.carpet_fraction`)), text("CarpetRValue", req(s.carpet_r_value, `${sp}.carpet_r_value`))),
    );
  });

  const windows = e.windows.map((w, i) => {
    const wp = `${P}.enclosure.windows[${i}]`;
    const shading = opt(w.interior_shading, `${wp}.interior_shading`);
    return el(
      "Window",
      el("SystemIdentifier", { id: w.id }),
      text("Area", req(w.area, `${wp}.area`)),
      text("Azimuth", req(w.azimuth, `${wp}.azimuth`)),
      text("UFactor", req(w.ufactor, `${wp}.ufactor`)),
      text("SHGC", req(w.shgc, `${wp}.shgc`)),
      shading
        ? el("InteriorShading", el("SystemIdentifier", { id: `${w.id}InteriorShading` }), text("Type", shading), text("SummerFractionCovered", opt(w.interior_shading_summer_coverage, `${wp}.interior_shading_summer_coverage`)))
        : null,
      w.overhangs
        ? el(
            "Overhangs",
            text("Depth", req(w.overhangs.depth, `${wp}.overhangs.depth`)),
            text("DistanceToTopOfWindow", req(w.overhangs.distance_to_top_of_window, `${wp}.overhangs.distance_to_top_of_window`)),
            text("DistanceToBottomOfWindow", req(w.overhangs.distance_to_bottom_of_window, `${wp}.overhangs.distance_to_bottom_of_window`)),
          )
        : null,
      text("FractionOperable", opt(w.fraction_operable, `${wp}.fraction_operable`)),
      el("AttachedToWall", { idref: w.attached_to_wall }),
    );
  });

  const doors = e.doors.map((d, i) => {
    const dp = `${P}.enclosure.doors[${i}]`;
    return el(
      "Door",
      el("SystemIdentifier", { id: d.id }),
      el("AttachedToWall", { idref: d.attached_to_wall }),
      text("Area", req(d.area, `${dp}.area`)),
      text("Azimuth", req(d.azimuth, `${dp}.azimuth`)),
      text("RValue", req(d.r_value, `${dp}.r_value`)),
    );
  });

  const nonEmpty = (name: string, items: XmlElement[]) => (items.length > 0 ? el(name, items) : null);
  const enclosure = el(
    "Enclosure",
    airInfiltration,
    nonEmpty("Attics", attics),
    nonEmpty("Foundations", foundations),
    nonEmpty("Roofs", roofs),
    nonEmpty("Walls", walls),
    nonEmpty("Floors", floors),
    nonEmpty("Slabs", slabs),
    nonEmpty("Windows", windows),
    nonEmpty("Doors", doors),
  );

  // ------------------------------------------------------------- Systems
  const efficiency = (name: string, f: AnyField | undefined, path: string) => {
    if (!f) return null;
    const v = req(f, path);
    const u = unitOf(f);
    const units = u ? EFFICIENCY_UNITS[u] : undefined;
    if (!units) throw new HpxmlSerializationError("unsupported", `efficiency unit ${String(u)}`, path);
    return el(name, text("Units", units), text("Value", v as number));
  };

  const heatingSystems = hvac.heating_systems.map((h, i) => {
    const hp = `${P}.systems.hvac.heating_systems[${i}]`;
    return el(
      "HeatingSystem",
      el("SystemIdentifier", { id: h.id }),
      h.distribution_system ? el("DistributionSystem", { idref: h.distribution_system }) : null,
      el("HeatingSystemType", el(req(h.heating_system_type, `${hp}.heating_system_type`))),
      text("HeatingSystemFuel", req(h.heating_system_fuel, `${hp}.heating_system_fuel`)),
      text("HeatingCapacity", opt(h.heating_capacity, `${hp}.heating_capacity`)),
      efficiency("AnnualHeatingEfficiency", h.annual_heating_efficiency, `${hp}.annual_heating_efficiency`),
      text("FractionHeatLoadServed", req(h.fraction_heat_load_served, `${hp}.fraction_heat_load_served`)),
    );
  });
  const coolingSystems = hvac.cooling_systems.map((c, i) => {
    const cp = `${P}.systems.hvac.cooling_systems[${i}]`;
    return el(
      "CoolingSystem",
      el("SystemIdentifier", { id: c.id }),
      c.distribution_system ? el("DistributionSystem", { idref: c.distribution_system }) : null,
      text("CoolingSystemType", req(c.cooling_system_type, `${cp}.cooling_system_type`)),
      text("CoolingSystemFuel", req(c.cooling_system_fuel, `${cp}.cooling_system_fuel`)),
      text("CoolingCapacity", opt(c.cooling_capacity, `${cp}.cooling_capacity`)),
      text("CompressorType", opt(c.compressor_type, `${cp}.compressor_type`)),
      text("FractionCoolLoadServed", req(c.fraction_cool_load_served, `${cp}.fraction_cool_load_served`)),
      efficiency("AnnualCoolingEfficiency", c.annual_cooling_efficiency, `${cp}.annual_cooling_efficiency`),
    );
  });
  const heatPumps = hvac.heat_pumps.map((h, i) => {
    const hp = `${P}.systems.hvac.heat_pumps[${i}]`;
    if (h.backup_type) throw new HpxmlSerializationError("unsupported", "heat-pump backup needs a backup efficiency, which the schema does not carry yet", `${hp}.backup_type`);
    return el(
      "HeatPump",
      el("SystemIdentifier", { id: h.id }),
      h.distribution_system ? el("DistributionSystem", { idref: h.distribution_system }) : null,
      text("HeatPumpType", req(h.heat_pump_type, `${hp}.heat_pump_type`)),
      text("HeatPumpFuel", req(h.heat_pump_fuel, `${hp}.heat_pump_fuel`)),
      text("HeatingCapacity", opt(h.heating_capacity, `${hp}.heating_capacity`)),
      text("CoolingCapacity", opt(h.cooling_capacity, `${hp}.cooling_capacity`)),
      text("CompressorType", opt(h.compressor_type, `${hp}.compressor_type`)),
      text("FractionHeatLoadServed", req(h.fraction_heat_load_served, `${hp}.fraction_heat_load_served`)),
      text("FractionCoolLoadServed", req(h.fraction_cool_load_served, `${hp}.fraction_cool_load_served`)),
      efficiency("AnnualCoolingEfficiency", h.annual_cooling_efficiency, `${hp}.annual_cooling_efficiency`),
      efficiency("AnnualHeatingEfficiency", h.annual_heating_efficiency, `${hp}.annual_heating_efficiency`),
    );
  });

  const primaryHeating = hvac.heat_pumps.find((h) => (h.fraction_heat_load_served.value ?? 0) > 0)?.id ?? hvac.heating_systems[0]?.id;
  const primaryCooling = hvac.heat_pumps.find((h) => (h.fraction_cool_load_served.value ?? 0) > 0)?.id ?? hvac.cooling_systems[0]?.id;
  const plant = el(
    "HVACPlant",
    primaryHeating || primaryCooling
      ? el(
          "PrimarySystems",
          primaryHeating ? el("PrimaryHeatingSystem", { idref: primaryHeating }) : null,
          primaryCooling ? el("PrimaryCoolingSystem", { idref: primaryCooling }) : null,
        )
      : null,
    heatingSystems,
    coolingSystems,
    heatPumps,
  );

  const hvacControl = el(
    "HVACControl",
    el("SystemIdentifier", { id: control.id }),
    text("SetpointTempHeatingSeason", req(control.heating_setpoint, `${P}.systems.hvac.hvac_control.heating_setpoint`)),
    text("SetpointTempCoolingSeason", req(control.cooling_setpoint, `${P}.systems.hvac.hvac_control.cooling_setpoint`)),
  );

  const distributions = hvac.hvac_distributions.map((d, di) => {
    const dp = `${P}.systems.hvac.hvac_distributions[${di}]`;
    const type = req(d.distribution_system_type, `${dp}.distribution_system_type`);
    if (type !== "AirDistribution") throw new HpxmlSerializationError("unsupported", `distribution type ${type}`, `${dp}.distribution_system_type`);
    return el(
      "HVACDistribution",
      el("SystemIdentifier", { id: d.id }),
      el(
        "DistributionSystemType",
        el(
          "AirDistribution",
          text("AirDistributionType", opt(d.air_distribution_type, `${dp}.air_distribution_type`)),
          d.duct_leakage_measurements.map((m, mi) => {
            const mp = `${dp}.duct_leakage_measurements[${mi}]`;
            const u = m.value.unit;
            return el(
              "DuctLeakageMeasurement",
              text("DuctType", req(m.duct_type, `${mp}.duct_type`)),
              el("DuctLeakage", text("Units", DUCT_LEAKAGE_UNITS[u]!), text("Value", req(m.value, `${mp}.value`)), text("TotalOrToOutside", req(m.total_or_to_outside, `${mp}.total_or_to_outside`))),
            );
          }),
          d.ducts.map((k, ki) => {
            const kp = `${dp}.ducts[${ki}]`;
            return el(
              "Ducts",
              el("SystemIdentifier", { id: k.id }),
              text("DuctType", req(k.duct_type, `${kp}.duct_type`)),
              text("DuctInsulationRValue", req(k.duct_insulation_r_value, `${kp}.duct_insulation_r_value`)),
              text("DuctLocation", req(k.duct_location, `${kp}.duct_location`)),
              text("FractionDuctArea", opt(k.duct_fraction_area, `${kp}.duct_fraction_area`)),
              text("DuctSurfaceArea", opt(k.duct_surface_area, `${kp}.duct_surface_area`)),
            );
          }),
          text("NumberofReturnRegisters", opt(d.number_of_return_registers, `${dp}.number_of_return_registers`)),
        ),
      ),
      text("ConditionedFloorAreaServed", opt(d.conditioned_floor_area_served, `${dp}.conditioned_floor_area_served`)),
    );
  });

  const systems = el("Systems", el("HVAC", plant, hvacControl, distributions));

  // The oracle's Schematron requires one "other" plug load. It feeds the annual simulation only;
  // design-load internal gains come from the explicit ManualJInputs above.
  const miscLoads = el("MiscLoads", el("PlugLoad", el("SystemIdentifier", { id: "PlugLoadOther" }), text("PlugLoadType", "other")));

  // ------------------------------------------------------------- Document
  const root = el(
    "HPXML",
    { xmlns: HPXML_NAMESPACE, schemaVersion: HPXML_SCHEMA_VERSION },
    el(
      "XMLTransactionHeaderInformation",
      text("XMLType", "HPXML"),
      text("XMLGeneratedBy", `RhoeFlow @rhoeflow/hpxml ${SERIALIZER_VERSION}`),
      text("CreatedDateAndTime", assessment.updated_at),
      text("Transaction", "create"),
    ),
    // Required by the HPXML schema even though it carries nothing the calculation uses.
    el("SoftwareInfo", text("SoftwareProgramUsed", "RhoeFlow"), text("SoftwareProgramVersion", SERIALIZER_VERSION)),
    el(
      "Building",
      el("BuildingID", { id: `RhoeFlow-${assessment.assessment_id}` }),
      el("Site", el("SiteID", { id: "SiteID" }), el("Address", text("StateCode", weather.stateCode))),
      // Required by the HPXML schema; "proposed workscope" is the event type the oracle's samples use for design.
      el("ProjectStatus", text("EventType", "proposed workscope")),
      el("BuildingDetails", el("BuildingSummary", site, buildingConstruction, el("extension", sizingControl)), climate, enclosure, systems, miscLoads),
    ),
  );
  return renderXml(root);
}
