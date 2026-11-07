import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreDb } from "../db.js";
import { StoreError } from "../errors.js";
import type { ObjectStorage } from "../object-storage.js";
import {
  AssessmentRevisionRowSchema,
  AssessmentRowSchema,
  CalcRunRowSchema,
  JobRowSchema,
  ReportRowSchema,
  RunArtifactRowSchema,
  ScenarioRowSchema,
  TemplateEditorRowSchema,
  TemplateRowSchema,
  TemplateVersionRowSchema,
} from "../records.js";
import type { StoreDeps } from "../context.js";
import { CountyHomeRowSchema, JobSiteRowSchema } from "../house.js";
import { AccountDesignRowSchema } from "../design.js";

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

/** rhoe.jobs columns the app reads; never the generated search_text (ADR-042), which the strict row schema refuses. */
const JOB_COLUMNS = "job_id, account_id, name, customer_name, address_line1, address_line2, city, state, postal_code, workedge_project_id, workedge_property_id, created_at, updated_at, created_by, archived_at, archived_by";

/** rhoe.county_property columns the app reads; never loaded_at. */
const COUNTY_COLUMNS = "county, account_num, roll_year, situs_key, situs_address, city, year_built, living_area_ft2, stories, foundation_raw, garage_spaces, bedrooms, pool, central_heat, central_air, situs_zip, heating_raw, cooling_raw, roof_raw, exterior_raw, garage_raw";

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

  readonly jobSites: StoreDb["jobSites"] = {
    get: async (team, id) => one(await this.t("job_sites").select("*").eq("account_id", team).eq("job_id", id).maybeSingle(), (r) => JobSiteRowSchema.parse(r), "jobSites.get"),
    upsert: async (row) => {
      const r = one(await this.t("job_sites").upsert(JobSiteRowSchema.parse(row), { onConflict: "job_id" }).select("*").single(), (x) => JobSiteRowSchema.parse(x), "jobSites.upsert");
      if (!r) throw new StoreError("unavailable", "jobSites.upsert returned no row");
      return r;
    },
  };

  readonly designSettings: StoreDb["designSettings"] = {
    get: async (team) => {
      const r = await this.t("account_design_settings").select("*").eq("account_id", team).maybeSingle();
      // Before migration 20261107120000 is applied the table is not there: every value is standard (ADR-047).
      if (r.error && (r.error.code === "PGRST205" || r.error.code === "42P01")) return null;
      return one(r, (x) => AccountDesignRowSchema.parse(x), "designSettings.get");
    },
    upsert: async (row) => {
      const r = one(await this.t("account_design_settings").upsert(AccountDesignRowSchema.parse(row), { onConflict: "account_id" }).select("*").single(), (x) => AccountDesignRowSchema.parse(x), "designSettings.upsert");
      if (!r) throw new StoreError("unavailable", "designSettings.upsert returned no row");
      return r;
    },
  };

  readonly countyHomes: StoreDb["countyHomes"] = {
    findBySitus: async (key) =>
      many(await this.t("county_property").select(COUNTY_COLUMNS).eq("situs_key", key).limit(5), (r) => CountyHomeRowSchema.parse(r), "countyHomes.findBySitus"),
    findByStreet: async (street, zip) =>
      many(
        await this.t("county_property").select(COUNTY_COLUMNS).eq("situs_street", street).eq("situs_zip", zip).limit(5),
        (r) => CountyHomeRowSchema.parse(r),
        "countyHomes.findByStreet",
      ),
  };

  readonly jobs: StoreDb["jobs"] = {
    get: async (team, id) => one(await this.t("jobs").select(JOB_COLUMNS).eq("account_id", team).eq("job_id", id).maybeSingle(), (r) => JobRowSchema.parse(r), "jobs.get"),
    list: async (team, { limit, before, show = "active", words = [] }) => {
      let q = this.t("jobs").select(JOB_COLUMNS).eq("account_id", team);
      if (before) q = q.lt("created_at", before);
      if (show === "active") q = q.is("archived_at", null);
      else if (show === "archived") q = q.not("archived_at", "is", null);
      // Each word must appear somewhere in the generated search_text (ADR-042). Words carry no LIKE or
      // PostgREST wildcards (jobSearchWords drops % _ * and backslashes).
      for (const w of words) q = q.ilike("search_text", `%${w}%`);
      return many(await q.order("created_at", { ascending: false }).limit(limit), (r) => JobRowSchema.parse(r), "jobs.list");
    },
    findByWorkEdgeProject: async (team, project_id) =>
      one(await this.t("jobs").select(JOB_COLUMNS).eq("account_id", team).eq("workedge_project_id", project_id).maybeSingle(), (r) => JobRowSchema.parse(r), "jobs.findByWorkEdgeProject"),
    insert: async (row) => {
      const r = one(await this.t("jobs").insert(JobRowSchema.parse(row)).select(JOB_COLUMNS).single(), (x) => JobRowSchema.parse(x), "jobs.insert");
      if (!r) throw new StoreError("unavailable", "jobs.insert returned no row");
      return r;
    },
    update: async (team, id, patch) => one(await this.t("jobs").update(patch).eq("account_id", team).eq("job_id", id).select(JOB_COLUMNS).maybeSingle(), (r) => JobRowSchema.parse(r), "jobs.update"),
    linkWorkEdge: async (team, id, project_id, property_id, updated_at) =>
      one(
        await this.t("jobs")
          .update({ workedge_project_id: project_id, workedge_property_id: property_id, updated_at })
          .eq("account_id", team)
          .eq("job_id", id)
          .is("workedge_project_id", null)
          .select(JOB_COLUMNS)
          .maybeSingle(),
        (r) => JobRowSchema.parse(r),
        "jobs.linkWorkEdge",
      ),
    setArchived: async (team, id, archived_at, archived_by, updated_at) =>
      one(
        await this.t("jobs").update({ archived_at, archived_by, updated_at }).eq("account_id", team).eq("job_id", id).select(JOB_COLUMNS).maybeSingle(),
        (r) => JobRowSchema.parse(r),
        "jobs.setArchived",
      ),
  };

  readonly assessments: StoreDb["assessments"] = {
    get: async (team, id) => one(await this.t("assessments").select("*").eq("account_id", team).eq("assessment_id", id).maybeSingle(), (r) => AssessmentRowSchema.parse(r), "assessments.get"),
    findOpenByJob: async (team, job_id) =>
      one(await this.t("assessments").select("*").eq("account_id", team).eq("job_id", job_id).eq("status", "open").maybeSingle(), (r) => AssessmentRowSchema.parse(r), "assessments.findOpenByJob"),
    listByJob: async (team, job_id) => many(await this.t("assessments").select("*").eq("account_id", team).eq("job_id", job_id).order("created_at", { ascending: false }), (r) => AssessmentRowSchema.parse(r), "assessments.listByJob"),
    linkWorkEdge: async (team, job_id, project_id, property_id) => {
      const r = (await this.t("assessments")
        .update({ workedge_project_id: project_id, workedge_property_id: property_id })
        .eq("account_id", team)
        .eq("job_id", job_id)
        .is("workedge_project_id", null)
        .select("assessment_id")) as Result<Row[]>;
      return many(r, (x) => x, "assessments.linkWorkEdge").length;
    },
    insert: async (row) => {
      const r = one(await this.t("assessments").insert(AssessmentRowSchema.parse(row)).select("*").single(), (x) => AssessmentRowSchema.parse(x), "assessments.insert");
      if (!r) throw new StoreError("unavailable", "assessments.insert returned no row");
      return r;
    },
    updateDraft: async (team, id, expected, patch) =>
      one(
        await this.t("assessments")
          .update({ ...patch, draft_version: expected + 1 })
          .eq("account_id", team)
          .eq("assessment_id", id)
          .eq("draft_version", expected)
          .select("*")
          .maybeSingle(),
        (r) => AssessmentRowSchema.parse(r),
        "assessments.updateDraft",
      ),
    markAccepted: async (team, id, expected, revision, updated_at) =>
      one(
        await this.t("assessments").update({ revision, updated_at, draft_version: expected + 1 }).eq("account_id", team).eq("assessment_id", id).eq("draft_version", expected).select("*").maybeSingle(),
        (r) => AssessmentRowSchema.parse(r),
        "assessments.markAccepted",
      ),
    listByTemplate: async (team, template_id) => many(await this.t("assessments").select("*").eq("account_id", team).eq("template_id", template_id), (r) => AssessmentRowSchema.parse(r), "assessments.listByTemplate"),
    setStatus: async (team, id, status, updated_at) =>
      one(await this.t("assessments").update({ status, updated_at }).eq("account_id", team).eq("assessment_id", id).select("*").maybeSingle(), (r) => AssessmentRowSchema.parse(r), "assessments.setStatus"),
  };

  readonly revisions: StoreDb["revisions"] = {
    insert: async (row) => {
      const r = one(await this.t("assessment_revisions").insert(AssessmentRevisionRowSchema.parse(row)).select("*").single(), (x) => AssessmentRevisionRowSchema.parse(x), "revisions.insert");
      if (!r) throw new StoreError("unavailable", "revisions.insert returned no row");
      return r;
    },
    get: async (team, id, revision) =>
      one(await this.t("assessment_revisions").select("*").eq("account_id", team).eq("assessment_id", id).eq("revision", revision).maybeSingle(), (r) => AssessmentRevisionRowSchema.parse(r), "revisions.get"),
  };

  readonly scenarios: StoreDb["scenarios"] = {
    insert: async (row) => {
      const r = one(await this.t("scenarios").insert(ScenarioRowSchema.parse(row)).select("*").single(), (x) => ScenarioRowSchema.parse(x), "scenarios.insert");
      if (!r) throw new StoreError("unavailable", "scenarios.insert returned no row");
      return r;
    },
    get: async (team, id) => one(await this.t("scenarios").select("*").eq("account_id", team).eq("scenario_id", id).maybeSingle(), (r) => ScenarioRowSchema.parse(r), "scenarios.get"),
    listByAssessment: async (team, id) => many(await this.t("scenarios").select("*").eq("account_id", team).eq("assessment_id", id).order("created_at"), (r) => ScenarioRowSchema.parse(r), "scenarios.list"),
    update: async (team, id, expected, patch) =>
      one(
        await this.t("scenarios").update({ ...patch, scenario_version: expected + 1 }).eq("account_id", team).eq("scenario_id", id).eq("scenario_version", expected).select("*").maybeSingle(),
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
    get: async (team, id) => one(await this.t("calc_runs").select("*").eq("account_id", team).eq("run_id", id).maybeSingle(), (r) => CalcRunRowSchema.parse(r), "runs.get"),
    findByIdempotencyKey: async (team, assessment_id, key) =>
      one(await this.t("calc_runs").select("*").eq("account_id", team).eq("assessment_id", assessment_id).eq("idempotency_key", key).maybeSingle(), (r) => CalcRunRowSchema.parse(r), "runs.findByIdempotencyKey"),
    findAccepted: async (team, assessment_id, input_hash, engine_version) =>
      one(
        await this.t("calc_runs").select("*").eq("account_id", team).eq("assessment_id", assessment_id).eq("status", "ok").eq("input_hash", input_hash).eq("engine_version", engine_version).maybeSingle(),
        (r) => CalcRunRowSchema.parse(r),
        "runs.findAccepted",
      ),
    transition: async (team, id, from, patch) =>
      one(await this.t("calc_runs").update(patch).eq("account_id", team).eq("run_id", id).in("status", [...from]).select("*").maybeSingle(), (r) => CalcRunRowSchema.parse(r), "runs.transition"),
    listByAssessment: async (team, id) => many(await this.t("calc_runs").select("*").eq("account_id", team).eq("assessment_id", id).order("requested_at"), (r) => CalcRunRowSchema.parse(r), "runs.listByAssessment"),
    listFresh: async (team) => many(await this.t("calc_runs").select("*").eq("account_id", team).eq("stale", false), (r) => CalcRunRowSchema.parse(r), "runs.listFresh"),
    listRunningSince: async (team, before) => many(await this.t("calc_runs").select("*").eq("account_id", team).eq("status", "running").lt("started_at", before), (r) => CalcRunRowSchema.parse(r), "runs.listRunningSince"),
    markStale: async (team, ids, reason, at) => {
      if (ids.length === 0) return 0;
      const r: CountResult = await this.t("calc_runs").update({ stale: true, stale_reason: reason, stale_at: at }).eq("account_id", team).in("run_id", ids).eq("stale", false).select("run_id");
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
    listByRun: async (team, run_id) => many(await this.t("run_artifacts").select("*").eq("account_id", team).eq("run_id", run_id).order("path"), (r) => RunArtifactRowSchema.parse(r), "artifacts.listByRun"),
  };

  readonly reports: StoreDb["reports"] = {
    insert: async (row) => {
      const r = one(await this.t("reports").insert(ReportRowSchema.parse(row)).select("*").single(), (x) => ReportRowSchema.parse(x), "reports.insert");
      if (!r) throw new StoreError("unavailable", "reports.insert returned no row");
      return r;
    },
    listByAssessment: async (team, id) => many(await this.t("reports").select("*").eq("account_id", team).eq("assessment_id", id).order("report_revision"), (r) => ReportRowSchema.parse(r), "reports.list"),
  };

  readonly templates: StoreDb["templates"] = {
    get: async (team, id) => one(await this.t("templates").select("*").eq("account_id", team).eq("template_id", id).maybeSingle(), (r) => TemplateRowSchema.parse(r), "templates.get"),
    list: async (team) => many(await this.t("templates").select("*").eq("account_id", team).order("template_id"), (r) => TemplateRowSchema.parse(r), "templates.list"),
    insert: async (row) => {
      const r = one(await this.t("templates").insert(TemplateRowSchema.parse(row)).select("*").single(), (x) => TemplateRowSchema.parse(x), "templates.insert");
      if (!r) throw new StoreError("unavailable", "templates.insert returned no row");
      return r;
    },
    advance: async (team, id, expected, patch) =>
      one(await this.t("templates").update(patch).eq("account_id", team).eq("template_id", id).eq("current_version", expected).select("*").maybeSingle(), (r) => TemplateRowSchema.parse(r), "templates.advance"),
    setArchived: async (team, id, archived, updated_at) =>
      one(await this.t("templates").update({ archived, updated_at }).eq("account_id", team).eq("template_id", id).select("*").maybeSingle(), (r) => TemplateRowSchema.parse(r), "templates.setArchived"),
  };

  readonly templateVersions: StoreDb["templateVersions"] = {
    insert: async (row) => {
      const r = one(await this.t("template_versions").insert(TemplateVersionRowSchema.parse(row)).select("*").single(), (x) => TemplateVersionRowSchema.parse(x), "templateVersions.insert");
      if (!r) throw new StoreError("unavailable", "templateVersions.insert returned no row");
      return r;
    },
    get: async (team, id, version) =>
      one(await this.t("template_versions").select("*").eq("account_id", team).eq("template_id", id).eq("version", version).maybeSingle(), (r) => TemplateVersionRowSchema.parse(r), "templateVersions.get"),
    list: async (team, id) => many(await this.t("template_versions").select("*").eq("account_id", team).eq("template_id", id).order("version"), (r) => TemplateVersionRowSchema.parse(r), "templateVersions.list"),
  };

  readonly templateEditors: StoreDb["templateEditors"] = {
    isEditor: async (team, user_id) => {
      const r = one(await this.t("template_editors").select("*").eq("account_id", team).eq("user_id", user_id).maybeSingle(), (x) => TemplateEditorRowSchema.parse(x), "templateEditors.isEditor");
      return r !== null;
    },
    grant: async (row) => {
      const parsed = TemplateEditorRowSchema.parse(row);
      const existing = one(await this.t("template_editors").select("*").eq("account_id", parsed.account_id).eq("user_id", parsed.user_id).maybeSingle(), (x) => TemplateEditorRowSchema.parse(x), "templateEditors.grant");
      if (existing) return existing;
      const r = one(await this.t("template_editors").insert(parsed).select("*").single(), (x) => TemplateEditorRowSchema.parse(x), "templateEditors.grant");
      if (!r) throw new StoreError("unavailable", "templateEditors.grant returned no row");
      return r;
    },
    list: async (team) => many(await this.t("template_editors").select("*").eq("account_id", team), (r) => TemplateEditorRowSchema.parse(r), "templateEditors.list"),
  };
}

/** The production `StoreDeps`: the user's Supabase client for both the database and the bundle bucket. */
export function createSupabaseStore(client: SupabaseClient, options: { runs_bucket?: string } = {}): StoreDeps {
  return { db: new SupabaseStoreDb(client), artifacts: new SupabaseObjectStorage(client, options.runs_bucket ?? "rhoe-runs") };
}

export { supabaseAccountsDb } from "./accounts.js";
