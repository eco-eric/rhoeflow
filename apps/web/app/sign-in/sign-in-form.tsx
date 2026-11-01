"use client";
import { useState } from "react";
import type { PublicAuthConfig } from "../../lib/auth-config";
import { afterSignIn, authMessage, browserSupabase } from "../../lib/supabase-browser";
import { normalizeCode } from "../../lib/sign-in-code";

type Mode = "password" | "code";

/**
 * Two ways in (ADR-039 decision 2): email and password, or a one-time code Supabase emails. Both go
 * from the browser straight to Supabase Auth. The code email also carries a link to /auth/callback
 * for anyone who taps it instead of typing the code.
 */
export function SignInForm({ config, next }: { config: PublicAuthConfig; next: string }) {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  const withPassword = async (e: React.FormEvent) => {
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

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const address = email.trim();
    const { error: err } = await browserSupabase(config).auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (err) return setError(authMessage(err));
    setCodeSentTo(address);
    setCode("");
    setNotice(`We emailed a sign-in code to ${address}.`);
  };

  const withCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = normalizeCode(code);
    if (!token || !codeSentTo) return setError("Type the code from the email: just the digits.");
    setBusy(true);
    setError(null);
    const { error: err } = await browserSupabase(config).auth.verifyOtp({ email: codeSentTo, token, type: "email" });
    if (err) {
      setError(/expired|invalid/i.test(err.message) ? "That code is wrong or has expired. Check the newest email, or send a new code." : authMessage(err));
      setBusy(false);
      return;
    }
    await afterSignIn(next);
  };

  const emailField = (
    <label className="field">
      Email
      <input className="full" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
    </label>
  );

  return (
    <div className="panel stack">
      <div className="tabs" role="tablist" aria-label="How to sign in">
        <button type="button" role="tab" aria-selected={mode === "password"} className={`tab${mode === "password" ? " on" : ""}`} onClick={() => pick("password")}>Password</button>
        <button type="button" role="tab" aria-selected={mode === "code"} className={`tab${mode === "code" ? " on" : ""}`} onClick={() => pick("code")}>Email me a code</button>
      </div>

      {mode === "password" ? (
        <form className="stack" onSubmit={withPassword}>
          {emailField}
          <label className="field">
            Password
            <input className="full" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error ? <div className="issue error" role="alert">{error}</div> : null}
          <button className="primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <p className="muted"><a href="/forgot-password">Forgot your password?</a></p>
        </form>
      ) : codeSentTo === null ? (
        <form className="stack" onSubmit={sendCode}>
          <p className="muted">No password needed. We&apos;ll email you a code to type in here.</p>
          {emailField}
          {error ? <div className="issue error" role="alert">{error}</div> : null}
          <button className="primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button>
        </form>
      ) : (
        <form className="stack" onSubmit={withCode}>
          {notice ? <p role="status">{notice} It can take a minute; check spam too.</p> : null}
          <label className="field">
            Code
            <input className="full code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          {error ? <div className="issue error" role="alert">{error}</div> : null}
          <button className="primary" type="submit" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
          <p className="muted">
            <button className="linkish" type="button" disabled={busy} onClick={() => void sendCode()}>Send a new code</button>
            {" · "}
            <button className="linkish" type="button" disabled={busy} onClick={() => { setCodeSentTo(null); setError(null); setNotice(null); }}>Use a different email</button>
          </p>
        </form>
      )}

      <p className="muted">
        New here? <a href={`/sign-up${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}>Make a login</a> with the email your company&apos;s RhoeFlow admin invited, or just use &quot;Email me a code&quot;.
      </p>
    </div>
  );
}
