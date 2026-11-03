import { newId, nowIso, type StoreContext, type StoreDeps } from "./context.js";
import type { CreateJobRequest, UpdateJobRequest } from "./contracts.js";
import { StoreError, isStoreError } from "./errors.js";
import type { JobRow, JobShow } from "./records.js";

/**
 * RhoeFlow's own jobs (ADR-040). A load calc starts from a job: one the tech makes in RhoeFlow from
 * a customer name and an address, or one made for a WorkEdge job they picked. A job may be linked
 * to WorkEdge once and is never re-pointed; write-backs to WorkEdge happen only for linked jobs.
 * Every read and write is scoped to the signed-in account (SEC-001; RLS on rhoe.jobs).
 */

export const JOBS_PAGE_LIMIT = 25;

/** "Customer, street" when no name was given, so the list reads well. */
export function defaultJobName(customer_name: string | null, address_line1: string | null): string {
  const parts = [customer_name, address_line1].filter((p): p is string => !!p && p.trim() !== "");
  return (parts.join(", ") || "Load calc").slice(0, 200);
}

export async function createJob(deps: StoreDeps, ctx: StoreContext, req: CreateJobRequest): Promise<JobRow> {
  const at = nowIso(deps);
  return deps.db.jobs.insert({
    job_id: newId(deps),
    account_id: ctx.account_id,
    name: req.name ?? defaultJobName(req.customer_name, req.address_line1),
    customer_name: req.customer_name,
    address_line1: req.address_line1,
    address_line2: req.address_line2 ?? null,
    city: req.city ?? null,
    state: req.state ?? null,
    postal_code: req.postal_code ?? null,
    workedge_project_id: null,
    workedge_property_id: null,
    created_at: at,
    updated_at: at,
    created_by: ctx.user_id,
    archived_at: null,
    archived_by: null,
  });
}

export interface JobPage {
  items: JobRow[];
  /** Pass back as `before` for the next page; null when this was the last. */
  next_before: string | null;
}

export interface ListJobsOptions {
  before?: string | null;
  limit?: number;
  /** Active jobs by default; archived or all on request (ADR-042). */
  show?: JobShow;
  /** What the tech typed: every word must appear in the name, customer or address, any case, any order. */
  q?: string | null;
}

/**
 * Search words from what the tech typed: lower-case, split on spaces and commas, at most eight,
 * each at most 40 characters. Characters that are wildcards in SQL LIKE or PostgREST (% _ * \)
 * are dropped so a word only ever matches itself.
 */
export function jobSearchWords(q: string | null | undefined): string[] {
  if (!q) return [];
  return q
    .toLowerCase()
    .replace(/[%_*\\]/g, " ")
    .split(/[\s,]+/)
    .map((w) => w.trim().slice(0, 40))
    .filter((w) => w !== "")
    .slice(0, 8);
}

export async function listJobs(deps: StoreDeps, ctx: StoreContext, options: ListJobsOptions = {}): Promise<JobPage> {
  const limit = Math.min(Math.max(options.limit ?? JOBS_PAGE_LIMIT, 1), 100);
  const rows = await deps.db.jobs.list(ctx.account_id, {
    limit: limit + 1,
    before: options.before ?? null,
    show: options.show ?? "active",
    words: jobSearchWords(options.q),
  });
  const items = rows.slice(0, limit);
  return { items, next_before: rows.length > limit ? (items.at(-1)?.created_at ?? null) : null };
}

/**
 * Archive a job, or bring it back (ADR-042). Archiving only hides it from the active list: the job,
 * its load calcs, runs and reports stay, it can still be opened, and the WorkEdge link is kept.
 * Archiving an archived job (or restoring an active one) changes nothing.
 */
export async function setJobArchived(deps: StoreDeps, ctx: StoreContext, job_id: string, archived: boolean): Promise<JobRow> {
  const job = await getJob(deps, ctx, job_id);
  if ((job.archived_at !== null) === archived) return job;
  const at = nowIso(deps);
  const row = await deps.db.jobs.setArchived(ctx.account_id, job_id, archived ? at : null, archived ? ctx.user_id : null, at);
  if (!row) throw new StoreError("not_found", `job ${job_id} not found`);
  return row;
}

export async function getJob(deps: StoreDeps, ctx: StoreContext, job_id: string): Promise<JobRow> {
  const row = await deps.db.jobs.get(ctx.account_id, job_id);
  if (!row) throw new StoreError("not_found", `job ${job_id} not found`);
  return row;
}

