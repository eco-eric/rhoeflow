/**
 * WO-03 Track B reference houses (B5, B7). Each is built from one of the two R01 houses with
 * the WO-03 feature added, so a difference against the oracle points at that feature.
 *
 * ILLUSTRATIVE FIXTURES, not real properties (GOV-002). Values are plausible for DFW houses of
 * the stated era and entered as `assumed` with this file as the source; template-seeded fields
 * stay `unknown` until `applyTemplate` fills them. Garage sizes follow OpenStudio-HPXML
 * BuildResidentialHPXML `geometry_garage_type.tsv` (12 ft per car wide, 20 ft deep; 2 car 21 ft).
 *
 * | House | Adds |
 * | --- | --- |
 * | ranch-1950s-crawl-dfw | vented crawlspace (pier and beam), foundation walls, return duct in the crawlspace |
 * | one-story-2018-garage-dfw | attached 2-car garage (partition wall and door), radiant barrier |
 * | two-story-garage-2sys-dfw | garage under a bonus room, two ducted systems (furnace + AC, heat pump), return duct in the garage |
 * | ranch-1960s-ductless-dfw | one ductless mini-split heat pump, no ducts |
 */
import type { AssessmentInput, KnownState, Unit, UnknownReason } from "@rhoeflow/schema";
import { ranchBaseAssessment } from "./ranch-1960s-dfw.js";
import { twoStoryBaseAssessment } from "./two-story-2010-dfw.js";

const SRC = "fixture: @rhoeflow/templates wo03-houses (illustrative reference house, not a real property)";

function a<T>(value: T, note?: string, state: KnownState = "assumed") {
  return { value, state, source: SRC, evidence: [] as string[], ...(note ? { note } : {}) };
}
function q<U extends Unit>(value: number, unit: U, note?: string, state: KnownState = "assumed") {
  return { value, unit, state, source: SRC, evidence: [] as string[], ...(note ? { note } : {}) };
}
function unknownQ<U extends Unit>(unit: U, reason: UnknownReason = "didnt_inspect") {
  return { value: null, unit, state: "unknown" as const, reason, evidence: [] as string[] };
}
function unknownF(reason: UnknownReason = "didnt_inspect") {
  return { value: null, state: "unknown" as const, reason, evidence: [] as string[] };
}

/**
 * Duct leakage to outside from a template rate in cfm25 per 100 ft2 and the floor area the
 * system serves, split 2/3 supply and 1/3 return (WO-02 A2). The quick pass will make this
 * derivation itself (D2); fixtures carry it as `derived` the way the R01 two-story does.
 */
function derivedLeakage(templateId: string, ratePer100: number, servedFt2: number) {
  const total = (ratePer100 * servedFt2) / 100;
  const source = `derived: template ${templateId} duct leakage ${ratePer100} cfm25 per 100 ft2 x ${servedFt2} ft2 served / 100 = ${total} cfm25 to outside, split 2/3 supply and 1/3 return (WO-02 A2)`;
  const v = (x: number) => ({ value: Math.round(x * 100) / 100, unit: "cfm25" as const, state: "derived" as const, source, evidence: [] as string[] });
  return [
    { duct_type: a("supply"), value: v((total * 2) / 3), total_or_to_outside: a("to outside") },
    { duct_type: a("return"), value: v(total / 3), total_or_to_outside: a("to outside") },
  ];
}

// The bases are plain data built fresh on every call; the variants below edit a copy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

function retag(x: Loose, ids: { assessment_id: string; project_id: string; property_id: string }) {
  x.assessment_id = ids.assessment_id;
  x.workedge.project_id = ids.project_id;
  x.workedge.property_id = ids.property_id;
  const fix = (o: Loose) => {
    if (!o || typeof o !== "object") return;
    if (typeof o.source === "string" && o.source.startsWith("workedge:property:")) {
      o.source = o.source.replace(/workedge:property:[^.]+/, `workedge:property:${ids.property_id}`);
    }
    for (const v of Object.values(o)) fix(v);
  };
  fix(x.building);
}

