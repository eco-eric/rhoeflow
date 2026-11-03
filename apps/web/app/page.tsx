import Link from "next/link";
import { redirect } from "next/navigation";
import { ASSESSMENT_SCHEMA_VERSION } from "@rhoeflow/schema";
import { ENGINE_NAME, ENGINE_VERSION } from "@rhoeflow/calc";
import type { ProjectSearchPage, ProjectShow } from "@rhoeflow/jobstore";
import { isStoreError, jobAddress, listJobs, type JobPage, type JobShow } from "@rhoeflow/store";
import { requirePageContext } from "../lib/session";
import { projectIdFrom, searchWorkEdgeJobs, workEdgeConnected } from "../lib/jobstore";
import { ArchiveJobButton } from "../components/archive-job-button";
import { HouseIcon, LinkIcon, PlusIcon } from "../components/icons";
import { NewLoadCalc } from "./new-load-calc";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * Home: the signed-in account's load calcs (ADR-040), in three sections that look different on
 * purpose (ADR-042): start a new one (gold), your saved ones (sage) and WorkEdge (blue). Saved load
 * calcs are searched by name, customer or address and shown Active, Archived or All; archiving only
 * hides one from the active list. A load calc starts in RhoeFlow from a customer
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
const VIEWS: { value: JobShow; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
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
  const find = (one(sp["find"]) ?? "").trim().slice(0, 100);
  const viewRaw = one(sp["view"]);
  const view: JobShow = viewRaw === "archived" || viewRaw === "all" ? viewRaw : "active";
  const mine: JobPage = await listJobs(rc.deps, rc.ctx, { before, show: view, q: find });
  const savedHref = (o: { view?: JobShow; find?: string; before?: string | null }) => {
    const p = new URLSearchParams();
    const v = o.view ?? view;
    const f = o.find ?? find;
    if (v !== "active") p.set("view", v);
    if (f) p.set("find", f);
    if (o.before) p.set("before", o.before);
    const qs = p.toString();
    return `/${qs ? `?${qs}` : ""}#saved`;
  };
  // The form opens by itself only for an account with no load calcs at all.
  const firstTime = mine.items.length === 0 && !before && !find && view === "active";

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
      <div className="home-title">
        <h1>Load calcs</h1>
      </div>

      <section className="panel tone-gold" aria-labelledby="new-h">
        <div className="sec-head">
          <span className="icon-tile">
            <PlusIcon />
          </span>
          <div className="grow">
            <p className="eyebrow">Start</p>
            <h2 id="new-h">New load calc</h2>
          </div>
        </div>
        <p className="lede" style={{ marginBottom: 12 }}>
          From the customer&apos;s name and address. Link it to a WorkEdge job later if you need to.
        </p>
        <NewLoadCalc startOpen={firstTime} />
      </section>

      <section className="panel tone-sage" id="saved" aria-labelledby="saved-h">
        <div className="sec-head">
          <span className="icon-tile">
            <HouseIcon />
          </span>
          <div className="grow">
            <p className="eyebrow">Saved</p>
            <h2 id="saved-h">Your load calcs</h2>
          </div>
        </div>
        {firstTime ? null : (
          <>
            <form method="get" action="/#saved" role="search" aria-label="Your load calcs">
              <label className="sr-only" htmlFor="find">
                Search your load calcs
              </label>
              <div className="search-row">
                <input id="find" type="search" name="find" defaultValue={find} placeholder="Name or address" enterKeyHint="search" autoComplete="off" maxLength={100} />
                {view !== "active" ? <input type="hidden" name="view" value={view} /> : null}
                <button type="submit" className="secondary">
                  Search
                </button>
              </div>
            </form>
            <nav className="views" aria-label="Which load calcs">
              {VIEWS.map((v) => (
                <Link key={v.value} href={savedHref({ view: v.value, before: null })} aria-current={view === v.value ? "page" : undefined}>
                  {v.label}
                </Link>
              ))}
            </nav>
          </>
        )}
        {mine.items.length === 0 ? (
          <div className="empty">
            {firstTime ? (
              <p>None yet. The first one you start shows up here.</p>
            ) : find ? (
              <p>
                No {view === "all" ? "" : `${view} `}load calcs match &ldquo;{find}&rdquo;.{" "}
                {view === "active" ? <Link href={savedHref({ view: "all" })}>Look in all of them</Link> : null}
              </p>
            ) : before ? (
              <p>No older load calcs.</p>
            ) : view === "archived" ? (
              <p>Nothing archived. Archiving a load calc moves it here, out of your list. It can still be opened or restored.</p>
            ) : (
              <p>No active load calcs. Archived ones are under Archived.</p>
            )}
          </div>
        ) : (
          <>
            {mine.items.map((j) => {
              const addr = jobAddress(j);
              const archived = j.archived_at !== null;
              return (
                <div key={j.job_id} className={`job-row${archived ? " archived" : ""}`}>
                  <Link href={`/j/${j.job_id}`} className="task">
                    <span className="title">
                      <strong>{j.name}</strong>
                      {addr && addr !== j.name ? <small>{addr}</small> : null}
                      {j.workedge_project_id || (archived && view !== "archived") ? (
                        <span className="meta">
                          {j.workedge_project_id ? <span className="pill blue">WorkEdge</span> : null}
                          {archived && view !== "archived" ? <span className="pill muted-pill">Archived</span> : null}
                        </span>
                      ) : null}
                    </span>
                    <span className="chev" aria-hidden="true">
                      ›
                    </span>
                  </Link>
                  <ArchiveJobButton jobId={j.job_id} jobName={j.name} archived={archived} />
                </div>
              );
            })}
            {before || mine.next_before ? (
              <nav className="pager" aria-label="More load calcs">
                {before ? <Link href={savedHref({ before: null })}>Newest</Link> : null}
                {mine.next_before ? <Link href={savedHref({ before: mine.next_before })}>Older load calcs</Link> : null}
              </nav>
            ) : null}
          </>
        )}
      </section>

      <section className="panel tone-blue" id="workedge" aria-labelledby="workedge-h">
        <div className="sec-head">
          <span className="icon-tile">
            <LinkIcon />
          </span>
          <div className="grow">
            <p className="eyebrow">Connector</p>
            <h2 id="workedge-h">Start from a WorkEdge job</h2>
          </div>
        </div>
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
              <button type="submit" className="secondary">
                Search WorkEdge
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
                      <span className="chev" aria-hidden="true">
                        ›
                      </span>
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
