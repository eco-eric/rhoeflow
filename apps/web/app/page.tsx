import Link from "next/link";
import { redirect } from "next/navigation";
import { ASSESSMENT_SCHEMA_VERSION } from "@rhoeflow/schema";
import { ENGINE_NAME, ENGINE_VERSION } from "@rhoeflow/calc";
import type { Page, ProjectSummary } from "@rhoeflow/jobstore";
import { isStoreError, jobAddress, listJobs, type JobPage } from "@rhoeflow/store";
import { requirePageContext } from "../lib/session";
import { listWorkEdgeJobs, projectIdFrom } from "../lib/jobstore";
import { NewLoadCalc } from "./new-load-calc";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * Home: the signed-in account's load calcs (ADR-040). A load calc starts in RhoeFlow from a customer
 * name and an address, and the account's own jobs are listed here. WorkEdge is optional: when it is
 * connected, the account's WorkEdge jobs are listed too, read with the account's own key (ADR-038),
 * and opening one finds or makes its RhoeFlow job (/p/<project id>). A WorkEdge link can be pasted.
 */
export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const rc = await requirePageContext("/");
  const isAdmin = rc.ctx.role === "admin";

  const openRaw = one(sp["open"]);
  let openError: string | null = null;
  if (openRaw !== null) {
    const id = projectIdFrom(openRaw);
    if (id) redirect(`/p/${encodeURIComponent(id)}`);
    openError = "That isn't a WorkEdge job link or id. Copy the address of the job's page in WorkEdge and paste it here.";
  }

  const before = one(sp["before"]);
  const mine: JobPage = await listJobs(rc.deps, rc.ctx, { before });

  const cursor = one(sp["after"]);
  let weJobs: Page<ProjectSummary> | null = null;
  let weError: { message: string; notConnected: boolean } | null = null;
  try {
    weJobs = await listWorkEdgeJobs(rc, cursor);
  } catch (e) {
    const notConnected = isStoreError(e) && e.details?.["reason"] === "workedge_not_connected";
    weError = { message: isStoreError(e) ? e.message : "WorkEdge could not be reached just now.", notConnected };
  }

  return (
    <main className="wrap">
      <h1>Load calcs</h1>

      <section className="panel">
        <h2>Start a load calc</h2>
        <NewLoadCalc />
      </section>

      <section className="panel">
        <h2>Your load calcs</h2>
        {mine.items.length === 0 ? (
          <p className="muted">{before ? "No more load calcs." : "No load calcs yet. Start one above."}</p>
        ) : (
          <>
            {mine.items.map((j) => (
              <Link key={j.job_id} href={`/j/${j.job_id}`} className="task" style={{ textDecoration: "none" }}>
                <span>
                  {j.name}
                  {jobAddress(j) && jobAddress(j) !== j.name ? <span className="muted"> · {jobAddress(j)}</span> : null}
                  {j.workedge_project_id ? <span className="pill" style={{ marginLeft: 8 }}>WorkEdge</span> : null}
                </span>
                <span aria-hidden="true">›</span>
              </Link>
            ))}
            <div className="row" style={{ marginTop: 8 }}>
              {before ? <Link href="/">Newest</Link> : null}
              {mine.next_before ? <Link href={`/?before=${encodeURIComponent(mine.next_before)}`}>More load calcs</Link> : null}
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Start from a WorkEdge job</h2>
        {weError ? (
          weError.notConnected ? (
            <p className="muted">
              {isAdmin ? (
                <>
                  Optional. <Link href="/settings/connectors">Connect WorkEdge</Link> to pick from your WorkEdge jobs and send photos, the PDF and notes back to them.
                </>
              ) : (
                <>Optional. Your RhoeFlow admin can connect WorkEdge under Settings, Connectors.</>
              )}
            </p>
          ) : (
            <div className="issue error" role="alert">
              Couldn&apos;t load your WorkEdge jobs: {weError.message}
            </div>
          )
        ) : weJobs && weJobs.items.length === 0 ? (
          <p className="muted">{cursor ? "No more WorkEdge jobs." : "WorkEdge has no jobs for this account yet."}</p>
        ) : weJobs ? (
          <>
            {weJobs.items.map((j) => (
              <Link key={j.id} href={`/p/${encodeURIComponent(j.id)}`} className="task" style={{ textDecoration: "none" }}>
                <span>{j.name || "Untitled job"}</span>
                <span aria-hidden="true">›</span>
              </Link>
            ))}
            <div className="row" style={{ marginTop: 8 }}>
              {cursor ? <Link href="/">First page</Link> : null}
              {weJobs.next_cursor ? <Link href={`/?after=${encodeURIComponent(weJobs.next_cursor)}`}>More WorkEdge jobs</Link> : null}
            </div>
          </>
        ) : null}
        {weError?.notConnected ? null : (
          <form method="get" action="/" className="stack" style={{ marginTop: 12 }}>
            <label className="field">
              Or paste a WorkEdge job link
              <input name="open" className="full" defaultValue={openRaw ?? ""} placeholder="The job's WorkEdge link or project id" autoComplete="off" />
            </label>
            {openError ? (
              <div className="issue error" role="alert">
                {openError}
              </div>
            ) : null}
            <button type="submit" className="secondary">
              Open
            </button>
          </form>
        )}
      </section>

      <p className="source">
        Manual J / S / D block load, equipment selection and duct design. Internal tool; independent software, not ACCA-approved. Schema {ASSESSMENT_SCHEMA_VERSION} · {ENGINE_NAME} {ENGINE_VERSION}
      </p>
    </main>
  );
}
