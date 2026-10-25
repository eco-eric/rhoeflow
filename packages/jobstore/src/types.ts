import type { MediaId, WorkEdgeId } from "@rhoeflow/schema";

/**
 * Read models and write requests the design app needs from WorkEdge (integration standard
 * §6). Field sets are deliberately minimal: WorkEdge's current schema will be confirmed from
 * its repo (standard §11), and the interface, not that schema, is what RhoeFlow depends on
 * (ADR-031). Nothing here is persisted by RhoeFlow except the ids (ADR-028).
 */

/** Identity comes from the shared Supabase Auth tenant (standard §7). */
export interface JobStoreContext {
  team_id: WorkEdgeId;
  /** Acting user, when per-user OAuth exists; absent under the team API key. */
  user_id?: string;
}

export interface Project {
  id: WorkEdgeId;
  team_id: WorkEdgeId;
  property_id: WorkEdgeId | null;
  customer_id: WorkEdgeId | null;
  name: string;
  status: string | null;
  created_at: string;
}

export interface Property {
  id: WorkEdgeId;
  team_id: WorkEdgeId;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postal_code: string;
  };
  /** Facts the Assessment cites as `documented` with source `workedge:property:<id>.<field>`. */
  year_built: number | null;
  conditioned_floor_area_ft2: number | null;
  property_type: string | null;
}

export type MediaKind = "photo" | "video";

export interface MediaItem {
  id: MediaId;
  kind: MediaKind;
  project_id: WorkEdgeId;
  category: string | null;
  caption: string | null;
  captured_at: string | null;
  content_type: string;
  exif: Record<string, string | number> | null;
  gps: { lat: number; lng: number } | null;
  /** Video transcript when WorkEdge has one. */
  transcript: string | null;
  /**
   * Resolved at read time and NEVER persisted (ADR-028, standard §2): it expires.
   * Null when the store cannot mint one (e.g. the stub).
   */
  signed_url: { url: string; expires_at: string } | null;
}

export type EquipmentKind = "outdoor_unit" | "indoor_unit" | "furnace" | "air_handler" | "thermostat" | "other";

export interface EquipmentEntry {
  id: WorkEdgeId;
  project_id: WorkEdgeId;
  property_id: WorkEdgeId | null;
  kind: EquipmentKind;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  installed_year: number | null;
  nameplate_media_ids: MediaId[];
  /** Present when RhoeFlow wrote or updated the entry (ADR-030). */
  source: WriteBackSource | null;
}

/**
 * Every write-back carries these three (ADR-030, standard §2). The literal type makes a
 * write without them a compile error; `assertWriteBackSource` makes it a runtime error.
 */
export interface WriteBackSource {
  source: "rhoeflow";
  assessment_id: string;
  run_id: string;
}

export interface ListOptions {
  cursor?: string | null;
  limit?: number;
}

/** Rate limits and pagination are respected; never assume a full page (standard §6). */
export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export interface ListMediaOptions extends ListOptions {
  category?: string;
}

export interface ListEquipmentScope {
  project_id: WorkEdgeId;
  property_id?: WorkEdgeId;
}

export interface UploadMediaRequest {
  project_id: WorkEdgeId;
  kind: MediaKind;
  /** One of the "Load calc / System design" capture categories (standard §5), or free text. */
  category: string;
  caption: string | null;
  /** Links the media to the assessment that captured it (standard §4 step 5). */
  assessment_id: string;
  file_name: string;
  content_type: string;
  content: Uint8Array;
  captured_at: string | null;
  metadata: Record<string, string | number | boolean> | null;
}

export interface UploadMediaResult {
  /** The evidence id the Assessment stores. `local:` prefix = pending migration (ADR-031). */
  media_id: MediaId;
  kind: MediaKind;
  stored_in: "workedge" | "local";
}

export type ReportType = "engineering" | "customer_summary";

export interface SaveReportRequest extends WriteBackSource {
  project_id: WorkEdgeId;
  report_type: ReportType;
  title: string;
  file_name: string;
  content_type: "application/pdf";
  content: Uint8Array;
}

export interface SaveReportResult {
  report_id: string;
  stored_in: "workedge" | "local";
}

export interface AddNoteRequest extends WriteBackSource {
  project_id: WorkEdgeId;
  body: string;
  /** Deep link to the frozen run in RhoeFlow. */
  run_url: string;
}

export interface AddNoteResult {
  note_id: string;
}

export interface UpsertEquipmentRequest extends WriteBackSource {
  project_id: WorkEdgeId;
  property_id: WorkEdgeId | null;
  /** WorkEdge id when updating; null to create. */
  equipment_id: WorkEdgeId | null;
  kind: EquipmentKind;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  installed_year: number | null;
  nameplate_media_ids: MediaId[];
}
