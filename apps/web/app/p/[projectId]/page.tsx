import { isStoreError } from "@rhoeflow/store";
import { requireContext } from "../../../lib/context";
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
  try {
    const { ctx } = await requireContext();
    const job = await readJob(ctx, projectId);
    return <FieldApp project={job.project} property={job.property} />;
  } catch (e) {
    const code = isStoreError(e) ? e.code : "internal";
    const message = isStoreError(e) ? e.message : "Something went wrong opening this job.";
    return (
      <main className="wrap">
        <h1>RhoeFlow Pro</h1>
        <div className="issue error" role="alert">
          {code === "forbidden" ? "Sign in through WorkEdge to open this job. " : null}
          {message}
        </div>
        <p className="muted">WorkEdge project {projectId}</p>
      </main>
    );
  }
}
