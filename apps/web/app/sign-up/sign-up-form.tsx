"use client";
import { useState } from "react";
import type { PublicAuthConfig } from "../../lib/auth-config";
import { afterSignIn, authMessage, browserSupabase } from "../../lib/supabase-browser";

export const MIN_PASSWORD = 8;

export function SignUpForm({ config, next }: { config: PublicAuthConfig; next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) return setError(`Pick a longer password: at least ${MIN_PASSWORD} characters.`);
    if (password !== again) return setError("The two passwords don't match.");
    setBusy(true);
    const address = email.trim();
    const { data, error: err } = await browserSupabase(config).auth.signUp({
      email: address,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (err) {
      setError(authMessage(err));
      setBusy(false);
      return;
    }
    // Email confirmation off: signed in already. On (the default): confirm from the email first.
    if (data.session) return afterSignIn(next);
    setSentTo(address);
    setBusy(false);
  };

  if (sentTo)
    return (
      <div className="panel">
        <p>Check {sentTo} for a confirmation email from RhoeFlow and open its link. You&apos;ll be signed in and added to the account that invited you.</p>
        <p className="muted">No email after a few minutes? Check spam, or <a href="/sign-in">sign in</a> if you already confirmed.</p>
      </div>
    );

  return (
    <form className="panel stack" onSubmit={submit}>
      <label className="field">
        Email
        <input className="full" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        Password
        <input className="full" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="field">
        Password again
        <input className="full" type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
      </label>
      {error ? <div className="issue error" role="alert">{error}</div> : null}
      <button className="primary" type="submit" disabled={busy}>{busy ? "Making your login…" : "Make login"}</button>
      <p className="muted">
        Already have one? <a href="/sign-in">Sign in</a>
      </p>
    </form>
  );
}
