import { SettingsNav } from "../../../components/settings-nav";
import { requirePageContext } from "../../../lib/session";
import { AccountSettings } from "./account-settings";

export const dynamic = "force-dynamic";

/** Account settings (ADR-039 decision 6): name, members and roles, invites, the WorkEdge connection. */
export default async function AccountPage() {
  await requirePageContext("/settings/account");
  return (
    <main className="wrap">
      <SettingsNav active="account" />
      <h1>Account</h1>
      <AccountSettings />
    </main>
  );
}
