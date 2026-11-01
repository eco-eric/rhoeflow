"use client";
import { useState } from "react";
import type { PublicAuthConfig } from "../../lib/auth-config";
import { afterSignIn, authMessage, browserSupabase } from "../../lib/supabase-browser";

export function SignInForm({ config, next }: { config: PublicAuthConfig; next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await browserSupabase(config).auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setError(authMessage(err));
      setBusy(false);
      return;
    }
    await afterSignIn(next);
  };

  return (
    <form className="panel stack" onSubmit={submit}>
      <label className="field">
        Email
        <input className="full" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        Password
        <input className="full" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error ? <div className="issue error" role="alert">{error}</div> : null}
      <button className="primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      <p className="muted">
        <a href="/forgot-password">Forgot your password?</a>
        {" · "}
        <a href={`/sign-up${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}>Make a login</a> (if your company invited you)
      </p>
    </form>
  );
}