/** 1955 pier-and-beam ranch: the R01 ranch on a vented crawlspace instead of a slab. */
export function crawlRanchBaseAssessment(): AssessmentInput {
  const x: Loose = structuredClone(ranchBaseAssessment());
  retag(x, { assessment_id: "3f6a1d2b-7c8e-4f90-a1b2-c3d4e5f60718", project_id: "we_project_fixture_crawl", property_id: "we_property_fixture_crawl" });
  const bc = x.building.building_construction;
  bc.year_built.value = 1955;
  const e = x.building.enclosure;
  e.foundations = [
    {
      id: "found-1",
      foundation_type: a("vented crawlspace", "pier and beam with a brick skirt and screened vents"),
      vented_crawlspace_sla: {
        value: 0.006667,
        unit: "fraction",
        state: "defaulted",
        source: "ANSI/RESNET/ICC 301 Table 4.2.2(1) vented crawlspace SLA 1/150, as OpenStudio-HPXML v1.12.0 applies it (defaults.rb 5725 to 5727)",
        evidence: [],
      },
    },
  ];
  e.floors.push({
    id: "floor-crawl",
    exterior_adjacent_to: a("crawlspace - vented"),
    interior_adjacent_to: a("conditioned space"),
    floor_or_ceiling: a("floor"),
    floor_type: a("wood frame", "2x8 joists on beams"),
    area: q(1600, "ft2"),
    insulation_assembly_r_value: q(4.5, "h-ft2-F/Btu", "uninsulated wood floor with carpet and pad, whole-assembly placeholder"),
  });
  const skirt = (id: string, azimuth: number) => ({
    id,
    exterior_adjacent_to: a("ground"),
    interior_adjacent_to: a("crawlspace - vented"),
    type: a("double brick", "brick skirt between piers"),
    height: q(2.5, "ft"),
    area: q(100, "ft2", "40 ft x 2.5 ft"),
    azimuth: q(azimuth, "degrees"),
    thickness: q(8, "in"),
    depth_below_grade: q(0.5, "ft"),
    insulation_assembly_r_value: q(2.2, "h-ft2-F/Btu", "uninsulated 8 in double brick with air films, whole-assembly placeholder"),
  });
  e.foundation_walls = [skirt("fw-n", 0), skirt("fw-e", 90), skirt("fw-s", 180), skirt("fw-w", 270)];
  e.slabs = [
    {
      id: "slab-crawl",
      interior_adjacent_to: a("crawlspace - vented"),
      area: q(1600, "ft2"),
      thickness: q(0, "in", "dirt floor"),
      exposed_perimeter: q(160, "ft"),
      perimeter_insulation_r_value: q(0, "h-ft2-F/Btu"),
      perimeter_insulation_depth: q(0, "ft"),
      under_slab_insulation_r_value: q(0, "h-ft2-F/Btu"),
      carpet_fraction: q(0, "fraction"),
      carpet_r_value: q(0, "h-ft2-F/Btu"),
    },
  ];
  const ducts = x.building.systems.hvac.hvac_distributions[0].ducts;
  ducts.find((d: Loose) => d.id === "duct-return").duct_location = a("crawlspace - vented", "return trunk runs under the floor");
  return x;
}

