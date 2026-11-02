import {
  JobStoreError,
  assertWriteBackSource,
  isArchivedStatus,
  nameMatches,
  type ProjectSearchPage,
  type SearchProjectsOptions,
  type AddNoteRequest,
  type AddNoteResult,
  type EquipmentEntry,
  type JobStore,
  type JobStoreContext,
  type ListEquipmentScope,
  type ListMediaOptions,
  type ListOptions,
  type MediaItem,
  type Page,
  type Project,
  type ProjectSummary,
  type Property,
  type SaveReportRequest,
  type SaveReportResult,
  type UploadMediaRequest,
  type UploadMediaResult,
  type UpsertEquipmentRequest,
} from "@rhoeflow/jobstore";
import type { WorkEdgeId } from "@rhoeflow/schema";
import { WORKEDGE_CALLS } from "./calls.js";
import { McpClient, type McpToolInfo } from "./mcp.js";
import {
  mapEquipment,
  mapPhoto,
  mapProject,
  mapProperty,
  mapVideo,
  type WeGetProject,
  type WeListEquipment,
  type WeListPhotos,
  type WeListProjects,
  type WeListVideos,
  type WeProperty,
} from "./map.js";

export { WORKEDGE_CALLS } from "./calls.js";
export type { WorkEdgeCall, CallAvailability } from "./calls.js";
export { McpClient, MCP_PROTOCOL_VERSION, type McpClientConfig } from "./mcp.js";
export { parseAddress, equipmentKind } from "./map.js";

export interface WorkEdgeJobStoreConfig {
  /** WorkEdge MCP address (`WORKEDGE_MCP_URL`), one value for every account (ADR-038). */
  mcp_url: string;
  /** The calling account's own WorkEdge key, decrypted for this request only (ADR-038). */
  api_key: string;
  /** The account's team: the only team the key can see. Stamped on every read model. */
  team_id: WorkEdgeId;
  /** Injected for tests. */
  fetch?: typeof fetch;
  /** Injected for tests (signed-link expiry). */
  now?: () => Date;
}

const MAX_LIMIT = 200;

function limitOf(options?: ListOptions): number {
  const n = options?.limit ?? 50;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_LIMIT);
}

function pageArgs(options?: ListOptions): Record<string, unknown> {
  return { limit: limitOf(options), ...(options?.cursor ? { cursor: options.cursor } : {}) };
}

/**
 * What WorkEdge's `list_projects` takes beyond limit and cursor, read once from `tools/list`
 * (ADR-041). WorkEdge may add a name search and an archived filter; RhoeFlow uses them as soon as
 * the tool offers them, and until then reads pages and matches names itself.
 */
export interface ListProjectsCaps {
  /** The argument that searches by name, if any. */
  search: string | null;
  /** How the tool filters archived jobs, if it can. */
  archived: { arg: string; kind: "status" | "archived_bool" | "include_archived" } | null;
}

const SEARCH_ARGS = ["query", "search", "q", "name", "text"];
const CAPS_TTL_MS = 10 * 60_000;
const capsCache = new Map<string, { at: number; caps: ListProjectsCaps }>();

/** Tests only: forget what tools/list said. */
export function resetListProjectsCaps(): void {
  capsCache.clear();
}

export function listProjectsCaps(tools: McpToolInfo[]): ListProjectsCaps {
  const props = tools.find((t) => t.name === "list_projects")?.inputSchema?.properties ?? {};
  const search = SEARCH_ARGS.find((a) => a in props) ?? null;
  const archived =
    "status" in props
      ? { arg: "status", kind: "status" as const }
      : "archived" in props
        ? { arg: "archived", kind: "archived_bool" as const }
        : "include_archived" in props
          ? { arg: "include_archived", kind: "include_archived" as const }
          : null;
  return { search, archived };
}

/** Pages read per search when WorkEdge has no search of its own: 10 x 200 = the newest 2,000 jobs. */
const SCAN_PAGES = 10;
const SEARCH_LIMIT = 25;

function archivedOf(p: { status?: string | null; archived?: boolean | null }): boolean | null {
  if (typeof p.archived === "boolean") return p.archived;
  if (typeof p.status === "string") return isArchivedStatus(p.status);
  return null;
}

function pending(operation: string, detail: string): JobStoreError {
  const call = WORKEDGE_CALLS[operation]!.call;
  return new JobStoreError("not_implemented", `${call}: ${detail}`, { call });
}

/**
 * JobStore over WorkEdge's MCP server with one account's own key (ADR-031, ADR-038). One instance
 * serves one request for one account; nothing it reads is persisted (ADR-028).
 *
 * Reads are live. Writes stay `not_implemented` until WorkEdge ships KAN-125, after validating the
 * ADR-030 write-back source so callers already get the final contract errors.
 */
