/**
 * Quick-pass reference houses (WO-03 D2). Each is a set of quick-pass answers plus the era
 * template a tech would pick; `buildQuickPass` turns it into the Assessment the fixture freezes,
 * and the CI oracle job checks the engine against OpenStudio-HPXML on it like every other
 * fixture. Together they exercise every answer path of the quick-pass map: defaults and both
 * kinds of unknown, choices, and expert direct entry.
 *
 * ILLUSTRATIVE FIXTURES, not real properties (GOV-002).
 *
 * | House | Exercises |
 * | --- | --- |
 * | qp-ranch-1964-slab | the minimum: only the required answers, everything else from the template and cited defaults |
 * | qp-ranch-1955-crawl | year before 1960 defaults to pier and beam; ducts in the crawlspace; 1-car garage; choices for windows, attic and tightness |
 * | qp-two-story-2005-bonus | 2-car garage with a room over it; low-E windows; attic "inspected, can't tell"; blower-door ACH50; sealed ducts in the garage |
 * | qp-one-story-2018-heat-pump | heat pump; measured window area; measured attic depth; NFRC U and SHGC; duct-blaster CFM25; ducts in conditioned space; radiant barrier from the template |
 * | qp-ranch-1972-ductless | ductless mini-split; tight; window amount "lots"; attic "didn't inspect" |
 */
import type { QuickPassAnswersInput } from "../quick-pass.js";

const A = <T,>(value: T, state: "measured" | "documented" | "assumed" = "assumed", source?: string) => ({ value, state, ...(source ? { source } : {}) });
const FIXTURE = "fixture: @rhoeflow/templates quick-pass-houses (illustrative, not a real property)";

export interface QuickPassHouse {
  name: string;
  template: string;
  assessment_id: string;
  project_id: string;
  property_id: string;
  description: string;
  answers: QuickPassAnswersInput;
}

