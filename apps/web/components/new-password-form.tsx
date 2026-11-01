"use client";
import { useState } from "react";
import type { PublicAuthConfig } from "../lib/auth-config";
import { authMessage, browserSupabase } from "../lib/supabase-browser";

const MIN_PASSWORD = 8;

/**
 * Sets a new password for the signed-in login, straight between the browser and Supabase Auth.
 * With `currentEmail`, the current password is checked first (profile page); a reset link already
 * proved the person, so the reset page leaves it out.
 */
export function NewPasswordForm({ config, done, currentEmail }: { config: PublicAuthConfig; done: string | (() => void); currentEmail?: string }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) return setError(`Pick a longer password: at least ${MIN_PASSWORD} characters.`);
    if (password !== again) return setError("The two new passwords don't match.");
    setBusy(true);
    const sb = browserSupabase(config);
    if (currentEmail) {
      const { error: wrong } = await sb.auth.signInWithPassword({ email: currentEmail, password: current });
      if (wrong) {
        setBusy(false);
        return setError("Your current password isn't right.");
      }
    }
    const { error: err } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(authMessage(err));
    setCurrent("");
    setPassword("");
    setAgain("");
    if (typeof done === "string") window.location.assign(done);
    else done();
  };

  return (
    <form className="stack" onSubmit={submit}>
      {currentEmail ? (
        <label className="field">
          Current password
          <input className="full" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
      ) : null}
      <label className="field">
        New password
        <input className="full" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="field">
        New password again
        <input className="full" type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
      </label>
      {error ? <div className="issue error" role="alert">{error}</div> : null}
      <button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
    </form>
  );
}