/** 2018 one-story with an attached 2-car garage on the west and a radiant barrier. */
export function garageOneStoryBaseAssessment(): AssessmentInput {
  const x: Loose = structuredClone(ranchBaseAssessment());
  retag(x, { assessment_id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", project_id: "we_project_fixture_garage", property_id: "we_property_fixture_garage" });
  x.building.building_construction.year_built.value = 2018;
  const e = x.building.enclosure;
  // Radiant barrier: the template seeds the flag; the grade is a separate input HPXML needs.
  e.roofs[0].radiant_barrier = unknownF();
  e.roofs[0].radiant_barrier_grade = q(1, "count", "foil-faced decking, installed well");
  e.roofs[0].area = q(2133, "ft2", "house 1600 ft2 plus garage 420 ft2 under one 4:12 roof");
  // West wall: 20 ft of it is now shared with the garage.
  const wallW = e.walls.find((w: Loose) => w.id === "wall-w");
  wallW.area = q(160, "ft2", "west wall outside the garage, 20 ft x 8 ft");
  e.walls.push(
    {
      ...structuredClone(wallW),
      id: "wall-garage",
      exterior_adjacent_to: a("garage"),
      area: q(160, "ft2", "house wall shared with the garage, 20 ft x 8 ft"),
      siding: a("none"),
      solar_absorptance: q(0.5, "fraction", "interior gypsum"),
      insulation_assembly_r_value: q(13, "h-ft2-F/Btu", "2x4 R-13 wall, whole-assembly placeholder"),
    },
    ...[
      { id: "garage-wall-n", azimuth: 0, area: 168 },
      { id: "garage-wall-s", azimuth: 180, area: 168 },
      { id: "garage-wall-w", azimuth: 270, area: 160 },
    ].map((g) => ({
      id: g.id,
      exterior_adjacent_to: a("outside"),
      interior_adjacent_to: a("garage"),
      wall_type: a("wood stud"),
      area: q(g.area, "ft2", "garage exterior wall, 8 ft high"),
      azimuth: q(g.azimuth, "degrees"),
      siding: a("brick veneer"),
      solar_absorptance: q(0.75, "fraction"),
      emittance: q(0.9, "fraction"),
      insulation_assembly_r_value: q(4, "h-ft2-F/Btu", "uninsulated garage wall"),
    })),
  );
  e.floors.push({
    id: "garage-ceiling",
    exterior_adjacent_to: a("attic - vented"),
    interior_adjacent_to: a("garage"),
    floor_or_ceiling: a("ceiling"),
    floor_type: a("wood frame"),
    area: q(420, "ft2", "21 ft x 20 ft garage"),
    insulation_assembly_r_value: q(2.1, "h-ft2-F/Btu", "uninsulated drywall ceiling"),
  });
  e.slabs.push({
    id: "garage-slab",
    interior_adjacent_to: a("garage"),
    area: q(420, "ft2"),
    thickness: q(4, "in"),
    exposed_perimeter: q(61, "ft", "21 + 20 + 20 ft not against the house"),
    perimeter_insulation_r_value: q(0, "h-ft2-F/Btu"),
    perimeter_insulation_depth: q(0, "ft"),
    under_slab_insulation_r_value: q(0, "h-ft2-F/Btu"),
    carpet_fraction: q(0, "fraction"),
    carpet_r_value: q(0, "h-ft2-F/Btu"),
  });
  e.doors.push({ id: "door-garage", attached_to_wall: "wall-garage", area: q(20, "ft2"), azimuth: q(270, "degrees"), r_value: q(2, "h-ft2-F/Btu", "hollow-core steel door to the garage") });
  e.slabs[0].exposed_perimeter = q(140, "ft", "40 x 40 footprint less 20 ft against the garage");
  x.building.systems.hvac.hvac_distributions[0].duct_leakage_measurements = derivedLeakage("dfw-2016-2020-iecc2015", 4, 1600);
  return x;
}

/** The R01 two-story with a 2-car garage under a bonus room and a second system for upstairs. */
export function twoSystemTwoStoryBaseAssessment(): AssessmentInput {
  const x: Loose = structuredClone(twoStoryBaseAssessment());
  retag(x, { assessment_id: "5c4b3a29-1807-4f6e-9d5c-4b3a29180716", project_id: "we_project_fixture_2sys", property_id: "we_property_fixture_2sys" });
  const bc = x.building.building_construction;
  bc.conditioned_floor_area = { ...bc.conditioned_floor_area, value: 2820 };
  bc.conditioned_building_volume = q(23970, "ft3", "2820 ft2 x 8.5 ft");
  const e = x.building.enclosure;
  const stud = (id: string, azimuth: number, area: number, ext = "outside", int = "conditioned space", r = 13) => ({
    id,
    exterior_adjacent_to: a(ext),
    interior_adjacent_to: a(int),
    wall_type: a("wood stud"),
    area: q(area, "ft2"),
    azimuth: q(azimuth, "degrees"),
    siding: a(ext === "garage" ? "none" : "brick veneer"),
    solar_absorptance: q(ext === "garage" ? 0.5 : 0.75, "fraction"),
    emittance: q(0.9, "fraction"),
    insulation_assembly_r_value: q(r, "h-ft2-F/Btu", "whole-assembly placeholder"),
  });
  e.walls.push(
    stud("bonus-wall-n", 0, 168, "outside", "conditioned space", 11),
    stud("bonus-wall-s", 180, 168, "outside", "conditioned space", 11),
    stud("bonus-wall-e", 90, 160, "outside", "conditioned space", 11),
    stud("wall-garage", 90, 180, "garage", "conditioned space", 11),
    stud("garage-wall-n", 0, 189, "outside", "garage", 4),
    stud("garage-wall-s", 180, 189, "outside", "garage", 4),
    stud("garage-wall-e", 90, 180, "outside", "garage", 4),
  );
  e.floors.push({
    id: "floor-over-garage",
    exterior_adjacent_to: a("garage"),
    interior_adjacent_to: a("conditioned space"),
    floor_or_ceiling: a("floor"),
    floor_type: a("wood frame"),
    area: q(420, "ft2", "bonus room over the 21 x 20 ft garage"),
    insulation_assembly_r_value: q(15, "h-ft2-F/Btu", "R-13 batts in 2x10 joists, whole-assembly placeholder"),
  });
  e.floors.push({
    id: "ceiling-bonus",
    exterior_adjacent_to: a("attic - vented"),
    interior_adjacent_to: a("conditioned space"),
    floor_or_ceiling: a("ceiling"),
    floor_type: a("wood frame"),
    area: q(420, "ft2"),
    insulation_assembly_r_value: q(30, "h-ft2-F/Btu", "whole-assembly placeholder"),
  });
  e.roofs[0].area = q(1812, "ft2", "1342 ft2 main roof plus 470 ft2 over the 420 ft2 bonus room at 6:12");
  e.walls.find((w: Loose) => w.id === "wall-e").area = q(170, "ft2", "east wall less 20 x 9 ft against the garage and 20 x 8 ft against the bonus room");
  e.slabs.push({
    id: "garage-slab",
    interior_adjacent_to: a("garage"),
    area: q(420, "ft2"),
    thickness: q(4, "in"),
    exposed_perimeter: q(62, "ft"),
    perimeter_insulation_r_value: q(0, "h-ft2-F/Btu"),
    perimeter_insulation_depth: q(0, "ft"),
    under_slab_insulation_r_value: q(0, "h-ft2-F/Btu"),
    carpet_fraction: q(0, "fraction"),
    carpet_r_value: q(0, "h-ft2-F/Btu"),
  });
  e.doors.push({ id: "door-garage", attached_to_wall: "wall-garage", area: q(20, "ft2"), azimuth: q(90, "degrees"), r_value: q(2, "h-ft2-F/Btu", "steel door to the garage") });

  const hvac = x.building.systems.hvac;
  hvac.heating_systems[0].fraction_heat_load_served = q(0.45, "fraction", "downstairs system");
  hvac.cooling_systems[0].fraction_cool_load_served = q(0.45, "fraction", "downstairs system");
  const d1 = hvac.hvac_distributions[0];
  d1.conditioned_floor_area_served = q(1200, "ft2");
  d1.ducts.find((d: Loose) => d.id === "duct-return").duct_location = a("garage", "air handler and return plenum in the garage");
  const d2 = structuredClone(d1);
  d2.id = "dist-2";
  d2.conditioned_floor_area_served = q(1620, "ft2");
  d2.number_of_return_registers = q(2, "count");
  d2.ducts = [
    { id: "duct-supply-2", duct_type: a("supply"), duct_insulation_r_value: unknownQ("h-ft2-F/Btu"), duct_location: a("attic - vented"), duct_fraction_area: q(1, "fraction") },
    { id: "duct-return-2", duct_type: a("return"), duct_insulation_r_value: unknownQ("h-ft2-F/Btu"), duct_location: a("attic - vented"), duct_fraction_area: q(1, "fraction") },
  ];
  d1.duct_leakage_measurements = derivedLeakage("dfw-2001-2011-two-story-iecc2000", 10, 1200);
  d2.duct_leakage_measurements = derivedLeakage("dfw-2001-2011-two-story-iecc2000", 10, 1620);
  hvac.hvac_distributions.push(d2);
  hvac.heat_pumps.push({
    id: "hp-up",
    heat_pump_type: a("air-to-air"),
    heat_pump_fuel: a("electricity"),
    heating_capacity: q(30000, "Btu/h"),
    cooling_capacity: q(30000, "Btu/h"),
    compressor_type: a("single stage"),
    annual_cooling_efficiency: q(14, "SEER"),
    annual_heating_efficiency: q(8.2, "HSPF"),
    fraction_heat_load_served: q(0.55, "fraction", "upstairs system"),
    fraction_cool_load_served: q(0.55, "fraction", "upstairs system"),
    distribution_system: "dist-2",
    x_served_zone_ids: ["zone-main"],
  });
  return x;
}

/** The R01 ranch with its furnace, AC and ducts replaced by one ductless mini-split heat pump. */
export function ductlessRanchBaseAssessment(): AssessmentInput {
  const x: Loose = structuredClone(ranchBaseAssessment());
  retag(x, { assessment_id: "0e1d2c3b-4a59-4687-b5a4-93827160f5e4", project_id: "we_project_fixture_ductless", property_id: "we_property_fixture_ductless" });
  const hvac = x.building.systems.hvac;
  hvac.heating_systems = [];
  hvac.cooling_systems = [];
  hvac.hvac_distributions = [];
  hvac.heat_pumps = [
    {
      id: "msp-1",
      heat_pump_type: a("mini-split"),
      heat_pump_fuel: a("electricity"),
      heating_capacity: q(36000, "Btu/h"),
      cooling_capacity: q(36000, "Btu/h"),
      compressor_type: a("variable speed"),
      annual_cooling_efficiency: q(20, "SEER"),
      annual_heating_efficiency: q(10, "HSPF"),
      fraction_heat_load_served: q(1, "fraction"),
      fraction_cool_load_served: q(1, "fraction"),
      x_served_zone_ids: ["zone-main"],
    },
  ];
  return x;
}
