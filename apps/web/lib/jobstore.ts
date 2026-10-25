import { FixtureJobStore, isJobStoreError, type JobStore, type Project, type Property } from "@rhoeflow/jobstore";
import { WorkEdgeJobStore } from "@rhoeflow/jobstore-workedge";
import { StoreError, type StoreContext } from "@rhoeflow/store";
import { devMemoryEnabled } from "./dev";

/**
 * The one door to WorkEdge (ADR-031). Development uses the fixture JobStore (A2's stand-in);
 * elsewhere the WorkEdge JobStore, whose live calls arrive with A2. The API key is a server
 * secret (WO-03 decision 1) and never reaches the browser.
 */
export function jobStore(): JobStore {
  if (devMemoryEnabled()) return new FixtureJobStore();
  const base_url = process.env["WORKEDGE_API_URL"];
  const api_key = process.env["WORKEDGE_API_KEY"];
  if (!base_url || !api_key) throw new StoreError("unavailable", "WorkEdge reads are not connected yet (WO-03 A2 waits on WorkEdge's Phase 1 API)");
  return new WorkEdgeJobStore({ base_url, api_key });
}

export interface Job {
  project: Project;
  property: Property | null;
}

function mapJobStoreError(e: unknown): never {
  if (isJobStoreError(e)) {
    const code = e.code === "not_found" ? "not_found" : e.code === "forbidden" || e.code === "unauthorized" ? "forbidden" : "unavailable";
    throw new StoreError(code, e.code === "not_implemented" ? `WorkEdge is not connected yet: ${e.message}` : e.message, { workedge_call: e.call ?? null });
  }
  throw e;
}

/** The WorkEdge project and its property, read for the persistent context bar (ADR-027). Nothing is stored (ADR-028). */
export async function readJob(ctx: StoreContext, project_id: string): Promise<Job> {
  const js = jobStore();
  const jctx = { team_id: ctx.team_id, ...(ctx.user_id ? { user_id: ctx.user_id } : {}) };
  try {
    const project = await js.getProject(jctx, project_id);
    const property = project.property_id ? await js.getProperty(jctx, project.property_id) : null;
    return { project, property };
  } catch (e) {
    return mapJobStoreError(e);
  }
}
