import { FixtureJobStore, isJobStoreError, type JobStore, type Page, type Project, type ProjectSearchPage, type ProjectShow, type ProjectSummary, type Property } from "@rhoeflow/jobstore";
import { jobStoreForAccount } from "@rhoeflow/connections";
import { StoreError, isStoreError, type WorkEdgeJobSeed } from "@rhoeflow/store";
import { connectionConfig, connectionRepo } from "./connections";
import type { RequestContext } from "./context";
import { devMemoryEnabled } from "./dev";

/**
 * The one door to WorkEdge (ADR-031). Development uses the fixture JobStore; elsewhere the WorkEdge
 * JobStore built with the calling account's own key (ADR-038), which never reaches the browser.
 */
export async function jobStore(rc: RequestContext): Promise<JobStore> {
  if (devMemoryEnabled()) return new FixtureJobStore();
  return jobStoreForAccount(connectionRepo(rc), rc.ctx, connectionConfig());
}

export interface Job {
  project: Project;
  property: Property | null;
}

function mapJobStoreError(e: unknown): never {
  if (isJobStoreError(e)) {
    const code = e.code === "not_found" ? "not_found" : e.code === "forbidden" || e.code === "unauthorized" ? "forbidden" : "unavailable";
    const message =
      e.code === "unauthorized"
        ? "WorkEdge no longer accepts this account's key; an admin reconnects WorkEdge under Settings"
        : e.code === "rate_limited"
          ? "this account's WorkEdge key has used its hourly limit; try again shortly"
          : e.code === "not_implemented"
            ? `WorkEdge does not offer this yet: ${e.message}`
            : e.message;
    throw new StoreError(code, message, { workedge_call: e.call ?? null, ...(e.code === "unauthorized" ? { reason: "workedge_key_refused" } : {}) });
  }
  throw e;
}

/** The WorkEdge project and its property, read for the persistent context bar (ADR-027). Nothing is stored (ADR-028). */
export async function readWorkEdgeJob(rc: RequestContext, project_id: string): Promise<Job> {
  const js = await jobStore(rc);
  const { ctx } = rc;
  const jctx = { team_id: ctx.account_id, ...(ctx.user_id ? { user_id: ctx.user_id } : {}) };
  try {
    const project = await js.getProject(jctx, project_id);
    const property = project.property_id ? await js.getProperty(jctx, project.property_id) : null;
    return { project, property };
  } catch (e) {
    return mapJobStoreError(e);
  }
}

/** WorkEdge jobs on the home page come a page at a time. */
export const JOBS_PAGE_SIZE = 25;

/**
 * The calling account's WorkEdge jobs, newest first, read with that account's own key (ADR-038) so
 * an account only ever sees its own team's jobs. Nothing is stored (ADR-028).
 */
export async function listWorkEdgeJobs(rc: RequestContext, cursor: string | null): Promise<Page<ProjectSummary>> {
  const js = await jobStore(rc);
  const { ctx } = rc;
  const jctx = { team_id: ctx.account_id, ...(ctx.user_id ? { user_id: ctx.user_id } : {}) };
  try {
    return await js.listProjects(jctx, { limit: JOBS_PAGE_SIZE, ...(cursor ? { cursor } : {}) });
  } catch (e) {
    return mapJobStoreError(e);
  }
}

/**
 * Finds the calling account's WorkEdge jobs by name, active or archived (ADR-041), with that
 * account's own key. A search, not a list: an account can have thousands of jobs.
 */
export async function searchWorkEdgeJobs(rc: RequestContext, query: string, show: ProjectShow, cursor: string | null): Promise<ProjectSearchPage> {
  const js = await jobStore(rc);
  const { ctx } = rc;
  const jctx = { team_id: ctx.account_id, ...(ctx.user_id ? { user_id: ctx.user_id } : {}) };
  try {
    return await js.searchProjects(jctx, { query, show, limit: JOBS_PAGE_SIZE, ...(cursor ? { cursor } : {}) });
  } catch (e) {
    return mapJobStoreError(e);
  }
}

/** True when this account can pick from WorkEdge: a key is connected (or development fixtures). */
export async function workEdgeConnected(rc: RequestContext): Promise<boolean> {
  try {
    await jobStore(rc);
    return true;
  } catch (e) {
    if (isStoreError(e) && e.details?.["reason"] === "workedge_not_connected") return false;
    throw e;
  }
}

/** What RhoeFlow copies from a WorkEdge job when it makes its own job for it (ADR-040). */
export function seedFromWorkEdge(job: Job): WorkEdgeJobSeed {
  const ad = job.property?.address;
  return {
    project_id: job.project.id,
    property_id: job.project.property_id ?? job.property?.id ?? null,
    name: job.project.name,
    address_line1: ad ? ad.line1 || ad.text : null,
    address_line2: ad?.line2 ?? null,
    city: ad?.city ?? null,
    state: ad?.state ?? null,
    postal_code: ad?.postal_code ?? null,
  };
}

export { projectIdFrom } from "./project-id";
