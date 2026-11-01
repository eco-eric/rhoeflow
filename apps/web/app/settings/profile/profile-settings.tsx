"use client";
import { useEffect, useState } from "react";
import { NewPasswordForm } from "../../../components/new-password-form";
import { api } from "../../../lib/api-client";
import type { PublicAuthConfig } from "../../../lib/auth-config";
import { authMessage, browserSupabase } from "../../../lib/supabase-browser";

interface Me {
  user: { id: string; email: string };
  account: { account_id: string; account_name: string; role: "admin" | "member" } | null;
  accounts: { account_id: string; name: string; role: "admin" | "member" }[];
  profile: { full_name: string | null; phone: string | null } | null;
}

export function ProfileSettings({ config, email }: { config: PublicAuthConfig | null; email: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [msg, setMsg] = useState<{ part: string; text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const m = await api<Me>("/api/me");
    setMe(m);
    setName(m.profile?.full_name ?? "");
    setPhone(m.profile?.phone ?? "");
  };
  useEffect(() => {
    load().catch((e: unknown) => setMsg({ part: "load", text: e instanceof Error ? e.message : String(e), error: true }));
  }, []);

  const run = async (part: string, fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ part, text: await fn() });
    } catch (e) {
      setMsg({ part, text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  };
  const note = (part: string) => (msg && msg.part === part ? <p className={msg.error ? "issue error" : "muted"} role={msg.error ? "alert" : "status"}>{msg.text}</p> : null);

  const saveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    void run("details", async () => {
      await api("/api/me/profile", { method: "PATCH", body: { full_name: name, phone } });
      await load();
      return "Saved.";
    });
  };
  const changeEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    void run("email", async () => {
      const { error } = await browserSupabase(config).auth.updateUser(
        { email: newEmail.trim() },
        { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/settings/profile")}` },
      );
      if (error) throw new Error(authMessage(error));
      setNewEmail("");
      return `Check ${newEmail.trim()} for a confirmation link. Your email changes once you open it; until then, sign in with ${email}.`;
    });
  };
  const switchTo = (account_id: string) =>
    run("account", async () => {
      await api("/api/me/account", { method: "PUT", body: { account_id } });
      window.location.reload();
      return "Switched.";
    });

  if (!me) return <>{note("load") ?? <p className="muted">Loading…</p>}</>;
  return (
    <>
      <section className="panel">
        <h2>Your details</h2>
        <form className="stack" onSubmit={saveDetails}>
          <label className="field">
            Name
            <input className="full" autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            Phone
            <input className="full" type="tel" autoComplete="tel" maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <button className="primary" type="submit" disabled={busy}>Save</button>
          {note("details")}
        </form>
      </section>

      <section className="panel">
        <h2>Email</h2>
        <p>You sign in as <strong>{me.user.email}</strong>.</p>
        {config ? (
          <form className="stack" onSubmit={changeEmail}>
            <label className="field">
              New email
              <input className="full" type="email" autoComplete="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </label>
            <button className="secondary" type="submit" disabled={busy}>Change email</button>
            {note("email")}
          </form>
        ) : <p className="muted">Email changes need Supabase sign-in, which this development server does not have.</p>}
      </section>

      <section className="panel">
        <h2>Password</h2>
        {config ? <NewPasswordForm config={config} currentEmail={me.user.email} done={() => setMsg({ part: "password", text: "Password changed." })} /> : <p className="muted">Not available on this development server.</p>}
        {note("password")}
      </section>

      {me.accounts.length > 1 ? (
        <section className="panel">
          <h2>Account</h2>
          <p className="muted">You belong to more than one account. RhoeFlow shows one at a time.</p>
          {me.accounts.map((a) => (
            <div className="row spread" key={a.account_id}>
              <span>
                {a.name} <span className="pill">{a.role}</span>
              </span>
              {a.account_id === me.account?.account_id ? <span className="pill ok">Current</span> : <button className="secondary" type="button" disabled={busy} onClick={() => void switchTo(a.account_id)}>Switch</button>}
            </div>
          ))}
          {note("account")}
        </section>
      ) : null}

      <form method="post" action="/auth/sign-out">
        <button className="secondary" type="submit">Sign out</button>
      </form>
    </>
  );
}
