"use client";
import { useState } from "react";
import { api } from "../../lib/api-client";

export function CheckInvites() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ accepted: number; account: unknown }>("/api/me/invites", { method: "POST" });
      if (r.account) return window.location.assign("/");
      setMsg("Still no invite for this email.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className="secondary" type="button" onClick={check} disabled={busy}>{busy ? "Checking…" : "Check for an invite"}</button>
      {msg ? <p className="muted" role="status">{msg}</p> : null}
    </>
  );
}
