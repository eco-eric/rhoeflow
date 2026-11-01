import { SettingsNav } from "../../../components/settings-nav";
import { publicAuthConfig } from "../../../lib/auth-config";
import { requirePageContext } from "../../../lib/session";
import { ProfileSettings } from "./profile-settings";

export const dynamic = "force-dynamic";

/** Your profile (ADR-039 decision 5): name, phone, email, password, which account, sign out. */
export default async function ProfilePage() {
  const rc = await requirePageContext("/settings/profile");
  return (
    <main className="wrap">
      <SettingsNav active="profile" />
      <h1>Your profile</h1>
      <ProfileSettings config={publicAuthConfig()} email={rc.email} />
    </main>
  );
}
