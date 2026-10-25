import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreDb } from "../db.js";
import { StoreError } from "../errors.js";
import type { ObjectStorage } from "../object-storage.js";
import {
  AssessmentRevisionRowSchema,
  AssessmentRowSchema,
  CalcRunRowSchema,
  ReportRowSchema,
  RunArtifactRowSchema,
  ScenarioRowSchema,
  TemplateEditorRowSchema,
  TemplateRowSchema,
  TemplateVersionRowSchema,
} from "../records.js";
import type { StoreDeps } from "../context.js";

/**
 * Supabase adapters (WO-03 C1 to C3, C5). The client is the signed-in user's: it carries the
 * session JWT, so row-level security in schema `rhoe` is the real guard and the `.eq(team)`
 * filters here are belt and braces. Never a service-role key (ADR-031).
 *
 * Every row read is parsed through the zod row schema, so a column drift fails loudly at the
 * boundary instead of leaking into the services. Timestamps come back from PostgREST as ISO
 * strings with an offset, which the row schemas accept.
 */

const SCHEMA = "rhoe";

type Row = Record<string, unknown>;
type Result<T> = { data: T | null; error: { code?: string; message: string; details?: string } | null };
type CountResult = { data: Row[] | null; error: { code?: string; message: string } | null };

function mapError(error: { code?: string; message: string; details?: string }, what: string): StoreError {
  switch (error.code) {
    case "23505": // unique_violation
      return new StoreError("conflict", `${what}: ${error.details ?? error.message}`, { pg: error.code });
    case "23503": // foreign_key_violation
      return new StoreError("forbidden", `${what}: ${error.message}`, { pg: error.code });
    case "42501": // insufficient_privilege (RLS)
      return new StoreError("forbidden", `${what}: ${error.message}`, { pg: error.code });
    case "P0001": // raise exception in a trigger
      return new StoreError("conflict", `${what}: ${error.message}`, { pg: error.code });
    case "23514": // check_violation
      return new StoreError("invalid_request", `${what}: ${error.message}`, { pg: error.code });
    default:
      return new StoreError("unavailable", `${what}: ${error.message}`, { pg: error.code ?? null });
  }
}

function one<T>(r: Result<Row>, parse: (row: unknown) => T, what: string): T | null {
  if (r.error) {
    if (r.error.code === "PGRST116") return null;
    throw mapError(r.error, what);
  }
  return r.data === null ? null : parse(r.data);
}

function many<T>(r: Result<Row[]>, parse: (row: unknown) => T, what: string): T[] {
  if (r.error) throw mapError(r.error, what);
  return (r.data ?? []).map(parse);
}

/** Object storage on a private Supabase bucket. `put` never upserts: a frozen run's files are written once. */
export class SupabaseObjectStorage implements ObjectStorage {
  readonly #client: SupabaseClient;
  readonly bucket: string;

  constructor(client: SupabaseClient, bucket = "rhoe-runs") {
    if (!bucket) throw new Error("SupabaseObjectStorage requires a bucket name");
    this.#client = client;
    this.bucket = bucket;
  }

  async put(path: string, bytes: Uint8Array, content_type: string): Promise<void> {
    const { error } = await this.#client.storage.from(this.bucket).upload(path, bytes, { contentType: content_type, upsert: false });
    if (error) {
      const code = String((error as { statusCode?: unknown }).statusCode ?? "");
      if (code === "409" || /already exists|Duplicate/i.test(error.message)) throw new StoreError("conflict", `object already exists at ${path}`);
      if (code === "401" || code === "403") throw new StoreError("forbidden", `storage rejected ${path}: ${error.message}`);
      throw new StoreError("unavailable", `storage upload failed for ${path}: ${error.message}`);
    }
  }

  async get(path: string) {
    const { data, error } = await this.#client.storage.from(this.bucket).download(path);
    if (error) {
      if (/not found|404/i.test(error.message)) return null;
      throw new StoreError("unavailable", `storage download failed for ${path}: ${error.message}`);
    }
    if (!data) return null;
    return { bytes: new Uint8Array(await data.arrayBuffer()), content_type: data.type || "application/octet-stream" };
  }

