/**
 * The WorkEdge call behind each JobStore operation. Confirmed against WorkEdge's MCP server
 * (`eco-eric/field-doc-suite`, branch `dev`, `supabase/functions/mcp/`, read 2026-11-01; KAN-124
 * marked done 2026-10-29), replacing WO-01's provisional REST routes (standard §11).
 *
 * Every call is a JSON-RPC `tools/call` POSTed to WorkEdge's MCP address with the calling
 * account's own key (ADR-038).
 */
export type CallAvailability =
  | "mcp-live" // the tool exists and returns what RhoeFlow needs
  | "mcp-partial" // reachable today through another tool, with gaps named in `notes`
  | "kan-125-pending"; // needs a WorkEdge change filed in KAN-125 (wo-03-workedge-ticket.md)

export interface WorkEdgeCall {
  operation: string;
  /** MCP tool name, or the KAN-125 item still waiting. */
  call: string;
  availability: CallAvailability;
  auth: "account-api-key" | "user-oauth-later";
  request: string;
  response: string;
  notes?: string;
}

export const WORKEDGE_CALLS: Readonly<Record<string, WorkEdgeCall>> = {
  getProject: {
    operation: "getProject",
    call: "mcp: get_project { project_id }",
    availability: "mcp-live",
    auth: "account-api-key",
    request: "project_id (UUID)",
    response: "{ project{id,name,status,created_at,...}, property{id,name,address,property_type,...}|null, primary_contact|null, ... }",
    notes: "No team id in the reply; RhoeFlow uses the account's team, the only team the key can see.",
  },
  getProperty: {
    operation: "getProperty",
    call: "mcp: get_project (property inside it), else rest: GET api-properties/{id}",
    availability: "mcp-live",
    auth: "account-api-key",
    request: "property_id; served from a get_project read made earlier by the same store, otherwise WorkEdge's api-properties function with the same key in x-api-key",
    response: "property{id,name,address(text),property_type,...}",
    notes: "No get_property MCP tool, but api-properties (same key, same project) reads one. The address is one text field; no year built or floor area. A sync profile on the key that turns off outbound properties makes it 403.",
  },
  listPhotos: {
    operation: "listPhotos",
    call: "mcp: list_photos { project_id, limit, cursor }",
    availability: "mcp-live",
    auth: "account-api-key",
    request: "project_id, limit (max 200), cursor",
    response: "{ photos[{id,timestamp,gps_coordinates,caption,url,...}], next_cursor, url_expires_in_seconds }",
    notes: "No photo categories yet (KAN-125 item 5); signed links last 1 hour and are never stored.",
  },
  listVideos: {
    operation: "listVideos",
    call: "mcp: list_videos { project_id, limit, cursor }",
    availability: "mcp-live",
    auth: "account-api-key",
    request: "project_id, limit (max 200), cursor",
    response: "{ videos[{id,title,caption,timestamp,video_url,transcript_status,...}], next_cursor }",
    notes: "Full transcripts come from get_video_transcript; this store leaves `transcript` null.",
  },
  listEquipment: {
    operation: "listEquipment",
    call: "mcp: list_equipment { project_id | property_id }",
    availability: "mcp-live",
    auth: "account-api-key",
    request: "exactly one of project_id, property_id",
    response: "{ equipment[{id,equipment_type,manufacturer,model_number,serial_number,installed_date,photos[...]}] }",
    notes: "Up to 200 entries, no paging.",
  },
  uploadMedia: {
    operation: "uploadMedia",
    call: "KAN-125 item 1: upload_media",
    availability: "kan-125-pending",
    auth: "account-api-key",
    request: "project_id, kind, category, caption, captured_at, metadata{source,assessment_id,field_key}, file",
    response: "{ media_id }",
    notes: "Blocking for phase 3 capture (ADR-028); jobstore-local covers the gap (ADR-031).",
  },
  saveReport: {
    operation: "saveReport",
    call: "KAN-125 item 2: save_report with a ready PDF",
    availability: "kan-125-pending",
    auth: "account-api-key",
    request: "project_id, title, report_type 'engineering', pdf, source, assessment_id, run_id",
    response: "{ report_id }",
    notes: "save_report today takes Markdown and renders WorkEdge's own PDF, not the frozen run's PDF (ADR-037).",
  },
  addNote: {
    operation: "addNote",
    call: "KAN-125 item 3: add_note with source tags",
    availability: "kan-125-pending",
    auth: "account-api-key",
    request: "project_id, text, source, assessment_id, run_id",
    response: "{ note_id }",
    notes: "add_note exists but cannot store the ADR-030 tags yet.",
  },
  upsertEquipment: {
    operation: "upsertEquipment",
    call: "KAN-125 item 4: equipment create or update",
    availability: "kan-125-pending",
    auth: "account-api-key",
    request: "kind, manufacturer, model, serial, installed_year, nameplate_media_ids, source, assessment_id, run_id",
    response: "EquipmentEntry",
  },
};
