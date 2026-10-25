import type { WorkEdgeId } from "@rhoeflow/schema";
import { JobStoreError } from "./errors.js";
import type {
  AddNoteRequest,
  AddNoteResult,
  EquipmentEntry,
  JobStoreContext,
  ListEquipmentScope,
  ListMediaOptions,
  ListOptions,
  MediaItem,
  Page,
  Project,
  Property,
  SaveReportRequest,
  SaveReportResult,
  UploadMediaRequest,
  UploadMediaResult,
  UpsertEquipmentRequest,
  WriteBackSource,
} from "./types.js";

/**
 * The one interface the rest of RhoeFlow depends on for anything that lives in WorkEdge
 * (ADR-031; integration standard §10). The nine operations are the WO-01 list.
 *
 * Implementations: `@rhoeflow/jobstore-workedge` (API/MCP; stubbed in WO-01) and
 * `@rhoeflow/jobstore-local` (the app's own Supabase Storage for media until WorkEdge's
 * upload endpoint ships; ids are migrated afterwards).
 *
 * Rules every implementation inherits:
 * - No direct Supabase/Postgres access to WorkEdge, no shared service-role key (standard §8).
 * - Signed URLs are returned, never stored (ADR-028).
 * - Every write carries `source: "rhoeflow"`, `assessment_id`, `run_id` (ADR-030).
 * - Pages may be partial; follow `next_cursor` (standard §6).
 */
export interface JobStore {
  readonly kind: "workedge" | "local";

  // Reads
  getProject(ctx: JobStoreContext, project_id: WorkEdgeId): Promise<Project>;
  getProperty(ctx: JobStoreContext, property_id: WorkEdgeId): Promise<Property>;
  listPhotos(ctx: JobStoreContext, project_id: WorkEdgeId, options?: ListMediaOptions): Promise<Page<MediaItem>>;
  listVideos(ctx: JobStoreContext, project_id: WorkEdgeId, options?: ListMediaOptions): Promise<Page<MediaItem>>;
  listEquipment(ctx: JobStoreContext, scope: ListEquipmentScope, options?: ListOptions): Promise<Page<EquipmentEntry>>;

  // Writes
  uploadMedia(ctx: JobStoreContext, request: UploadMediaRequest): Promise<UploadMediaResult>;
  saveReport(ctx: JobStoreContext, request: SaveReportRequest): Promise<SaveReportResult>;
  addNote(ctx: JobStoreContext, request: AddNoteRequest): Promise<AddNoteResult>;
  upsertEquipment(ctx: JobStoreContext, request: UpsertEquipmentRequest): Promise<EquipmentEntry>;
}

/** Runtime guard for the ADR-030 rule; implementations call it at the top of every write. */
export function assertWriteBackSource(request: Partial<WriteBackSource>, call: string): asserts request is WriteBackSource {
  if (request.source !== "rhoeflow") {
    throw new JobStoreError("invalid_request", `${call}: write-back must carry source: "rhoeflow" (ADR-030)`, { call });
  }
  if (!request.assessment_id || !request.run_id) {
    throw new JobStoreError("invalid_request", `${call}: write-back must carry assessment_id and run_id (ADR-030)`, { call });
  }
}

/** Evidence ids that still live in the app's own bucket and await migration (ADR-031). */
export const LOCAL_MEDIA_ID_PREFIX = "local:" as const;

export function isLocalMediaId(id: string): boolean {
  return id.startsWith(LOCAL_MEDIA_ID_PREFIX);
}
