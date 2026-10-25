import { ASSESSMENT_SCHEMA_VERSION } from "@rhoeflow/schema";
import { ENGINE_NAME, ENGINE_VERSION } from "@rhoeflow/calc";

/**
 * WO-01 placeholder (the only UI the work order allows). It proves the Next.js app builds
 * and can import the workspace packages; it performs no calculation and shows no number
 * that could be mistaken for a load.
 */
export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "64px 24px" }}>
      <p style={{ letterSpacing: 2, fontSize: 12, textTransform: "uppercase", opacity: 0.7 }}>TruFicient Energy Solutions</p>
      <h1 style={{ fontSize: 40, margin: "8px 0 16px" }}>RhoeFlow Pro</h1>
      <p style={{ fontSize: 18, lineHeight: 1.5 }}>
        Manual J / S / D block load, equipment selection and duct design. Internal tool; independent software, not ACCA-approved.
      </p>
      <dl style={{ marginTop: 40, display: "grid", gridTemplateColumns: "max-content 1fr", gap: "8px 24px", fontSize: 14 }}>
        <dt style={{ opacity: 0.7 }}>Status</dt>
        <dd style={{ margin: 0 }}>WO-01 scaffold. No calculations are available yet.</dd>
        <dt style={{ opacity: 0.7 }}>Schema</dt>
        <dd style={{ margin: 0 }}>Assessment {ASSESSMENT_SCHEMA_VERSION}</dd>
        <dt style={{ opacity: 0.7 }}>Engine</dt>
        <dd style={{ margin: 0 }}>
          {ENGINE_NAME} {ENGINE_VERSION} (contracts only)
        </dd>
      </dl>
    </main>
  );
}