export class WorkEdgeJobStore implements JobStore {
  readonly kind = "workedge" as const;
  readonly #client: McpClient;
  readonly #mcpUrl: string;
  readonly #team: WorkEdgeId;
  readonly #now: () => Date;
  /** Properties already read in this request (from get_project or api-properties). */
  readonly #properties = new Map<string, Property>();

  constructor(config: WorkEdgeJobStoreConfig) {
    if (!config.mcp_url || !config.api_key || !config.team_id) {
      throw new Error("WorkEdgeJobStore requires mcp_url, api_key and team_id");
    }
    this.#client = new McpClient({ mcp_url: config.mcp_url, api_key: config.api_key, ...(config.fetch ? { fetch: config.fetch } : {}) });
    this.#mcpUrl = config.mcp_url;
    this.#team = config.team_id;
    this.#now = config.now ?? (() => new Date());
  }

  #checkTeam(ctx: JobStoreContext): void {
    if (ctx.team_id !== this.#team) {
      throw new JobStoreError("forbidden", "this WorkEdge connection belongs to another account");
    }
  }

  async listProjects(ctx: JobStoreContext, options?: ListOptions): Promise<Page<ProjectSummary>> {
    this.#checkTeam(ctx);
    const r = await this.#client.callTool<WeListProjects>("list_projects", pageArgs(options));
    return { items: r.projects.map((p) => ({ id: p.id, name: p.name })), next_cursor: r.next_cursor ?? null };
  }

  async #caps(): Promise<ListProjectsCaps> {
    const hit = capsCache.get(this.#mcpUrl);
    if (hit && this.#now().getTime() - hit.at < CAPS_TTL_MS) return hit.caps;
    let caps: ListProjectsCaps;
    try {
      caps = listProjectsCaps(await this.#client.listTools());
    } catch (e) {
      // A refused key is the person's problem to fix; anything else just means "no extras".
      if (e instanceof JobStoreError && (e.code === "unauthorized" || e.code === "rate_limited")) throw e;
      caps = { search: null, archived: null };
    }
    capsCache.set(this.#mcpUrl, { at: this.#now().getTime(), caps });
    return caps;
  }

  async searchProjects(ctx: JobStoreContext, options: SearchProjectsOptions): Promise<ProjectSearchPage> {
    this.#checkTeam(ctx);
    const query = options.query.trim();
    const show = options.show ?? "active";
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? SEARCH_LIMIT), 1), 50);
    const caps = await this.#caps();

    const archivedArgs = (): Record<string, unknown> => {
      if (!caps.archived || show === "all") return caps.archived?.kind === "include_archived" ? { include_archived: true } : {};
      if (caps.archived.kind === "status") return { status: show === "archived" ? "archived" : "active" };
      if (caps.archived.kind === "archived_bool") return { archived: show === "archived" };
      return { include_archived: show === "archived" };
    };
    const keep = (p: WeListProjects["projects"][number]): boolean | null => {
      if (show === "all") return true;
      const a = archivedOf(p);
      return a === null ? null : (show === "archived") === a;
    };

    if (caps.search) {
      const r = await this.#client.callTool<WeListProjects>("list_projects", { [caps.search]: query, limit, ...(options.cursor ? { cursor: options.cursor } : {}), ...archivedArgs() });
      const known = r.projects.map((p) => keep(p));
      const localFilter = !caps.archived || caps.archived.kind === "include_archived";
      const items = r.projects.filter((p, i) => !localFilter || known[i] !== false).map((p) => ({ id: p.id, name: p.name, status: p.status ?? null }));
      const show_applied = show === "all" || (caps.archived !== null && caps.archived.kind !== "include_archived") || known.every((k) => k !== null);
      return { items, next_cursor: r.next_cursor ?? null, show_applied, complete: true };
    }

    // No search in WorkEdge yet: read the newest pages and match names here (ADR-041).
    const matches: { id: string; name: string; status: string | null }[] = [];
    let cursor: string | null = null;
    let pages = 0;
    let anyUnknown = false;
    do {
      const r: WeListProjects = await this.#client.callTool<WeListProjects>("list_projects", { limit: MAX_LIMIT, ...(cursor ? { cursor } : {}), ...archivedArgs() });
      for (const p of r.projects) {
        if (!nameMatches(p.name ?? "", query)) continue;
        const k = keep(p);
        if (k === null) anyUnknown = true;
        if (caps.archived && caps.archived.kind !== "include_archived" ? true : k !== false) matches.push({ id: p.id, name: p.name, status: p.status ?? null });
      }
      cursor = r.next_cursor ?? null;
      pages += 1;
    } while (cursor && pages < SCAN_PAGES);
    const start = options.cursor && /^\d+$/.test(options.cursor) ? Number(options.cursor) : 0;
    const show_applied = show === "all" || (caps.archived !== null && caps.archived.kind !== "include_archived") || !anyUnknown;
    return {
      items: matches.slice(start, start + limit),
      next_cursor: start + limit < matches.length ? String(start + limit) : null,
      show_applied,
      complete: cursor === null,
    };
  }

  async getProject(ctx: JobStoreContext, project_id: WorkEdgeId): Promise<Project> {
    this.#checkTeam(ctx);
    const r = await this.#client.callTool<WeGetProject>("get_project", { project_id });
    if (r.property) this.#properties.set(r.property.id, mapProperty(r.property, this.#team));
    return mapProject(r, this.#team);
  }

  async getProperty(ctx: JobStoreContext, property_id: WorkEdgeId): Promise<Property> {
    this.#checkTeam(ctx);
    const cached = this.#properties.get(property_id);
    if (cached) return structuredClone(cached);
    // WorkEdge's MCP has no get_property tool; its api-properties function reads one with the same key.
    const r = await this.#client.restGet<{ property: WeProperty }>("api-properties", `/${encodeURIComponent(property_id)}`);
    const p = mapProperty(r.property, this.#team);
    this.#properties.set(p.id, p);
    return structuredClone(p);
  }

  async listPhotos(ctx: JobStoreContext, project_id: WorkEdgeId, options?: ListMediaOptions): Promise<Page<MediaItem>> {
    this.#checkTeam(ctx);
    if (options?.category) throw pending("listPhotos", "WorkEdge photos have no category yet (KAN-125 item 5)");
    const r = await this.#client.callTool<WeListPhotos>("list_photos", { project_id, ...pageArgs(options) });
    const now = this.#now();
    return { items: r.photos.map((p) => mapPhoto(p, project_id, now, r.url_expires_in_seconds)), next_cursor: r.next_cursor ?? null };
  }

  async listVideos(ctx: JobStoreContext, project_id: WorkEdgeId, options?: ListMediaOptions): Promise<Page<MediaItem>> {
    this.#checkTeam(ctx);
    if (options?.category) throw pending("listVideos", "WorkEdge videos have no category yet (KAN-125 item 5)");
    const r = await this.#client.callTool<WeListVideos>("list_videos", { project_id, ...pageArgs(options) });
    const now = this.#now();
    return { items: r.videos.map((v) => mapVideo(v, project_id, now, r.url_expires_in_seconds)), next_cursor: r.next_cursor ?? null };
  }

  async listEquipment(ctx: JobStoreContext, scope: ListEquipmentScope, options?: ListOptions): Promise<Page<EquipmentEntry>> {
    this.#checkTeam(ctx);
    if (options?.cursor) return { items: [], next_cursor: null }; // WorkEdge returns everything (max 200) on the first page
    const args = scope.property_id ? { property_id: scope.property_id } : { project_id: scope.project_id };
    const r = await this.#client.callTool<WeListEquipment>("list_equipment", args);
    return { items: r.equipment.map((e) => mapEquipment(e, scope.project_id)), next_cursor: null };
  }

  async uploadMedia(ctx: JobStoreContext, request: UploadMediaRequest): Promise<UploadMediaResult> {
    this.#checkTeam(ctx);
    if (!request.assessment_id) throw new JobStoreError("invalid_request", "uploadMedia: assessment_id is required (standard §4 step 5)");
    throw pending("uploadMedia", "waiting on WorkEdge (blocking for phase 3); use jobstore-local meanwhile");
  }

  async saveReport(ctx: JobStoreContext, request: SaveReportRequest): Promise<SaveReportResult> {
    this.#checkTeam(ctx);
    assertWriteBackSource(request, "saveReport");
    throw pending("saveReport", "waiting on WorkEdge; the PDF stays with the run's artifacts");
  }

  async addNote(ctx: JobStoreContext, request: AddNoteRequest): Promise<AddNoteResult> {
    this.#checkTeam(ctx);
    assertWriteBackSource(request, "addNote");
    throw pending("addNote", "waiting on WorkEdge");
  }

  async upsertEquipment(ctx: JobStoreContext, request: UpsertEquipmentRequest): Promise<EquipmentEntry> {
    this.#checkTeam(ctx);
    assertWriteBackSource(request, "upsertEquipment");
    throw pending("upsertEquipment", "waiting on WorkEdge");
  }
}

/** What the Connect WorkEdge screen shows before an admin saves a key (ADR-038 decision 6). */
export interface KeyCheck {
  /** Up to five project names the key can see, newest first. */
  sample_projects: string[];
  /** True when the key sees more projects than the sample. */
  more: boolean;
}

/**
 * Calls WorkEdge with a pasted key before it is stored. A refused key throws `unauthorized`.
 * WorkEdge does not yet say which team a key belongs to, so the admin confirms from the names.
 */
export async function checkWorkEdgeKey(config: { mcp_url: string; api_key: string; fetch?: typeof fetch }): Promise<KeyCheck> {
  const client = new McpClient(config);
  const r = await client.callTool<WeListProjects>("list_projects", { limit: 5 });
  return { sample_projects: r.projects.map((p) => p.name).slice(0, 5), more: r.next_cursor !== null };
}
