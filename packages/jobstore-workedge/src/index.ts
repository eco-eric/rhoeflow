import {
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
import { WORKEDGE_CALLS } from "./calls.js";

export { WORKEDGE_CALLS } from "./calls.js";
export type { WorkEdgeCall, CallAvailability } from "./calls.js";

export interface WorkEdgeJobStoreConfig {
  /** WorkEdge API origin, e.g. https://api.workedge.example; no path. */
  base_url: string;
  /** Team API key now; per-user OAuth when WorkEdge offers it (standard §6). */
  api_key: string;
  /** Injected for tests. WO-01 never calls it. */
  fetch?: typeof fetch;
}

/**
 * JobStore over the WorkEdge API/MCP (ADR-011, ADR-031). WO-01 scope: every operation is
 * stubbed and throws `not_implemented` naming the provisional WorkEdge call from
 * `WORKEDGE_CALLS`. No request leaves this class. Writes still validate the ADR-030
 * write-back source first, so callers get the same contract errors they will get later.
 */
export class WorkEdgeJobStore implements JobStore {
  readonly kind = "workedge" as const;
  readonly #config: WorkEdgeJobStoreConfig;

  constructor(config: WorkEdgeJobStoreConfig) {
    if (!config.base_url || !config.api_key) {
      throw new Error("WorkEdgeJobStore requires base_url and api_key");
    }
    this.#config = config;
  }

  /** Exposed for tests only: confirms the stub never dials out. */
  get baseUrl(): string {
    return this.#config.base_url;
  }

  getProject(_ctx: JobStoreContext, _project_id: WorkEdgeId): Promise<Project> {
    return Promise.reject(notImplemented(WORKEDGE_CALLS["getProject"]!.call, "WO-01 stub; live calls begin in WO-02 after schema confirmation"));
  }

  getProperty(_ctx: JobStoreContext, _property_id: WorkEdgeId): Promise<Property> {
    return Promise.reject(notImplemented(WORKEDGE_CALLS["getProperty"]!.call, "WO-01 stub"));
  }

  listPhotos(_ctx: JobStoreContext, _project_id: WorkEdgeId, _options?: ListMediaOptions): Promise<Page<MediaItem>> {
    return Promise.reject(notImplemented(WORKEDGE_CALLS["listPhotos"]!.call, "WO-01 stub; MCP server not yet shipped"));
  }

  listVideos(_ctx: JobStoreContext, _project_id: WorkEdgeId, _options?: ListMediaOptions): Promise<Page<MediaItem>> {
    return Promise.reject(notImplemented(WORKEDGE_CALLS["listVideos"]!.call, "WO-01 stub; MCP server not yet shipped"));
  }

  listEquipment(_ctx: JobStoreContext, _scope: ListEquipmentScope, _options?: ListOptions): Promise<Page<EquipmentEntry>> {
    return Promise.reject(notImplemented(WORKEDGE_CALLS["listEquipment"]!.call, "WO-01 stub; MCP server not yet shipped"));
  }

  uploadMedia(_ctx: JobStoreContext, request: UploadMediaRequest): Promise<UploadMediaResult> {
    if (!request.assessment_id) {
      return Promise.reject(new Error("uploadMedia: assessment_id is required (standard §4 step 5)"));
    }
    return Promise.reject(
      notImplemented(WORKEDGE_CALLS["uploadMedia"]!.call, "not on WorkEdge's roadmap yet (blocking for phase 3); use jobstore-local meanwhile"),
    );
  }

  saveReport(_ctx: JobStoreContext, request: SaveReportRequest): Promise<SaveReportResult> {
    try {
      assertWriteBackSource(request, "saveReport");
    } catch (e) {
      return Promise.reject(e);
    }
    return Promise.reject(notImplemented(WORKEDGE_CALLS["saveReport"]!.call, "WO-01 stub"));
  }

  addNote(_ctx: JobStoreContext, request: AddNoteRequest): Promise<AddNoteResult> {
    try {
      assertWriteBackSource(request, "addNote");
    } catch (e) {
      return Promise.reject(e);
    }
    return Promise.reject(notImplemented(WORKEDGE_CALLS["addNote"]!.call, "WO-01 stub"));
  }

  upsertEquipment(_ctx: JobStoreContext, request: UpsertEquipmentRequest): Promise<EquipmentEntry> {
    try {
      assertWriteBackSource(request, "upsertEquipment");
    } catch (e) {
      return Promise.reject(e);
    }
    return Promise.reject(notImplemented(WORKEDGE_CALLS["upsertEquipment"]!.call, "WO-01 stub"));
  }
}
