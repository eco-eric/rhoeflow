"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../lib/api-client";
import { ArchiveIcon, RestoreIcon } from "./icons";

/**
 * Archive a load calc's job or bring it back (ADR-042). Nothing is deleted; the page reloads its
 * list so the job moves between Active and Archived.
 */
export function ArchiveJobButton({ jobId, jobName, archived, variant = "icon" }: { jobId: string; jobName: string; archived: boolean; variant?: "icon" | "button" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/jobs/${jobId}/archive`, { method: "POST", body: { archived: !archived } });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const label = archived ? "Restore" : "Archive";
  if (variant === "button") {
    return (
      <>
        <button type="button" className="secondary" onClick={() => void toggle()} disabled={busy}>
          {busy ? (archived ? "Restoring…" : "Archiving…") : archived ? "Restore to your list" : "Archive this load calc"}
        </button>
        {error ? (
          <div className="issue error" role="alert">
            {error}
          </div>
        ) : null}
      </>
    );
  }
  return (
    <button type="button" className="icon-btn" onClick={() => void toggle()} disabled={busy} aria-label={`${label} ${jobName}`} title={error ?? `${label} ${jobName}`}>
      {archived ? <RestoreIcon /> : <ArchiveIcon />}
      <span aria-hidden="true">{error ? "Retry" : label}</span>
      {error ? <span role="alert" className="sr-only">{`Couldn't ${label.toLowerCase()} ${jobName}: ${error}`}</span> : null}
    </button>
  );
}