export const QUICK_PASS_HOUSES: readonly QuickPassHouse[] = [
  {
    name: "qp-ranch-1964-slab",
    template: "dfw-pre1980-ranch-slab",
    assessment_id: "a1b2c3d4-0001-4a00-8000-000000000001",
    project_id: "we_project_fixture_qp1",
    property_id: "we_property_fixture_qp1",
    description: "Quick pass with only the required answers: 1964 one-story, 1,600 ft2, front facing south, 3 bedrooms, no garage. Everything else from template dfw-pre1980-ranch-slab and cited defaults (WO-03 D2). Not a real property.",
    answers: {
      quick_pass_version: "0.1.0",
      year_built: A(1964, "documented", "fixture: WorkEdge property record (illustrative)"),
      floor_area: A(1600, "documented", "fixture: WorkEdge property record (illustrative)"),
      stories: A(1),
      garage: A({ cars: 0, side: "left" as const }),
      front_azimuth: A(180),
      bedrooms: A(3),
    },
  },
  {
    name: "qp-ranch-1955-crawl",
    template: "dfw-pre1980-ranch-slab",
    assessment_id: "a1b2c3d4-0002-4a00-8000-000000000002",
    project_id: "we_project_fixture_qp2",
    property_id: "we_property_fixture_qp2",
    description: "Quick pass: 1955 pier-and-beam ranch (foundation defaulted from the year), 1,400 ft2, 1-car garage on the left, ducts in the crawlspace, single-pane metal windows, some attic insulation, leaky (WO-03 D2). Not a real property.",
    answers: {
      quick_pass_version: "0.1.0",
      year_built: A(1955),
      floor_area: A(1400),
      stories: A(1),
      garage: A({ cars: 1, side: "left" as const }),
      front_azimuth: A(0),
      bedrooms: A(2),
      window_amount: A("light" as const),
      window_type: A("single_clear_metal" as const),
      attic_insulation: A("some" as const),
      duct_location: A("crawlspace" as const),
      ducts_sealed: A(false),
      tightness: A("leaky" as const),
    },
  },
  {
    name: "qp-two-story-2005-bonus",
    template: "dfw-2001-2011-two-story-iecc2000",
    assessment_id: "a1b2c3d4-0003-4a00-8000-000000000003",
    project_id: "we_project_fixture_qp3",
    property_id: "we_property_fixture_qp3",
    description: "Quick pass: 2005 two-story, 2,820 ft2 including a room over a 2-car garage on the right, front facing east, 9 ft ceilings, low-E windows, attic inspected but not determined, blower door 7.5 ACH50, sealed ducts in the garage (WO-03 D2). Not a real property.",
    answers: {
      quick_pass_version: "0.1.0",
      year_built: A(2005),
      floor_area: A(2820),
      stories: A(2),
      garage: A({ cars: 2, side: "right" as const }),
      room_over_garage: A(true),
      ceiling_height: A(9, "measured", `${FIXTURE}: tape at the hall`),
      front_azimuth: A(90),
      bedrooms: A(4),
      window_type: A("double_lowe_nonmetal" as const),
      attic_insulation: { unknown: "inspected_cant_tell" as const, note: "attic hatch over the garage only" },
      duct_location: A("garage" as const),
      ducts_sealed: A(true),
      tightness: A({ ach50: 7.5 }, "measured", `${FIXTURE}: blower door, single point at 50 Pa`),
    },
  },
  {
    name: "qp-one-story-2018-heat-pump",
    template: "dfw-2016-2020-iecc2015",
    assessment_id: "a1b2c3d4-0004-4a00-8000-000000000004",
    project_id: "we_project_fixture_qp4",
    property_id: "we_property_fixture_qp4",
    description: "Quick pass with expert entries: 2018 one-story, 2,100 ft2, 3-car garage on the left, heat pump, measured window area, NFRC label U and SHGC, measured attic depth, duct blaster, ducts in conditioned space (WO-03 D2). Not a real property.",
    answers: {
      quick_pass_version: "0.1.0",
      year_built: A(2018),
      floor_area: A(2100),
      stories: A(1),
      garage: A({ cars: 3, side: "left" as const }),
      front_azimuth: A(225),
      bedrooms: A(4),
      foundation: A("slab" as const),
      window_amount: A({ total_area_ft2: 290 }, "measured", `${FIXTURE}: window takeoff from the plan set`),
      window_type: A({ ufactor: 0.32, shgc: 0.25 }, "documented", `${FIXTURE}: NFRC label`),
      attic_insulation: A({ depth_in: 11, material: "fiberglass_loose" as const }, "measured", `${FIXTURE}: tape in frame`),
      system: A("heat_pump" as const),
      duct_location: A("conditioned" as const),
      ducts_sealed: A({ leakage_to_outside_cfm25: 40 }, "measured", `${FIXTURE}: duct blaster to outside`),
      tightness: A("tight" as const),
    },
  },
  {
    name: "qp-ranch-1972-ductless",
    template: "dfw-pre1980-ranch-slab",
    assessment_id: "a1b2c3d4-0005-4a00-8000-000000000005",
    project_id: "we_project_fixture_qp5",
    property_id: "we_property_fixture_qp5",
    description: "Quick pass: 1972 one-story, 1,250 ft2, ductless mini-split, lots of glass, attic not inspected, tight after a weatherization job, front facing northwest (WO-03 D2). Not a real property.",
    answers: {
      quick_pass_version: "0.1.0",
      year_built: A(1972),
      floor_area: A(1250),
      stories: A(1),
      garage: A({ cars: 0, side: "right" as const }),
      front_azimuth: A(315),
      bedrooms: A(2),
      window_amount: A("lots" as const),
      attic_insulation: { unknown: "didnt_inspect" as const },
      system: A("ductless" as const),
      tightness: A("tight" as const),
    },
  },
];

export const QUICK_PASS_FIXTURE_TIMESTAMP = "2026-10-25T09:00:00-05:00";
