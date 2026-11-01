"use client";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api-client";

interface Status {
  connected: boolean;
  credential_kind: "api_key" | "oauth" | null;
  key_hint: string | null;
  connected_by: string | null;
  connected_at: string | null;
  last_checked_at: string | null;
  can_manage: boolean;
}
interface Check {
  sample_projects: string[];
  more: boolean;
  key_hint: string;
}

/**
 * Paste, check, confirm, save. The key is held only in this form until it is saved, sent once to
 * check and once to save, then cleared; the page never shows more than its last four characters.
 */
export function ConnectWorkEdge() {
  const [status, setStatus] = useState<Status | null>(null);
  const [key, setKey] = useState("");
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);

  const load = () =>
    api<Status>("/api/connections/workedge")
      .then(setStatus)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  useEffect(() => {
    void load();
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onCheck = () =>
    run(async () => {
      setCheck(await api<Check>("/api/connections/workedge/check", { method: "POST", body: { api_key: key } }));
    });
  const onSave = () =>
    run(async () => {
      setStatus(await api<Status>("/api/connections/workedge", { method: "PUT", body: { api_key: key } }));
      setKey("");
      setCheck(null);
      setReplacing(false);
    });
  const onDisconnect = () =>
    run(async () => {
      if (!window.confirm("Disconnect WorkEdge? RhoeFlow stops reading this account's jobs until an admin connects it again.")) return;
      setStatus(await api<Status>("/api/connections/workedge", { method: "DELETE" }));
    });

  if (!status) return error ? <div className="issue error" role="alert">{error}</div> : <p className="muted">Loading…</p>;

  const showForm = status.can_manage && (!status.connected || replacing);
  return (
    <>
      <section className="panel">
        <div className="status">
          <span className={`pill ${status.connected ? "ok" : "warn"}`}>{status.connected ? "Connected" : "Not connected"}</span>
          {status.connected && status.key_hint ? <span className="muted">Key ending {status.key_hint}</span> : null}
        </div>
        {status.connected && status.connected_at ? <p className="muted">Connected {new Date(status.connected_at).toLocaleString()}</p> : null}
        {!status.can_manage ? <p className="muted">Only this account&apos;s admins can connect or change WorkEdge. Ask the owner to add you.</p> : null}
        {status.can_manage && status.connected && !replacing ? (
          <div className="row">
            <button type="button" className="secondary" disabled={busy} onClick={() => setReplacing(true)}>
              Replace key
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void onDisconnect()}>
              Disconnect
            </button>
          </div>
        ) : null}
      </section>

      {showForm ? (
        <section className="panel">
          <h2>{status.connected ? "Replace the WorkEdge key" : "Paste this account's WorkEdge key"}</h2>
          <p className="muted">In WorkEdge, open Settings, Integrations, API Keys, and create a key for this team. It starts with sk_.</p>
          <label className="field">
            API key
            <input
              className="wide"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setCheck(null);
              }}
            />
          </label>
          {!check ? (
            <p>
              <button type="button" className="primary" disabled={busy || key.trim().length === 0} onClick={() => void onCheck()}>
                {busy ? "Checking with WorkEdge…" : "Check key"}
              </button>
            </p>
          ) : (
            <>
              <h3>This key sees these jobs</h3>
              {check.sample_projects.length > 0 ? (
                <ul>
                  {check.sample_projects.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                  {check.more ? <li className="muted">and more</li> : null}
                </ul>
              ) : (
                <p className="muted">WorkEdge accepted the key, but it sees no jobs yet.</p>
              )}
              <p className="muted">If these are this account&apos;s jobs, save the key. If not, the key belongs to another WorkEdge team.</p>
              <div className="row">
                <button type="button" className="primary" disabled={busy} onClick={() => void onSave()}>
                  {busy ? "Saving…" : `Save key ending ${check.key_hint}`}
                </button>
                <button type="button" className="secondary" disabled={busy} onClick={() => setCheck(null)}>
                  Not these jobs
                </button>
              </div>
            </>
          )}
          {replacing ? (
            <button type="button" className="linkish" onClick={() => { setReplacing(false); setKey(""); setCheck(null); }}>
              Cancel
            </button>
          ) : null}
        </section>
      ) : null}

      {error ? <div className="issue error" role="alert">{error}</div> : null}
      <p className="muted">Sign in with WorkEdge, instead of a pasted key, comes once WorkEdge offers it.</p>
    </>
  );
}
