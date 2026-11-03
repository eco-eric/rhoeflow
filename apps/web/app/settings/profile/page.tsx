import { SettingsNav } from "../../../components/settings-nav";
import { ThemePicker } from "../../../components/theme";
import { publicAuthConfig } from "../../../lib/auth-config";
import { requirePageContext } from "../../../lib/session";
import { ProfileSettings } from "./profile-settings";

export const dynamic = "force-dynamic";

/** Your profile (ADR-039 decision 5): name, phone, email, password, which account, sign out; and the theme (ADR-042). */
export default async function ProfilePage() {
  const rc = await requirePageContext("/settings/profile");
  return (
    <main className="wrap">
      <SettingsNav active="profile" />
      <h1>Your profile</h1>
      <section className="panel" aria-labelledby="appearance">
        <h2 id="appearance">Appearance</h2>
        <p className="fine" style={{ marginBottom: 12 }}>
          System follows your phone or computer. Kept on this device.
        </p>
        <ThemePicker />
      </section>
      <ProfileSettings config={publicAuthConfig()} email={rc.email} />
    </main>
  );
}
