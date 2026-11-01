import { ConnectWorkEdge } from "./connect-workedge";

export const dynamic = "force-dynamic";

/** Connect WorkEdge (ADR-038): each account connects its own WorkEdge with its own key. */
export default function ConnectWorkEdgePage() {
  return (
    <main className="wrap">
      <h1>Connect WorkEdge</h1>
      <p className="muted">RhoeFlow reads this account&apos;s jobs, addresses, photos and equipment from WorkEdge with this account&apos;s own key. Other accounts never see it.</p>
      <ConnectWorkEdge />
    </main>
  );
}
