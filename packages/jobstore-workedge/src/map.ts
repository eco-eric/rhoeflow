import type { EquipmentEntry, EquipmentKind, MediaItem, Project, Property } from "@rhoeflow/jobstore";

/**
 * WorkEdge MCP reply shapes (field-doc-suite `dev`, supabase/functions/mcp, read 2026-11-01) and
 * their mapping onto RhoeFlow's read models. Only the fields RhoeFlow reads are declared; anything
 * missing maps to null, never to a guessed value (provenance rule: unknown is never zero).
 */

export interface WeProject {
  id: string;
  name: string;
  status: string | null;
  created_at: string;
}
export interface WeProperty {
  id: string;
  name: string | null;
  address: string | null;
  property_type: string | null;
}
export interface WeGetProject {
  project: WeProject;
  property: WeProperty | null;
  primary_contact: { id: string } | null;
}
export interface WePhoto {
  id: string;
  timestamp: string | null;
  gps_coordinates: unknown;
  caption: string | null;
  url: string | null;
}
export interface WeListPhotos {
  photos: WePhoto[];
  next_cursor: string | null;
  url_expires_in_seconds?: number;
}
export interface WeVideo {
  id: string;
  title: string | null;
  caption: string | null;
  timestamp: string | null;
  video_url: string | null;
}
export interface WeListVideos {
  videos: WeVideo[];
  next_cursor: string | null;
  url_expires_in_seconds?: number;
}
export interface WeEquipment {
  id: string;
  equipment_type: string | null;
  manufacturer: string | null;
  model_number: string | null;
  serial_number: string | null;
  installed_date: string | null;
  project_id: string | null;
  property_id: string | null;
  photos?: { photo_id: string; link_type: string | null }[];
}
export interface WeListEquipment {
  equipment: WeEquipment[];
}
export interface WeListProjects {
  projects: { id: string; name: string }[];
  next_cursor: string | null;
}

export function mapProject(r: WeGetProject, team_id: string): Project {
  return {
    id: r.project.id,
    team_id,
    property_id: r.property?.id ?? null,
    customer_id: r.primary_contact?.id ?? null,
    name: r.project.name,
    status: r.project.status ?? null,
    created_at: r.project.created_at,
  };
}

/** "123 Main St, Dallas, TX 75201" and "123 Main St, Suite 4, Dallas, TX 75201-1234" parse; anything else keeps only the text. */
const US_ADDRESS = /^\s*(.+?)\s*,\s*(?:(.+?)\s*,\s*)?([^,]+?)\s*,\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*(?:,\s*(?:USA|US|United States))?\s*$/;

export function parseAddress(text: string): Property["address"] {
  const m = US_ADDRESS.exec(text);
  if (!m) return { text, line1: text, line2: null, city: null, state: null, postal_code: null };
  return { text, line1: m[1]!, line2: m[2] ?? null, city: m[3]!, state: m[4]!, postal_code: m[5]! };
}

export function mapProperty(p: WeProperty, team_id: string): Property {
  const text = (p.address ?? "").trim() || (p.name ?? "").trim();
  return {
    id: p.id,
    team_id,
    address: parseAddress(text),
    // WorkEdge properties carry neither today (KAN-125 item 5); the tech enters them in RhoeFlow.
    year_built: null,
    conditioned_floor_area_ft2: null,
    property_type: p.property_type ?? null,
  };
}

function gps(v: unknown): { lat: number; lng: number } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const lat = o["lat"] ?? o["latitude"];
  const lng = o["lng"] ?? o["lon"] ?? o["longitude"];
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

const TYPE_BY_EXT: Readonly<Record<string, string>> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
};

/** Content type from the signed link's file extension; WorkEdge does not send one. */
function contentType(url: string | null, fallback: string): string {
  if (!url) return fallback;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return fallback;
  }
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return TYPE_BY_EXT[ext] ?? fallback;
}

function expiry(now: Date, seconds: number | undefined): string {
  return new Date(now.getTime() + (seconds ?? 3600) * 1000).toISOString();
}

export function mapPhoto(p: WePhoto, project_id: string, now: Date, ttl?: number): MediaItem {
  return {
    id: p.id,
    kind: "photo",
    project_id,
    category: null, // WorkEdge photos have no category yet (KAN-125 item 5)
    caption: p.caption ?? null,
    captured_at: p.timestamp ?? null,
    content_type: contentType(p.url, "application/octet-stream"),
    exif: null,
    gps: gps(p.gps_coordinates),
    transcript: null,
    signed_url: p.url ? { url: p.url, expires_at: expiry(now, ttl) } : null,
  };
}

export function mapVideo(v: WeVideo, project_id: string, now: Date, ttl?: number): MediaItem {
  return {
    id: v.id,
    kind: "video",
    project_id,
    category: null,
    caption: v.caption ?? v.title ?? null,
    captured_at: v.timestamp ?? null,
    content_type: contentType(v.video_url, "application/octet-stream"),
    exif: null,
    gps: null,
    transcript: null,
    signed_url: v.video_url ? { url: v.video_url, expires_at: expiry(now, ttl) } : null,
  };
}

/** WorkEdge's `equipment_type` is free text ("AC Unit", "Furnace", ...); unmatched text is `other`. */
export function equipmentKind(type: string | null): EquipmentKind {
  const t = (type ?? "").toLowerCase();
  if (/thermostat|controller/.test(t)) return "thermostat";
  if (/air handler|ahu|fan coil/.test(t)) return "air_handler";
  if (/furnace/.test(t)) return "furnace";
  if (/indoor|head|cassette|wall mount|ducted unit/.test(t)) return "indoor_unit";
  if (/\bac\b|a\/c|air condition|condens|heat pump|outdoor|compressor/.test(t)) return "outdoor_unit";
  return "other";
}

export function mapEquipment(e: WeEquipment, fallback_project_id: string): EquipmentEntry {
  const year = e.installed_date ? Number(e.installed_date.slice(0, 4)) : NaN;
  return {
    id: e.id,
    project_id: e.project_id ?? fallback_project_id,
    property_id: e.property_id ?? null,
    kind: equipmentKind(e.equipment_type),
    manufacturer: e.manufacturer ?? null,
    model: e.model_number ?? null,
    serial: e.serial_number ?? null,
    installed_year: Number.isInteger(year) && year > 1900 ? year : null,
    nameplate_media_ids: (e.photos ?? []).filter((p) => /nameplate/i.test(p.link_type ?? "")).map((p) => p.photo_id),
    source: null,
  };
}
