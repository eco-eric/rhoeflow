import { SettingsNav } from "../../../components/settings-nav";
import { requirePageContext } from "../../../lib/session";
import { DesignSettings } from "./design-settings";

export const dynamic = "force-dynamic";

/** Design conditions (ADR-047): the account's set points and outdoor design temperatures. */
export default async function DesignPage() {
  await requirePageContext("/settings/design");
  return (
    <main className="wrap">
      <SettingsNav active="design" />
      <h1>Design conditions</h1>
      <DesignSettings />
    </main>
  );
}
