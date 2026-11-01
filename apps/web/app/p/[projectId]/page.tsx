import { isStoreError } from "@rhoeflow/store";
import { requirePageContext } from "../../../lib/session";
import { readJob } from "../../../lib/jobstore";
import { FieldApp } from "./field-app";

export const dynamic = "force-dynamic";

/**
 * Deep-link entry from a WorkEdge project (D1; integration standard §3 entry A): /p/<workedge
 * project id>. The server reads the project and property through the JobStore (ADR-031) for the
 * persistent bar; nothing about them is stored (ADR-028). The client creates or resumes the one
 * open assessment for the project.
 */
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  // Signed out, an expired session or no account redirect before anything renders (ADR-039).
  const rc = await requirePageContext(`/p/${encodeURIComponent(projectId)}`);
  try {
    const job = await readJob(rc, projectId);
    return <FieldApp project={job.project} property={job.property} />;
  } catch (e) {
    const message = isStoreError(e) ? e.message : "Something went wrong opening this job.";
    return (
      <main className="wrap">
        <h1>RhoeFlow Pro</h1>
        <div className="issue error" role="alert">
          {isStoreError(e) && e.details?.["reason"] === "workedge_not_connected" ? <><a href="/settings/workedge">Connect WorkEdge</a>{". "}</> : null}
          {message}
        </div>
        <p className="muted">WorkEdge project {projectId}</p>
      </main>
    );
  }
}
