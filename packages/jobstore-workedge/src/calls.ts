/**
 * The WorkEdge calls behind each JobStore operation, as RhoeFlow currently understands
 * them (integration standard §6). Routes and field names are PROVISIONAL: the standard
 * says WorkEdge's table and field names are confirmed from its repo once the native build
 * is merged (§11), so this table is the thing to update, and the stubs quote it.
 *
 * `availability` is the standard's own wording, not a promise.
 */
export type CallAvailability =
  | "rest-today" // "available today via REST for project/property"
  | "mcp-when-shipped" // "media and equipment via the MCP server when it ships"
  | "not-on-roadmap"; // "the one call not on the current WorkEdge roadmap"

export interface WorkEdgeCall {
  operation: string;
  /** Provisional HTTP route or MCP tool name. */
  call: string;
  availability: CallAvailability;
  auth: "team-api-key" | "user-oauth-later";
  request: string;
  response: string;
  notes?: string;
}

export const WORKEDGE_CALLS: Readonly<Record<string, WorkEdgeCall>> = {
  getProject: {
    operation: "getProject",
    call: "GET /v1/projects/{project_id}",
    availability: "rest-today",
    auth: "team-api-key",
    request: "path: project_id; header: Authorization: Bearer <team api key>",
    response: "{ id, team_id, property_id, customer_id, name, status, created_at }",
  },
  getProperty: {
    operation: "getProperty",
    call: "GET /v1/properties/{property_id}",
    availability: "rest-today",
    auth: "team-api-key",
    request: "path: property_id",
    response: "{ id, team_id, address{line1,line2,city,state,postal_code}, year_built, conditioned_floor_area_ft2, property_type }",
    notes: "RhoeFlow cites these as documented inputs with source workedge:property:<id>.<field>; it never copies the record (ADR-028).",
  },
  listPhotos: {
    operation: "listPhotos",
    call: "mcp: workedge.media.list { project_id, kind: 'photo', category?, cursor?, limit? }",
    availability: "mcp-when-shipped",
    auth: "team-api-key",
    request: "project_id, optional category (standard §5 names), cursor, limit",
    response: "{ items: MediaItem[] (id, category, caption, captured_at, exif, gps, signed_url{url,expires_at}), next_cursor }",
    notes: "signed_url is resolved per read and never persisted.",
  },
  listVideos: {
    operation: "listVideos",
    call: "mcp: workedge.media.list { project_id, kind: 'video', ... }",
    availability: "mcp-when-shipped",
    auth: "team-api-key",
    request: "as listPhotos",
    response: "as listPhotos, plus transcript",
  },
  listEquipment: {
    operation: "listEquipment",
    call: "mcp: workedge.equipment.list { project_id, property_id?, cursor?, limit? }",
    availability: "mcp-when-shipped",
    auth: "team-api-key",
    request: "project_id and/or property_id",
    response: "{ items: EquipmentEntry[], next_cursor }",
  },
  uploadMedia: {
    operation: "uploadMedia",
    call: "POST /v1/projects/{project_id}/media (multipart)",
    availability: "not-on-roadmap",
    auth: "team-api-key",
    request: "multipart: file; fields: kind, category, caption, captured_at, metadata{assessment_id, source: 'rhoeflow', ...}",
    response: "{ media_id, kind }",
    notes: "BLOCKING dependency for phase 3 capture (ADR-028). Ticket to be opened on WorkEdge's API/MCP epic. jobstore-local covers the gap until then (ADR-031).",
  },
  saveReport: {
    operation: "saveReport",
    call: "POST /v1/projects/{project_id}/reports (multipart)",
    availability: "mcp-when-shipped",
    auth: "team-api-key",
    request: "multipart: pdf; fields: report_type ('engineering'), title, source: 'rhoeflow', assessment_id, run_id",
    response: "{ report_id }",
    notes: "WorkEdge holds the one copy of the PDF; Supabase Storage keeps only a working copy (ADR-016, ADR-030).",
  },
  addNote: {
    operation: "addNote",
    call: "POST /v1/projects/{project_id}/notes",
    availability: "mcp-when-shipped",
    auth: "team-api-key",
    request: "{ body, links: [run_url], source: 'rhoeflow', assessment_id, run_id }",
    response: "{ note_id }",
  },
  upsertEquipment: {
    operation: "upsertEquipment",
    call: "PUT /v1/projects/{project_id}/equipment/{equipment_id?}",
    availability: "mcp-when-shipped",
    auth: "team-api-key",
    request: "{ kind, manufacturer, model, serial, installed_year, nameplate_media_ids, source: 'rhoeflow', assessment_id, run_id }",
    response: "EquipmentEntry",
  },
};
