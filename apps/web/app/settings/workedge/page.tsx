import { SettingsNav } from "../../../components/settings-nav";
import { requirePageContext } from "../../../lib/session";
import { ConnectWorkEdge } from "./connect-workedge";

export const dynamic = "force-dynamic";

/**
 * Connect WorkEdge (ADR-038): each account connects its own WorkEdge with its own key. Only the
 * account's admins can paste, replace or remove it (ADR-039); members see whether it is connected.
 */
export default async function ConnectWorkEdgePage() {
  await requirePageContext("/settings/workedge");
  return (
    <main className="wrap">
      <SettingsNav active="workedge" />
      <h1>Connect WorkEdge</h1>
      <p className="muted">RhoeFlow reads this account&apos;s jobs, addresses, photos and equipment from WorkEdge with this account&apos;s own key. Other accounts never see it.</p>
      <ConnectWorkEdge />
    </main>
  );
}
