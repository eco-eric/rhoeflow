import { redirect } from "next/navigation";
import { findJobByWorkEdgeProject, findOrCreateJobForWorkEdge, isStoreError } from "@rhoeflow/store";
import { requirePageContext } from "../../../lib/session";
import { projectIdFrom, readWorkEdgeJob, seedFromWorkEdge } from "../../../lib/jobstore";

export const dynamic = "force-dynamic";

/**
 * Deep-link entry from a WorkEdge job: /p/<workedge project id> (D1; standard §3 entry A, amended
 * by ADR-040). It finds the account's RhoeFlow job for that WorkEdge job, or makes one copying the
 * WorkEdge job's name and address, then opens it at /j/<job id>.
 */
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  // Signed out, an expired session or no account redirect before anything renders (ADR-039).
  const rc = await requirePageContext(`/p/${encodeURIComponent(projectId)}`);
  const id = projectIdFrom(projectId);
  let target: string | null = null;
  let problem: { message: string; notConnected: boolean } | null = null;
  if (!id) {
    problem = { message: "That isn't a WorkEdge job link or id.", notConnected: false };
  } else {
    try {
      const existing = await findJobByWorkEdgeProject(rc.deps, rc.ctx, id);
      target = existing ? existing.job_id : (await findOrCreateJobForWorkEdge(rc.deps, rc.ctx, seedFromWorkEdge(await readWorkEdgeJob(rc, id)))).job.job_id;
    } catch (e) {
      problem = {
        message: isStoreError(e) ? e.message : "Something went wrong opening this job.",
        notConnected: isStoreError(e) && e.details?.["reason"] === "workedge_not_connected",
      };
    }
  }
  if (target) redirect(`/j/${target}`);
  return (
    <main className="wrap">
      <h1>RhoeFlow Pro</h1>
      <div className="issue error" role="alert">
        {problem?.notConnected ? (
          rc.ctx.role === "admin" ? (
            <>
              <a href="/settings/connectors">Connect WorkEdge</a>
              {". "}
            </>
          ) : (
            "Ask your RhoeFlow admin to connect WorkEdge under Settings, Connectors. "
          )
        ) : null}
        {problem?.message}
      </div>
      <p className="muted">
        You can also <a href="/">start the load calc in RhoeFlow</a> and link it to WorkEdge later.
      </p>
    </main>
  );
}
