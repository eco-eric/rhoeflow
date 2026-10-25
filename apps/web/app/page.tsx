import Link from "next/link";
import { ASSESSMENT_SCHEMA_VERSION } from "@rhoeflow/schema";
import { ENGINE_NAME, ENGINE_VERSION } from "@rhoeflow/calc";
import { FIXTURE_JOBS } from "@rhoeflow/jobstore";
import { devMemoryEnabled } from "../lib/dev";

export const dynamic = "force-dynamic";

/**
 * Landing page. A tech arrives from WorkEdge through a project deep link (/p/<project id>,
 * standard §3 entry A), not here. In development it lists the fixture jobs so the field app
 * can be tried before WorkEdge sign-in exists.
 */
export default function Home() {
  const dev = devMemoryEnabled();
  return (
    <main className="wrap" style={{ paddingTop: 48 }}>
      <p className="muted" style={{ letterSpacing: 2, fontSize: 12, textTransform: "uppercase" }}>TruFicient Energy Solutions</p>
      <h1 style={{ fontSize: 36 }}>RhoeFlow Pro</h1>
      <p>Manual J / S / D block load, equipment selection and duct design. Internal tool; independent software, not ACCA-approved.</p>
      <p className="muted">Open a job from WorkEdge with its Assessment action.</p>
      {dev ? (
        <section className="panel">
          <h2>Development: fixture jobs</h2>
          <p className="muted">In-memory store, no sign-in. Not real properties; nothing is kept after a restart.</p>
          {FIXTURE_JOBS.map((j) => (
            <p key={j.project.id}>
              <Link href={`/p/${j.project.id}`}>{j.project.name}</Link>
            </p>
          ))}
        </section>
      ) : null}
      <p className="source">
        Schema {ASSESSMENT_SCHEMA_VERSION} · {ENGINE_NAME} {ENGINE_VERSION}
      </p>
    </main>
  );
}
