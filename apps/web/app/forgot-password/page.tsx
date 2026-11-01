import { AuthShell } from "../../components/auth-shell";
import { publicAuthConfig } from "../../lib/auth-config";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

/** Ask Supabase Auth to email a password reset link (ADR-039). */
export default function ForgotPasswordPage() {
  const config = publicAuthConfig();
  return (
    <AuthShell title="Reset your password">
      {config ? <ForgotPasswordForm config={config} /> : <div className="issue error">Password reset is not set up on this server yet.</div>}
    </AuthShell>
  );
}
