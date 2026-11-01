"use client";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api-client";

type Role = "admin" | "member";
interface Account {
  account_id: string;
  name: string;
  role: Role;
}
interface Member {
  user_id: string;
  email: string;
  full_name: string | null;
  role: Role;
  joined_at: string;
}
interface Invite {
  invite_id: string;
  email: string;
  role: Role;
  invited_at: string;
}
interface WorkEdge {
  connected: boolean;
  key_hint: string | null;
}

const ROLE_HELP: Record<Role, string> = {
  admin: "Admins manage the account, its people, templates and the WorkEdge connection.",
  member: "Members do assessments, runs and reports for the account's jobs.",
};

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * The account page (ADR-039). Everyone sees the name, the people and the WorkEdge status; admins
 * also rename, change roles, remove people and manage invites. The database enforces the same rules,
 * including that the last admin stays, so this page only hides what would be refused anyway.
 */
export function AccountSettings() {
  const [account, setAccount] = useState<Account | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [workedge, setWorkedge] = useState<WorkEdge | null>(null);
  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [msg, setMsg] = useState<{ part: string; text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  const load = async () => {
    const [a, m, i, w] = await Promise.all([
      api<Account>("/api/account"),
      api<{ members: Member[]; me: string }>("/api/account/members"),
      api<{ invites: Invite[] }>("/api/account/invites"),
      api<WorkEdge>("/api/connections/workedge").catch(() => null),
    ]);
    setAccount(a);
    setName(a.name);
    setMembers(m.members);
    setMe(m.me);
    setInvites(i.invites);
    setWorkedge(w);
  };
  useEffect(() => {
    setOrigin(window.location.origin);
    load().catch((e: unknown) => setMsg({ part: "load", text: e instanceof Error ? e.message : String(e), error: true }));
  }, []);

  const run = async (part: string, fn: () => Promise<string | null>) => {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      await load();
      if (text) setMsg({ part, text });
    } catch (e) {
      setMsg({ part, text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  };
  const note = (part: string) => (msg && msg.part === part ? <p className={msg.error ? "issue error" : "muted"} role={msg.error ? "alert" : "status"}>{msg.text}</p> : null);

  if (!account) return note("load") ?? <p className="muted">Loading…</p>;
  const admin = account.role === "admin";
  const admins = members.filter((m) => m.role === "admin").length;

  const rename = (e: React.FormEvent) => {
    e.preventDefault();
    void run("name", async () => {
      await api("/api/account", { method: "PATCH", body: { name } });
      return "Saved.";
    });
  };
  const setRole = (m: Member, role: Role) =>
    run("members", async () => {
      await api(`/api/account/members/${encodeURIComponent(m.user_id)}`, { method: "PATCH", body: { role } });
      if (m.user_id === me && role !== "admin") window.location.reload();
      return `${m.full_name ?? m.email} is now ${role === "admin" ? "an admin" : "a member"}.`;
    });
  const remove = (m: Member) => {
    const self = m.user_id === me;
    const ok = window.confirm(self ? `Leave ${account.name}? You lose access to its jobs and reports.` : `Remove ${m.full_name ?? m.email} from ${account.name}? They lose access right away.`);
    if (!ok) return;
    void run("members", async () => {
      await api(`/api/account/members/${encodeURIComponent(m.user_id)}`, { method: "DELETE" });
      if (self) window.location.assign("/");
      return `${m.full_name ?? m.email} was removed.`;
    });
  };
  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    void run("invites", async () => {
      const r = await api<Invite>("/api/account/invites", { method: "POST", body: { email: inviteEmail, role: inviteRole } });
      setInviteEmail("");
      return `Invited ${r.email}. Send them the sign-up link below; they join once they confirm that email.`;
    });
  };
  const withdraw = (i: Invite) =>
    run("invites", async () => {
      await api(`/api/account/invites/${encodeURIComponent(i.invite_id)}`, { method: "DELETE" });
      return `Withdrew the invite for ${i.email}.`;
    });

  return (
    <>
      <section className="panel">
        <h2>Company</h2>
        {admin ? (
          <form className="stack" onSubmit={rename}>
            <label className="field">
              Account name
              <input className="full" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <button className="secondary" type="submit" disabled={busy || name.trim() === account.name}>Save name</button>
            {note("name")}
          </form>
        ) : (
          <p>
            <strong>{account.name}</strong>
          </p>
        )}
        <p className="muted">Your role: {account.role}. {ROLE_HELP[account.role]}</p>
      </section>

      <section className="panel">
        <h2>People</h2>
        <div className="table-scroll">
          <table className="people">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Joined</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const lastAdmin = m.role === "admin" && admins <= 1;
                const self = m.user_id === me;
                return (
                  <tr key={m.user_id}>
                    <td>
                      {m.full_name ?? m.email}
                      {self ? " (you)" : ""}
                      {m.full_name ? <small className="muted block">{m.email}</small> : null}
                    </td>
                    <td>
                      {admin && !lastAdmin ? (
                        <select aria-label={`Role for ${m.email}`} value={m.role} disabled={busy} onChange={(e) => void setRole(m, e.target.value as Role)}>
                          <option value="admin">admin</option>
                          <option value="member">member</option>
                        </select>
                      ) : (
                        m.role
                      )}
                    </td>
                    <td>{day(m.joined_at)}</td>
                    <td>
                      {(admin || self) && !lastAdmin ? (
                        <button className="linkish" type="button" disabled={busy} onClick={() => remove(m)}>
                          {self ? "Leave" : "Remove"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {admins <= 1 && admin ? <p className="muted">An account always keeps at least one admin. Make someone else an admin before you step down.</p> : null}
        {note("members")}
      </section>

      {admin ? (
        <section className="panel">
          <h2>Invite someone</h2>
          <form className="stack" onSubmit={invite}>
            <label className="field">
              Their email
              <input className="full" type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            </label>
            <label className="field">
              Role
              <select className="full" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <p className="muted">{ROLE_HELP[inviteRole]}</p>
            <button className="primary" type="submit" disabled={busy}>Invite</button>
          </form>
          {note("invites")}
          <p className="muted">
            RhoeFlow doesn&apos;t email invites yet. Send them this link to make their login with the invited email: <code>{origin}/sign-up</code>
          </p>
          {invites.length > 0 ? (
            <>
              <h3>Waiting to join</h3>
              {invites.map((i) => (
                <div className="row spread" key={i.invite_id}>
                  <span>
                    {i.email} <span className="pill">{i.role}</span> <small className="muted">invited {day(i.invited_at)}</small>
                  </span>
                  <button className="linkish" type="button" disabled={busy} onClick={() => void withdraw(i)}>Withdraw</button>
                </div>
              ))}
            </>
          ) : null}
        </section>
      ) : null}

      <section className="panel">
        <h2>WorkEdge</h2>
        {workedge ? (
          workedge.connected ? (
            <p>
              <span className="pill ok">Connected</span> with the key ending in {workedge.key_hint}.
            </p>
          ) : (
            <p>
              <span className="pill warn">Not connected</span> RhoeFlow can&apos;t read this account&apos;s jobs until an admin connects WorkEdge.
            </p>
          )
        ) : null}
        <p>
          <a href="/settings/workedge">{admin ? "Connect or change WorkEdge" : "See the WorkEdge connection"}</a>
        </p>
      </section>
    </>
  );
}
