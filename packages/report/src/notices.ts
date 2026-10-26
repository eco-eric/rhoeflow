/**
 * Notices every report carries (RPT-002, LIC-002, ADR-001, ADR-020, ADR-035). Wording is a draft
 * for the owner to confirm (claude/06-architecture/report-pages.md §Notices); the OpenStudio-HPXML
 * notice is the one recorded in claude/06-architecture/license-inventory.md.
 */

export interface Notice {
  id: "independent_software" | "non_approval" | "openstudio_hpxml";
  title: string;
  text: string;
}

export const NOTICES: readonly Notice[] = [
  {
    id: "independent_software",
    title: "Independent software",
    text:
      "This report was produced with RhoeFlow, software developed by TruFicient Energy Solutions for its own work. RhoeFlow is independent: it is not produced, licensed or endorsed by ACCA, ASHRAE, the U.S. Department of Energy or any other standards body or software vendor. Its block-load method follows the published structure of ACCA Manual J, 8th edition, with tables re-derived from public sources (ASHRAE Handbook of Fundamentals, IECC and OpenStudio-HPXML); it does not reproduce ACCA's tables.",
  },
  {
    id: "non_approval",
    title: "Not an approval",
    text:
      "Neither RhoeFlow nor this report has been reviewed, recognized or approved by ACCA, a building official, a utility program or any other authority. The report is not a permit approval and is not a certification of the home or of any equipment. Values marked assumed or defaulted were not measured at the home; the report lists them with their sources.",
  },
  {
    id: "openstudio_hpxml",
    title: "OpenStudio-HPXML",
    text:
      "Portions derived from OpenStudio® HPXML, Copyright (c) 2008-2026, Alliance for Energy Innovation, LLC, and other contributors. All rights reserved. Used under the OpenStudio-HPXML license. RhoeFlow is not endorsed by, and is not a modified version of, OpenStudio® or OpenStudio-HPXML.",
  },
];

/** Pages a full design package has that this report does not; each is printed as not part of it. */
export const EXCLUDED_PAGES: readonly { page: string; reason: string }[] = [
  { page: "Equipment selection (Manual S)", reason: "Not part of this report. RhoeFlow does not select equipment yet; no equipment is recommended here." },
  { page: "Room-by-room loads", reason: "Not part of this report. This is a whole-house (block) load; room loads and design airflow per room are not calculated." },
  { page: "Duct design (Manual D)", reason: "Not part of this report. Existing ducts are modelled for their losses only; no duct sizes or layout are designed." },
];