export async function updateJob(deps: StoreDeps, ctx: StoreContext, job_id: string, req: UpdateJobRequest): Promise<JobRow> {
  await getJob(deps, ctx, job_id);
  const patch: Parameters<StoreDeps["db"]["jobs"]["update"]>[2] = { updated_at: nowIso(deps) };
  for (const k of ["name", "customer_name", "address_line1", "address_line2", "city", "state", "postal_code"] as const) {
    if (req[k] !== undefined) (patch as Record<string, unknown>)[k] = req[k];
  }
  const row = await deps.db.jobs.update(ctx.account_id, job_id, patch);
  if (!row) throw new StoreError("not_found", `job ${job_id} not found`);
  return row;
}

export interface WorkEdgeJobRef {
  project_id: string;
  property_id: string | null;
}

/**
 * Link a job to a WorkEdge job, once (ADR-040). Its assessments get the WorkEdge ids too, so the
 * next accepted revision carries them and write-backs can start. Linking a job to the WorkEdge job
 * it is already linked to is a no-op; anything else that is already linked is refused.
 */
export async function linkJobToWorkEdge(deps: StoreDeps, ctx: StoreContext, job_id: string, ref: WorkEdgeJobRef): Promise<JobRow> {
  const job = await getJob(deps, ctx, job_id);
  if (job.workedge_project_id) {
    if (job.workedge_project_id === ref.project_id) return job;
    throw new StoreError("conflict", "this job is already linked to another WorkEdge job; a link is never re-pointed");
  }
  const taken = await deps.db.jobs.findByWorkEdgeProject(ctx.account_id, ref.project_id);
  if (taken) throw new StoreError("conflict", "that WorkEdge job already has a RhoeFlow job", { job_id: taken.job_id });
  const linked = await deps.db.jobs.linkWorkEdge(ctx.account_id, job_id, ref.project_id, ref.property_id, nowIso(deps));
  if (!linked) throw new StoreError("conflict", "the job was linked by someone else meanwhile; reload");
  await deps.db.assessments.linkWorkEdge(ctx.account_id, job_id, ref.project_id, ref.property_id);
  return linked;
}

export interface WorkEdgeJobSeed extends WorkEdgeJobRef {
  name: string;
  customer_name?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
}

/** The account's RhoeFlow job for a WorkEdge job, if it has one. */
export async function findJobByWorkEdgeProject(deps: StoreDeps, ctx: StoreContext, project_id: string): Promise<JobRow | null> {
  return deps.db.jobs.findByWorkEdgeProject(ctx.account_id, project_id);
}

/** Opening a WorkEdge job finds its RhoeFlow job, or makes one copying WorkEdge's name and address. */
export async function findOrCreateJobForWorkEdge(deps: StoreDeps, ctx: StoreContext, seed: WorkEdgeJobSeed): Promise<{ job: JobRow; created: boolean }> {
  const found = await deps.db.jobs.findByWorkEdgeProject(ctx.account_id, seed.project_id);
  if (found) return { job: found, created: false };
  const at = nowIso(deps);
  const clip = (v: string | null | undefined, max: number) => (v && v.trim() !== "" ? v.trim().slice(0, max) : null);
  try {
    const job = await deps.db.jobs.insert({
      job_id: newId(deps),
      account_id: ctx.account_id,
      name: clip(seed.name, 200) ?? defaultJobName(clip(seed.customer_name, 200), clip(seed.address_line1, 200)),
      customer_name: clip(seed.customer_name, 200),
      address_line1: clip(seed.address_line1, 200),
      address_line2: clip(seed.address_line2, 200),
      city: clip(seed.city, 100),
      state: clip(seed.state, 50),
      postal_code: clip(seed.postal_code, 20),
      workedge_project_id: seed.project_id,
      workedge_property_id: seed.property_id,
      created_at: at,
      updated_at: at,
      created_by: ctx.user_id,
      archived_at: null,
      archived_by: null,
    });
    return { job, created: true };
  } catch (e) {
    // Two taps raced on the same WorkEdge job: the other one made it.
    if (isStoreError(e) && e.code === "conflict") {
      const raced = await deps.db.jobs.findByWorkEdgeProject(ctx.account_id, seed.project_id);
      if (raced) return { job: raced, created: false };
    }
    throw e;
  }
}

/** One line for reports and lists: street, then "city, state zip". */
export function jobAddress(job: Pick<JobRow, "address_line1" | "address_line2" | "city" | "state" | "postal_code">): string | null {
  const cityLine = [job.city, [job.state, job.postal_code].filter(Boolean).join(" ")].filter((p) => p && p !== "").join(", ");
  const parts = [job.address_line1, job.address_line2, cityLine].filter((p): p is string => !!p && p !== "");
  return parts.length ? parts.join(", ") : null;
}
