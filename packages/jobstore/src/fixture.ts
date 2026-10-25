import type { WorkEdgeId } from "@rhoeflow/schema";
import { JobStoreError, notImplemented } from "./errors.js";
import type { JobStore } from "./jobstore.js";
import type { AddNoteResult, EquipmentEntry, JobStoreContext, MediaItem, Page, Project, Property, SaveReportResult, UploadMediaResult } from "./types.js";

/**
 * Fixture JobStore (WO-03 A2: "a fixture JobStore serves tests and development until" WorkEdge's
 * Phase 1 reads land). Holds a few illustrative projects and properties in memory, answers the
 * reads with WorkEdge's shapes and team scoping, and refuses every write. Never used against a
 * real job: the ids say `fixture` and the names say "not a real property" (GOV-002).
 */
export interface FixtureJob {
  project: Project;
  property: Property;
}

export const FIXTURE_JOBS: readonly FixtureJob[] = [
  {
    project: { id: "we_project_dev_1", team_id: "we_team_dev", property_id: "we_property_dev_1", customer_id: null, name: "Fixture job: 1960s ranch replacement (not a real property)", status: "active", created_at: "2026-10-25T09:00:00-05:00" },
    property: {
      id: "we_property_dev_1",
      team_id: "we_team_dev",
      address: { line1: "100 Fixture Ln", line2: null, city: "Dallas", state: "TX", postal_code: "75201" },
      year_built: null,
      conditioned_floor_area_ft2: null,
      property_type: "single-family detached",
    },
  },
  {
    project: { id: "we_project_dev_2", team_id: "we_team_dev", property_id: "we_property_dev_2", customer_id: null, name: "Fixture job: 2005 two-story with bonus room (not a real property)", status: "active", created_at: "2026-10-25T09:30:00-05:00" },
    property: {
      id: "we_property_dev_2",
      team_id: "we_team_dev",
      address: { line1: "200 Example Ct", line2: null, city: "Plano", state: "TX", postal_code: "75024" },
      year_built: 2005,
      conditioned_floor_area_ft2: 2820,
      property_type: "single-family detached",
    },
  },
];

export class FixtureJobStore implements JobStore {
  readonly kind = "workedge" as const;
  readonly #jobs: readonly FixtureJob[];

  constructor(jobs: readonly FixtureJob[] = FIXTURE_JOBS) {
    this.#jobs = jobs;
  }

  async getProject(ctx: JobStoreContext, project_id: WorkEdgeId): Promise<Project> {
    const j = this.#jobs.find((x) => x.project.id === project_id && x.project.team_id === ctx.team_id);
    if (!j) throw new JobStoreError("not_found", `project ${project_id} not found for this team`, { call: "fixture getProject" });
    return structuredClone(j.project);
  }

  async getProperty(ctx: JobStoreContext, property_id: WorkEdgeId): Promise<Property> {
    const j = this.#jobs.find((x) => x.property.id === property_id && x.property.team_id === ctx.team_id);
    if (!j) throw new JobStoreError("not_found", `property ${property_id} not found for this team`, { call: "fixture getProperty" });
    return structuredClone(j.property);
  }

  async listPhotos(): Promise<Page<MediaItem>> {
    return { items: [], next_cursor: null };
  }

  async listVideos(): Promise<Page<MediaItem>> {
    return { items: [], next_cursor: null };
  }

  async listEquipment(): Promise<Page<EquipmentEntry>> {
    return { items: [], next_cursor: null };
  }

  uploadMedia(): Promise<UploadMediaResult> {
    return Promise.reject(notImplemented("fixture uploadMedia", "the fixture store holds no media; use jobstore-local"));
  }
  saveReport(): Promise<SaveReportResult> {
    return Promise.reject(notImplemented("fixture saveReport", "the fixture store accepts no write-backs"));
  }
  addNote(): Promise<AddNoteResult> {
    return Promise.reject(notImplemented("fixture addNote", "the fixture store accepts no write-backs"));
  }
  upsertEquipment(): Promise<EquipmentEntry> {
    return Promise.reject(notImplemented("fixture upsertEquipment", "the fixture store accepts no write-backs"));
  }
}
