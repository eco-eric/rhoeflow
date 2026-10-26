import type { ProvenanceState } from "@rhoeflow/schema";
import type { Notice } from "./notices.js";
import type { PrintedNumber } from "./rounding.js";

/** A printed value: a rounded number or a text value (an enum, an id, a yes/no). */
export type PrintedValue = PrintedNumber | { text: string };

/** One printed value with where it came from. Run results carry `from: "run"`; inputs carry their provenance. */
export interface Cell {
  value: PrintedValue;
  /** Provenance state of an input value; absent for run results. */
  state?: ProvenanceState;
  source?: string;
  /** Where the value sits: an Assessment field path, or `output.<path>` for run results. */
  path: string;
}

export interface LabeledCell extends Cell {
  label: string;
}

export interface Table {
  title: string;
  columns: string[];
  rows: { id: string; cells: (Cell | null)[] }[];
  /** Shown when the table has no rows. */
  empty?: string;
}

export interface WorksheetRow {
  component_id: string;
  kind: string;
  method_id: string;
  adjacent_to: string | null;
  azimuth: PrintedNumber | null;
  /** Area (ft²) or, for a slab, exposed perimeter (ft). */
  size: PrintedNumber | null;
  /** U (Btu/h·ft²·°F) or, for a slab, F-value (Btu/h·ft·°F). */
  conductance: PrintedNumber | null;
  htm_heating: PrintedNumber | null;
  htm_cooling: PrintedNumber | null;
  heating: PrintedNumber;
  cooling_sensible: PrintedNumber;
  cooling_latent: PrintedNumber;
  /** Kind-specific notes the method used (CFM, occupants, duct sides). */
  notes: string[];
}

export interface ReportModel {
  report_model_version: "0.1.0";
  meta: {
    run_id: string;
    assessment_id: string;
    revision: number;
    scenario: { id: string; name: string; override_count: number };
    engine: { name: string; version: string };
    calc_output_version: string;
    input_hash: string;
    method_ids: string[];
    run_created_at: string;
    weather: { library: string; version: string; station_key: string };
    template: { id: string; version: string | null } | null;
    workedge: { team_id: string; project_id: string; property_id: string };
    stale: boolean;
    stale_reason: string | null;
  };
  home: { property_label: { text: string; source: string } | null; rows: LabeledCell[] };
  totals: {
    heating: LabeledCell;
    cooling_sensible: LabeledCell;
    cooling_latent: LabeledCell;
    cooling_total: LabeledCell;
    cooling_tons: LabeledCell;
  };
  sanity: {
    rows: LabeledCell[];
    band: { low: number; high: number; template_id: string; template_version: string; source: string; inside: boolean } | null;
  };
  design_conditions: { recorded: boolean; rows: LabeledCell[]; overrides: { label: string; station: string; used: string; state: ProvenanceState; source: string }[] };
  provenance: {
    total: number;
    counts: Record<ProvenanceState, number>;
    measured_or_documented: LabeledCell[];
    assumed: LabeledCell[];
    defaulted_by_source: { source: string; count: number }[];
  };
  construction: Table[];
  worksheet: { recorded: boolean; rows: WorksheetRow[]; totals: { heating: PrintedNumber; cooling_sensible: PrintedNumber; cooling_latent: PrintedNumber } };
  inputs: LabeledCell[];
  warnings: { code: string; message: string }[];
  excluded: readonly { page: string; reason: string }[];
  notices: readonly Notice[];
}
