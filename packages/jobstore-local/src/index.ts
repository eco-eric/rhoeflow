import {
  JobStoreError,
  LOCAL_MEDIA_ID_PREFIX,
  assertWriteBackSource,
  notImplemented,
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
  type Property,
  type SaveReportRequest,
  type SaveReportResult,
  type UploadMediaRequest,
  type UploadMediaResult,
  type UpsertEquipmentRequest,
} from "@rhoeflow/jobstore";
import type { WorkEdgeId } from "@rhoeflow/schema";
import { createClient } from "@supabase/supabase-js";
import { SupabaseMediaStorage, type MediaStorage } from "./storage.js";

export { MemoryMediaStorage, SupabaseMediaStorage, type MediaStorage, type SupabaseStorageLike } from "./storage.js";

export interface LocalJobStoreConfig {
  storage: MediaStorage;
  /** Injected id generator for reproducible tests; defaults to crypto.randomUUID. */
  id?: () => string;
  now?: () => Date;
}

/** Sidecar written next to every object so a later migration can rebuild the WorkEdge upload. */
export interface LocalMediaSidecar {
  media_id: string;
  kind: "photo" | "video";
  team_id: WorkEdgeId;
  project_id: WorkEdgeId;
  assessment_id: string;
  category: string;
  caption: string | null;
  captured_at: string | null;
  content_type: string;
  file_name: string;
  metadata: Record<string, string | number | boolean> | null;
  uploaded_at: string;
  object_path: string;
  /** Filled by the migration tool (WO-02+) once WorkEdge returns its id. */
  migrated_to_workedge_media_id: null;
}

const NOT_A_JOB_OWNER = "jobstore-local never owns jobs, properties, notes or equipment (ADR-028); use jobstore-workedge";

/**
 * Interim media store on the app's own Supabase Storage (ADR-031; integration standard
 * §10). It implements `uploadMedia` and a working-copy `saveReport`; everything else is a
 * deliberate `not_implemented`, because WorkEdge is the only system of record for jobs.
 * Every id it mints is prefixed `local:` so the Assessment shows which evidence still has
 * to migrate.
 */
export class LocalJobStore implements JobStore {
  readonly kind = "local" as const;
  readonly #storage: MediaStorage;
  readonly #id: () => string;
  readonly #now: () => Date;

  constructor(config: LocalJobStoreConfig) {
    this.#storage = config.storage;
    this.#id = config.id ?? (() => globalThis.crypto.randomUUID());
    this.#now = config.now ?? (() => new Date());
  }

  getProject(_ctx: JobStoreContext, _project_id: WorkEdgeId): Promise<Project> {
    return Promise.reject(notImplemented("local getProject", NOT_A_JOB_OWNER));
  }

  getProperty(_ctx: JobStoreContext, _property_id: WorkEdgeId): Promise<Property> {
    return Promise.reject(notImplemented("local getProperty", NOT_A_JOB_OWNER));
  }

  listPhotos(_ctx: JobStoreContext, _project_id: WorkEdgeId, _options?: ListMediaOptions): Promise<Page<MediaItem>> {
    return Promise.reject(notImplemented("local listPhotos", "listing pending local media arrives with the migration tool (proposed WO-02 item)"));
  }

  listVideos(_ctx: JobStoreContext, _project_id: WorkEdgeId, _options?: ListMediaOptions): Promise<Page<MediaItem>> {
    return Promise.reject(notImplemented("local listVideos", "listing pending local media arrives with the migration tool (proposed WO-02 item)"));
  }

  listEquipment(_ctx: JobStoreContext, _scope: ListEquipmentScope, _options?: ListOptions): Promise<Page<EquipmentEntry>> {
    return Promise.reject(notImplemented("local listEquipment", NOT_A_JOB_OWNER));
  }

