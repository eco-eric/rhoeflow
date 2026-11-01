import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AuthShell } from "../../components/auth-shell";
import { publicAuthConfig } from "../../lib/auth-config";
import { sessionState } from "../../lib/session";
import { NewPasswordForm } from "../../components/new-password-form";

export const dynamic = "force-dynamic";

/** Where a reset link lands (through /auth/callback, which signs the person in): pick a new password. */
export default async function ResetPasswordPage() {
  const config = publicAuthConfig();
  if (!config) return <AuthShell title="Pick a new password"><div className="issue error">Password reset is not set up on this server yet.</div></AuthShell>;
  const jar = await cookies();
  const state = await sessionState((n) => jar.get(n)?.value, config.url);
  if (state === "none") redirect("/forgot-password");
  if (state === "stale") redirect("/auth/refresh?next=%2Freset-password");
  return (
    <AuthShell title="Pick a new password">
      <NewPasswordForm config={config} done="/" />
    </AuthShell>
  );
}
