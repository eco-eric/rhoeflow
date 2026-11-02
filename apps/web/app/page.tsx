import Link from "next/link";
import { redirect } from "next/navigation";
import { ASSESSMENT_SCHEMA_VERSION } from "@rhoeflow/schema";
import { ENGINE_NAME, ENGINE_VERSION } from "@rhoeflow/calc";
import type { ProjectSearchPage, ProjectShow } from "@rhoeflow/jobstore";
import { isStoreError, jobAddress, listJobs, type JobPage } from "@rhoeflow/store";
import { requirePageContext } from "../lib/session";
import { projectIdFrom, searchWorkEdgeJobs, workEdgeConnected } from "../lib/jobstore";
import { NewLoadCalc } from "./new-load-calc";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * Home: the signed-in account's load calcs (ADR-040). A load calc starts in RhoeFlow from a customer
 * name and an address, and the account's own jobs are listed here. WorkEdge is optional: when it is
 * connected, the account's WorkEdge jobs are searched by name, active or archived (ADR-041), never
 * listed, because an account can have thousands. Opening one finds or makes its RhoeFlow job
 * (/p/<project id>). A WorkEdge link can be pasted.
 */

const SHOWS: { value: ProjectShow; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "Both" },
];
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

  const q = (one(sp["q"]) ?? "").trim().slice(0, 100);
  const showRaw = one(sp["show"]);
  const show: ProjectShow = showRaw === "archived" || showRaw === "all" ? showRaw : "active";
  const cursor = one(sp["after"]);
  let connected = true;
  let found: ProjectSearchPage | null = null;
  let weError: string | null = null;
  try {
    connected = await workEdgeConnected(rc);
    if (connected && q) found = await searchWorkEdgeJobs(rc, q, show, cursor);
  } catch (e) {
    weError = isStoreError(e) ? e.message : "WorkEdge could not be reached just now.";
  }
  const searchHref = (after: string | null) => `/?${new URLSearchParams({ q, show, ...(after ? { after } : {}) }).toString()}#workedge`;

  return (
    <main className="wrap">
      <h1>Load calcs</h1>
      <NewLoadCalc startOpen={mine.items.length === 0 && !before} />

      <section className="panel">
        <h2>Your load calcs</h2>
        {mine.items.length === 0 ? (
          <p className="muted">{before ? "No older load calcs." : "None yet. The first one you start shows up here."}</p>
        ) : (
          <>
            {mine.items.map((j) => {
              const addr = jobAddress(j);
              return (
                <Link key={j.job_id} href={`/j/${j.job_id}`} className="task" style={{ textDecoration: "none" }}>
                  <span className="title">
                    <strong>{j.name}</strong>
                    {addr && addr !== j.name ? <small>{addr}</small> : null}
                    {j.workedge_project_id ? <span className="pill">Linked to WorkEdge</span> : null}
                  </span>
                  <span aria-hidden="true">›</span>
                </Link>
              );
            })}
            {before || mine.next_before ? (
              <nav className="pager" aria-label="More load calcs">
                {before ? <Link href="/">Newest</Link> : null}
                {mine.next_before ? <Link href={`/?before=${encodeURIComponent(mine.next_before)}`}>Older load calcs</Link> : null}
              </nav>
            ) : null}
          </>
        )}
      </section>

      <section className="panel" id="workedge">
        <h2>Start from a WorkEdge job</h2>
        {!connected ? (
          <p className="muted">
            {isAdmin ? (
              <>
                Optional. <Link href="/settings/connectors">Connect WorkEdge</Link> to find your WorkEdge jobs here and send photos, the PDF and notes back to them.
              </>
            ) : (
              <>Optional. Your RhoeFlow admin can connect WorkEdge under Settings, Connectors.</>
            )}
          </p>
        ) : (
          <>
            <form method="get" action="/#workedge" className="stack" role="search">
              <label className="field">
                Find a WorkEdge job
                <input type="search" name="q" defaultValue={q} placeholder="Customer or job name" enterKeyHint="search" autoComplete="off" maxLength={100} />
              </label>
              <fieldset className="segmented">
                <legend className="sr-only">Which jobs</legend>
                {SHOWS.map((o) => (
                  <label key={o.value}>
                    <input type="radio" name="show" value={o.value} defaultChecked={show === o.value} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </fieldset>
              <button type="submit" className="primary">
                Search
              </button>
            </form>

            {weError ? (
              <div className="issue error" role="alert">
                Couldn&apos;t search WorkEdge: {weError}
              </div>
            ) : found ? (
              <div className="results" aria-live="polite">
                {found.show_applied ? null : (
                  <p className="fine">WorkEdge doesn&apos;t say yet which jobs are archived, so these include both.</p>
                )}
                {found.items.length === 0 ? (
                  <p className="muted">
                    No {show === "all" || !found.show_applied ? "" : `${show} `}WorkEdge jobs match &ldquo;{q}&rdquo;.
                    {show === "active" && found.show_applied ? " Try Archived or Both." : ""}
                  </p>
                ) : (
                  found.items.map((j) => (
                    <Link key={j.id} href={`/p/${encodeURIComponent(j.id)}`} className="task" style={{ textDecoration: "none" }}>
                      <span className="title">
                        <strong>{j.name || "Untitled job"}</strong>
                        {j.status ? <small>{j.status[0]!.toUpperCase() + j.status.slice(1)}</small> : null}
                      </span>
                      <span aria-hidden="true">›</span>
                    </Link>
                  ))
                )}
                {found.complete ? null : <p className="fine">This looked through your newest 2,000 WorkEdge jobs. Add a word to narrow it if the job isn&apos;t here.</p>}
                {cursor || found.next_cursor ? (
                  <nav className="pager" aria-label="More results">
                    {cursor ? <Link href={searchHref(null)}>First results</Link> : null}
                    {found.next_cursor ? <Link href={searchHref(found.next_cursor)}>More results</Link> : null}
                  </nav>
                ) : null}
              </div>
            ) : null}

            <form method="get" action="/" className="stack" style={{ marginTop: 16 }}>
              <label className="field">
                Or paste a WorkEdge job link
                <input name="open" inputMode="url" enterKeyHint="go" defaultValue={openRaw ?? ""} placeholder="The job's WorkEdge link or project id" autoComplete="off" />
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
          </>
        )}
      </section>

      <p className="source">
        Manual J / S / D block load, equipment selection and duct design. Internal tool; independent software, not ACCA-approved. Schema {ASSESSMENT_SCHEMA_VERSION} · {ENGINE_NAME} {ENGINE_VERSION}
      </p>
    </main>
  );
}