  async uploadMedia(ctx: JobStoreContext, request: UploadMediaRequest): Promise<UploadMediaResult> {
    if (!ctx.team_id) throw new JobStoreError("invalid_request", "uploadMedia: ctx.team_id is required");
    if (!request.project_id) throw new JobStoreError("invalid_request", "uploadMedia: project_id is required (no assessment without a WorkEdge job)");
    if (!request.assessment_id) throw new JobStoreError("invalid_request", "uploadMedia: assessment_id is required (standard §4 step 5)");
    if (!request.category) throw new JobStoreError("invalid_request", "uploadMedia: category is required");
    if (request.content.byteLength === 0) throw new JobStoreError("invalid_request", "uploadMedia: content is empty");
    if (!request.content_type) throw new JobStoreError("invalid_request", "uploadMedia: content_type is required");

    const uuid = this.#id();
    const media_id = `${LOCAL_MEDIA_ID_PREFIX}${uuid}`;
    const ext = extensionFor(request.file_name, request.content_type);
    const object_path = `${safe(ctx.team_id)}/${safe(request.project_id)}/${safe(request.assessment_id)}/${uuid}${ext}`;

    await this.#storage.put(object_path, request.content, request.content_type);

    const sidecar: LocalMediaSidecar = {
      media_id,
      kind: request.kind,
      team_id: ctx.team_id,
      project_id: request.project_id,
      assessment_id: request.assessment_id,
      category: request.category,
      caption: request.caption,
      captured_at: request.captured_at,
      content_type: request.content_type,
      file_name: request.file_name,
      metadata: request.metadata,
      uploaded_at: this.#now().toISOString(),
      object_path,
      migrated_to_workedge_media_id: null,
    };
    await this.#storage.put(`${object_path}.meta.json`, new TextEncoder().encode(JSON.stringify(sidecar, null, 2)), "application/json");

    return { media_id, kind: request.kind, stored_in: "local" };
  }

  /** Working copy only (ADR-016); the copy of record is the WorkEdge project's (ADR-030). */
  async saveReport(ctx: JobStoreContext, request: SaveReportRequest): Promise<SaveReportResult> {
    assertWriteBackSource(request, "saveReport");
    if (request.content.byteLength === 0) throw new JobStoreError("invalid_request", "saveReport: content is empty");
    const uuid = this.#id();
    const path = `${safe(ctx.team_id)}/${safe(request.project_id)}/${safe(request.assessment_id)}/reports/${safe(request.run_id)}-${uuid}.pdf`;
    await this.#storage.put(path, request.content, request.content_type);
    return { report_id: `${LOCAL_MEDIA_ID_PREFIX}${uuid}`, stored_in: "local" };
  }

  addNote(_ctx: JobStoreContext, request: AddNoteRequest): Promise<AddNoteResult> {
    try {
      assertWriteBackSource(request, "addNote");
    } catch (e) {
      return Promise.reject(e);
    }
    return Promise.reject(notImplemented("local addNote", NOT_A_JOB_OWNER));
  }

  upsertEquipment(_ctx: JobStoreContext, request: UpsertEquipmentRequest): Promise<EquipmentEntry> {
    try {
      assertWriteBackSource(request, "upsertEquipment");
    } catch (e) {
      return Promise.reject(e);
    }
    return Promise.reject(notImplemented("local upsertEquipment", NOT_A_JOB_OWNER));
  }
}

function safe(segment: string): string {
  const s = segment.replace(/[^A-Za-z0-9._-]/g, "_");
  if (!s) throw new JobStoreError("invalid_request", "empty path segment");
  return s;
}

function extensionFor(file_name: string, content_type: string): string {
  const fromName = /\.[A-Za-z0-9]{1,8}$/.exec(file_name)?.[0]?.toLowerCase();
  if (fromName) return fromName;
  const byType: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/heic": ".heic",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "application/pdf": ".pdf",
  };
  return byType[content_type] ?? "";
}

export interface SupabaseLocalJobStoreOptions {
  url: string;
  anon_key: string;
  /** The app's own bucket; default `rhoe-media`. */
  bucket?: string;
  /** A user's access token so Storage RLS applies per team (standard §7). */
  access_token?: string;
}

/** Wire the real Supabase client. Reads credentials from the caller, never from a file. */
export function createSupabaseLocalJobStore(options: SupabaseLocalJobStoreOptions): LocalJobStore {
  if (!options.url || !options.anon_key) throw new Error("createSupabaseLocalJobStore requires url and anon_key");
  const client = createClient(options.url, options.anon_key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(options.access_token ? { global: { headers: { Authorization: `Bearer ${options.access_token}` } } } : {}),
  });
  return new LocalJobStore({ storage: new SupabaseMediaStorage(client.storage, options.bucket ?? "rhoe-media") });
}
