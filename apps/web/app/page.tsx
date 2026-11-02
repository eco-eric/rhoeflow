import Link from "next/link";
import { redirect } from "next/navigation";
import { ASSESSMENT_SCHEMA_VERSION } from "@rhoeflow/schema";
import { ENGINE_NAME, ENGINE_VERSION } from "@rhoeflow/calc";
import type { Page, ProjectSummary } from "@rhoeflow/jobstore";
import { isStoreError } from "@rhoeflow/store";
import { requirePageContext } from "../lib/session";
import { listJobs, projectIdFrom } from "../lib/jobstore";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * Home: the signed-in account's load calcs. A load calc lives on a WorkEdge job (standard §3; no
 * assessment without a WorkEdge job), so this lists the account's WorkEdge jobs, read with the
 * account's own key (ADR-038), and opening one goes to /p/<project id>, which creates or resumes the
 * job's assessment on a task overview (ADR-027). WorkEdge's own Assessment button (entry A) leads to
 * the same place once WorkEdge has it. A WorkEdge link or project id can also be pasted.
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
    openError = "That isn't a WorkEdge project link or id. Copy the address of the job's page in WorkEdge and paste it here.";
  }

  const cursor = one(sp["after"]);
  let jobs: Page<ProjectSummary> | null = null;
  let jobsError: { message: string; notConnected: boolean } | null = null;
  try {
    jobs = await listJobs(rc, cursor);
  } catch (e) {
    const notConnected = isStoreError(e) && e.details?.["reason"] === "workedge_not_connected";
    jobsError = { message: isStoreError(e) ? e.message : "WorkEdge could not be reached just now.", notConnected };
  }

  return (
    <main className="wrap">
      <h1>Load calcs</h1>
      <p className="muted">Each load calc belongs to a WorkEdge job. Pick the job to start its load calc, or to pick up where you left off.</p>

      <section className="panel">
        <h2>Your WorkEdge jobs</h2>
        {jobsError ? (
          <div className="issue error" role="alert">
            {jobsError.notConnected ? (
              isAdmin ? (
                <>
                  WorkEdge isn&apos;t connected for {rc.account_name} yet. <Link href="/settings/workedge">Connect WorkEdge</Link> to see your jobs here.
                </>
              ) : (
                <>WorkEdge isn&apos;t connected for {rc.account_name} yet. Ask your RhoeFlow admin to connect it under Settings, WorkEdge.</>
              )
            ) : (
              <>Couldn&apos;t load your jobs: {jobsError.message}</>
            )}
          </div>
        ) : jobs && jobs.items.length === 0 ? (
          <p className="muted">{cursor ? "No more jobs." : "WorkEdge has no jobs for this account yet. Make the job in WorkEdge first, then it shows up here."}</p>
        ) : jobs ? (
          <>
            {jobs.items.map((j) => (
              <Link key={j.id} href={`/p/${encodeURIComponent(j.id)}`} className="task" style={{ textDecoration: "none" }}>
                <span>{j.name || "Untitled job"}</span>
                <span aria-hidden="true">›</span>
              </Link>
            ))}
            <div className="row" style={{ marginTop: 8 }}>
              {cursor ? <Link href="/">First page</Link> : null}
              {jobs.next_cursor ? <Link href={`/?after=${encodeURIComponent(jobs.next_cursor)}`}>More jobs</Link> : null}
            </div>
          </>
        ) : null}
      </section>

      <section className="panel">
        <h2>Open a job by link</h2>
        <form method="get" action="/" className="stack">
          <label className="field">
            WorkEdge job link or project id
            <input name="open" className="full" defaultValue={openRaw ?? ""} placeholder="Paste the job's WorkEdge link" autoComplete="off" />
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
      </section>

      <p>
        <Link href="/templates">Era templates</Link>
        {" · "}
        <Link href="/settings/account">Settings</Link>
      </p>
      <p className="source">
        Manual J / S / D block load, equipment selection and duct design. Internal tool; independent software, not ACCA-approved. Schema {ASSESSMENT_SCHEMA_VERSION} · {ENGINE_NAME} {ENGINE_VERSION}
      </p>
    </main>
  );
}