  async exists(path: string): Promise<boolean> {
    return (await this.get(path)) !== null;
  }
}

export class SupabaseStoreDb implements StoreDb {
  readonly #c: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.#c = client;
  }

  private t(table: string) {
    // The default client generic types the schema call loosely; zod parses every row on the way out.
    return (this.#c.schema(SCHEMA) as unknown as { from: (t: string) => any }).from(table); // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  readonly assessments: StoreDb["assessments"] = {
    get: async (team, id) => one(await this.t("assessments").select("*").eq("workedge_team_id", team).eq("assessment_id", id).maybeSingle(), (r) => AssessmentRowSchema.parse(r), "assessments.get"),
    findOpenByProject: async (team, project_id) =>
      one(await this.t("assessments").select("*").eq("workedge_team_id", team).eq("workedge_project_id", project_id).eq("status", "open").maybeSingle(), (r) => AssessmentRowSchema.parse(r), "assessments.findOpenByProject"),
    insert: async (row) => {
      const r = one(await this.t("assessments").insert(AssessmentRowSchema.parse(row)).select("*").single(), (x) => AssessmentRowSchema.parse(x), "assessments.insert");
      if (!r) throw new StoreError("unavailable", "assessments.insert returned no row");
      return r;
    },
    updateDraft: async (team, id, expected, patch) =>
      one(
        await this.t("assessments")
          .update({ ...patch, draft_version: expected + 1 })
          .eq("workedge_team_id", team)
          .eq("assessment_id", id)
          .eq("draft_version", expected)
          .select("*")
          .maybeSingle(),
        (r) => AssessmentRowSchema.parse(r),
        "assessments.updateDraft",
      ),
    markAccepted: async (team, id, expected, revision, updated_at) =>
      one(
        await this.t("assessments").update({ revision, updated_at, draft_version: expected + 1 }).eq("workedge_team_id", team).eq("assessment_id", id).eq("draft_version", expected).select("*").maybeSingle(),
        (r) => AssessmentRowSchema.parse(r),
        "assessments.markAccepted",
      ),
    listByTemplate: async (team, template_id) => many(await this.t("assessments").select("*").eq("workedge_team_id", team).eq("template_id", template_id), (r) => AssessmentRowSchema.parse(r), "assessments.listByTemplate"),
    setStatus: async (team, id, status, updated_at) =>
      one(await this.t("assessments").update({ status, updated_at }).eq("workedge_team_id", team).eq("assessment_id", id).select("*").maybeSingle(), (r) => AssessmentRowSchema.parse(r), "assessments.setStatus"),
  };

  readonly revisions: StoreDb["revisions"] = {
    insert: async (row) => {
      const r = one(await this.t("assessment_revisions").insert(AssessmentRevisionRowSchema.parse(row)).select("*").single(), (x) => AssessmentRevisionRowSchema.parse(x), "revisions.insert");
      if (!r) throw new StoreError("unavailable", "revisions.insert returned no row");
      return r;
    },
    get: async (team, id, revision) =>
      one(await this.t("assessment_revisions").select("*").eq("workedge_team_id", team).eq("assessment_id", id).eq("revision", revision).maybeSingle(), (r) => AssessmentRevisionRowSchema.parse(r), "revisions.get"),
  };

  readonly scenarios: StoreDb["scenarios"] = {
    insert: async (row) => {
      const r = one(await this.t("scenarios").insert(ScenarioRowSchema.parse(row)).select("*").single(), (x) => ScenarioRowSchema.parse(x), "scenarios.insert");
      if (!r) throw new StoreError("unavailable", "scenarios.insert returned no row");
      return r;
    },
    get: async (team, id) => one(await this.t("scenarios").select("*").eq("workedge_team_id", team).eq("scenario_id", id).maybeSingle(), (r) => ScenarioRowSchema.parse(r), "scenarios.get"),
    listByAssessment: async (team, id) => many(await this.t("scenarios").select("*").eq("workedge_team_id", team).eq("assessment_id", id).order("created_at"), (r) => ScenarioRowSchema.parse(r), "scenarios.list"),
    update: async (team, id, expected, patch) =>
      one(
        await this.t("scenarios").update({ ...patch, scenario_version: expected + 1 }).eq("workedge_team_id", team).eq("scenario_id", id).eq("scenario_version", expected).select("*").maybeSingle(),
        (r) => ScenarioRowSchema.parse(r),
        "scenarios.update",
      ),
  };

  readonly runs: StoreDb["runs"] = {
    insert: async (row) => {
      const r = one(await this.t("calc_runs").insert(CalcRunRowSchema.parse(row)).select("*").single(), (x) => CalcRunRowSchema.parse(x), "runs.insert");
      if (!r) throw new StoreError("unavailable", "runs.insert returned no row");
      return r;
    },
    get: async (team, id) => one(await this.t("calc_runs").select("*").eq("workedge_team_id", team).eq("run_id", id).maybeSingle(), (r) => CalcRunRowSchema.parse(r), "runs.get"),
    findByIdempotencyKey: async (team, assessment_id, key) =>
      one(await this.t("calc_runs").select("*").eq("workedge_team_id", team).eq("assessment_id", assessment_id).eq("idempotency_key", key).maybeSingle(), (r) => CalcRunRowSchema.parse(r), "runs.findByIdempotencyKey"),
    findAccepted: async (team, assessment_id, input_hash, engine_version) =>
      one(
        await this.t("calc_runs").select("*").eq("workedge_team_id", team).eq("assessment_id", assessment_id).eq("status", "ok").eq("input_hash", input_hash).eq("engine_version", engine_version).maybeSingle(),
        (r) => CalcRunRowSchema.parse(r),
        "runs.findAccepted",
      ),
    transition: async (team, id, from, patch) =>
      one(await this.t("calc_runs").update(patch).eq("workedge_team_id", team).eq("run_id", id).in("status", [...from]).select("*").maybeSingle(), (r) => CalcRunRowSchema.parse(r), "runs.transition"),
    listByAssessment: async (team, id) => many(await this.t("calc_runs").select("*").eq("workedge_team_id", team).eq("assessment_id", id).order("requested_at"), (r) => CalcRunRowSchema.parse(r), "runs.listByAssessment"),
    listFresh: async (team) => many(await this.t("calc_runs").select("*").eq("workedge_team_id", team).eq("stale", false), (r) => CalcRunRowSchema.parse(r), "runs.listFresh"),
    listRunningSince: async (team, before) => many(await this.t("calc_runs").select("*").eq("workedge_team_id", team).eq("status", "running").lt("started_at", before), (r) => CalcRunRowSchema.parse(r), "runs.listRunningSince"),
    markStale: async (team, ids, reason, at) => {
      if (ids.length === 0) return 0;
      const r: CountResult = await this.t("calc_runs").update({ stale: true, stale_reason: reason, stale_at: at }).eq("workedge_team_id", team).in("run_id", ids).eq("stale", false).select("run_id");
      if (r.error) throw mapError(r.error, "runs.markStale");
      return r.data?.length ?? 0;
    },
  };

  readonly artifacts: StoreDb["artifacts"] = {
    insertMany: async (rows) => {
      if (rows.length === 0) return;
      const r: CountResult = await this.t("run_artifacts").insert(rows.map((x) => RunArtifactRowSchema.parse(x)));
      if (r.error) throw mapError(r.error, "artifacts.insertMany");
    },
    listByRun: async (team, run_id) => many(await this.t("run_artifacts").select("*").eq("workedge_team_id", team).eq("run_id", run_id).order("path"), (r) => RunArtifactRowSchema.parse(r), "artifacts.listByRun"),
  };

  readonly reports: StoreDb["reports"] = {
    insert: async (row) => {
      const r = one(await this.t("reports").insert(ReportRowSchema.parse(row)).select("*").single(), (x) => ReportRowSchema.parse(x), "reports.insert");
      if (!r) throw new StoreError("unavailable", "reports.insert returned no row");
      return r;
    },
    listByAssessment: async (team, id) => many(await this.t("reports").select("*").eq("workedge_team_id", team).eq("assessment_id", id).order("report_revision"), (r) => ReportRowSchema.parse(r), "reports.list"),
  };

  readonly templates: StoreDb["templates"] = {
    get: async (team, id) => one(await this.t("templates").select("*").eq("workedge_team_id", team).eq("template_id", id).maybeSingle(), (r) => TemplateRowSchema.parse(r), "templates.get"),
    list: async (team) => many(await this.t("templates").select("*").eq("workedge_team_id", team).order("template_id"), (r) => TemplateRowSchema.parse(r), "templates.list"),
    insert: async (row) => {
      const r = one(await this.t("templates").insert(TemplateRowSchema.parse(row)).select("*").single(), (x) => TemplateRowSchema.parse(x), "templates.insert");
      if (!r) throw new StoreError("unavailable", "templates.insert returned no row");
      return r;
    },
    advance: async (team, id, expected, patch) =>
      one(await this.t("templates").update(patch).eq("workedge_team_id", team).eq("template_id", id).eq("current_version", expected).select("*").maybeSingle(), (r) => TemplateRowSchema.parse(r), "templates.advance"),
    setArchived: async (team, id, archived, updated_at) =>
      one(await this.t("templates").update({ archived, updated_at }).eq("workedge_team_id", team).eq("template_id", id).select("*").maybeSingle(), (r) => TemplateRowSchema.parse(r), "templates.setArchived"),
  };

  readonly templateVersions: StoreDb["templateVersions"] = {
    insert: async (row) => {
      const r = one(await this.t("template_versions").insert(TemplateVersionRowSchema.parse(row)).select("*").single(), (x) => TemplateVersionRowSchema.parse(x), "templateVersions.insert");
      if (!r) throw new StoreError("unavailable", "templateVersions.insert returned no row");
      return r;
    },
    get: async (team, id, version) =>
      one(await this.t("template_versions").select("*").eq("workedge_team_id", team).eq("template_id", id).eq("version", version).maybeSingle(), (r) => TemplateVersionRowSchema.parse(r), "templateVersions.get"),
    list: async (team, id) => many(await this.t("template_versions").select("*").eq("workedge_team_id", team).eq("template_id", id).order("version"), (r) => TemplateVersionRowSchema.parse(r), "templateVersions.list"),
  };

  readonly templateEditors: StoreDb["templateEditors"] = {
    isEditor: async (team, user_id) => {
      const r = one(await this.t("template_editors").select("*").eq("workedge_team_id", team).eq("workedge_user_id", user_id).maybeSingle(), (x) => TemplateEditorRowSchema.parse(x), "templateEditors.isEditor");
      return r !== null;
    },
    grant: async (row) => {
      const parsed = TemplateEditorRowSchema.parse(row);
      const existing = one(await this.t("template_editors").select("*").eq("workedge_team_id", parsed.workedge_team_id).eq("workedge_user_id", parsed.workedge_user_id).maybeSingle(), (x) => TemplateEditorRowSchema.parse(x), "templateEditors.grant");
      if (existing) return existing;
      const r = one(await this.t("template_editors").insert(parsed).select("*").single(), (x) => TemplateEditorRowSchema.parse(x), "templateEditors.grant");
      if (!r) throw new StoreError("unavailable", "templateEditors.grant returned no row");
      return r;
    },
    list: async (team) => many(await this.t("template_editors").select("*").eq("workedge_team_id", team), (r) => TemplateEditorRowSchema.parse(r), "templateEditors.list"),
  };
}

/** The production `StoreDeps`: the user's Supabase client for both the database and the bundle bucket. */
export function createSupabaseStore(client: SupabaseClient, options: { runs_bucket?: string } = {}): StoreDeps {
  return { db: new SupabaseStoreDb(client), artifacts: new SupabaseObjectStorage(client, options.runs_bucket ?? "rhoe-runs") };
}
