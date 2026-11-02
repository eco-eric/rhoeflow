"use client";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../../lib/api-client";

/**
 * Link this job to a WorkEdge job later (ADR-040). Once linked, photos, the PDF and notes can go to
 * that WorkEdge job; the link is made once and never moved to another WorkEdge job.
 */
export function LinkWorkEdge({ jobId }: { jobId: string }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function link(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/jobs/${jobId}/workedge`, { method: "POST", body: { workedge_project_id: value } });
      window.location.reload();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={link} className="stack" style={{ marginTop: 8 }}>
      <label className="field">
        Link to a WorkEdge job (optional)
        <input className="full" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste the job's WorkEdge link" autoComplete="off" required />
      </label>
      {error ? (
        <div className="issue error" role="alert">
          {error}
        </div>
      ) : null}
      <button type="submit" className="secondary" disabled={busy || value.trim() === ""}>
        {busy ? "Linking…" : "Link to WorkEdge"}
      </button>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Linking is for good: this job can&apos;t be moved to a different WorkEdge job afterwards.
      </p>
    </form>
  );
}
