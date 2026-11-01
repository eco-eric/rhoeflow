"use client";
import { useState } from "react";
import type { PublicAuthConfig } from "../../lib/auth-config";
import { authMessage, browserSupabase } from "../../lib/supabase-browser";

export function ForgotPasswordForm({ config }: { config: PublicAuthConfig }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await browserSupabase(config).auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
    });
    setBusy(false);
    // Say the same thing whether or not the email has a login, so the page can't be used to check addresses.
    if (err && !/not found|no user/i.test(err.message)) return setError(authMessage(err));
    setSent(true);
  };

  if (sent) return <div className="panel"><p>If {email.trim()} has a RhoeFlow login, a reset link is on its way. Open it on this device to pick a new password.</p></div>;
  return (
    <form className="panel stack" onSubmit={submit}>
      <label className="field">
        Email
        <input className="full" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {error ? <div className="issue error" role="alert">{error}</div> : null}
      <button className="primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Email me a reset link"}</button>
      <p className="muted"><a href="/sign-in">Back to sign in</a></p>
    </form>
  );
}
