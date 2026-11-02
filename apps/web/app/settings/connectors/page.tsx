import type { ReactNode } from "react";
import { SettingsNav } from "../../../components/settings-nav";
import { requirePageContext } from "../../../lib/session";
import { ConnectWorkEdge } from "./connect-workedge";

export const dynamic = "force-dynamic";

/**
 * The apps this account connects to RhoeFlow (ADR-040). Every connector is optional: load calcs
 * work without any. Each account connects its own with its own key (ADR-038); only the account's
 * admins can connect, replace or remove one (ADR-039). WorkEdge is the first; more are added as
 * entries in CONNECTORS.
 */
interface Connector {
  key: string;
  name: string;
  does: string;
  panel: ReactNode;
}

const CONNECTORS: Connector[] = [
  {
    key: "workedge",
    name: "WorkEdge",
    does: "Pick load calcs from your WorkEdge jobs and read their addresses, photos and equipment. Once WorkEdge accepts them, photos, the PDF report and notes go back to the linked WorkEdge job.",
    panel: <ConnectWorkEdge />,
  },
];

export default async function ConnectorsPage() {
  await requirePageContext("/settings/connectors");
  return (
    <main className="wrap">
      <SettingsNav active="connectors" />
      <h1>Connectors</h1>
      <p className="muted">Connect the apps your account already uses. Every connector is optional, and each account&apos;s keys stay with that account.</p>
      {CONNECTORS.map((c) => (
        <section key={c.key} id={c.key} className="panel">
          <h2>{c.name}</h2>
          <p className="muted">{c.does}</p>
          {c.panel}
        </section>
      ))}
    </main>
  );
}
