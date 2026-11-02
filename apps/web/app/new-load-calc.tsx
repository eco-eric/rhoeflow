"use client";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api-client";

/**
 * Start a load calc in RhoeFlow from a customer name and an address (ADR-040). WorkEdge is
 * optional. When the account already has load calcs the form starts folded behind one button so
 * the list stays near the top on a phone.
 */
export function NewLoadCalc({ startOpen }: { startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className="primary" onClick={() => setOpen(true)}>
        New load calc
      </button>
    );
  }

  async function start(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "");
    setBusy(true);
    setError(null);
    try {
      const job = await api<{ job_id: string }>("/api/jobs", {
        method: "POST",
        body: {
          customer_name: text("customer_name"),
          address_line1: text("address_line1"),
          city: text("city"),
          state: text("state"),
          postal_code: text("postal_code"),
          name: text("name"),
        },
      });
      window.location.assign(`/j/${job.job_id}`);
    } catch (err) {
      const issues = err instanceof ApiError ? (err.details?.["issues"] as { message: string }[] | undefined) : undefined;
      setError(issues?.length ? issues.map((i) => i.message).join("; ") : err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>New load calc</h2>
      <form onSubmit={start} className="stack">
        <label className="field">
          Customer name
          <input name="customer_name" required maxLength={200} autoComplete="off" autoCapitalize="words" enterKeyHint="next" autoFocus={!startOpen} />
        </label>
        <label className="field">
          Street address
          <input name="address_line1" required maxLength={200} autoComplete="off" autoCapitalize="words" enterKeyHint="next" />
        </label>
        <div className="addr-row">
          <label className="field">
            City
            <input name="city" maxLength={100} autoComplete="off" autoCapitalize="words" enterKeyHint="next" />
          </label>
          <label className="field">
            State
            <input name="state" maxLength={50} autoComplete="off" autoCapitalize="characters" enterKeyHint="next" placeholder="TX" />
          </label>
          <label className="field">
            ZIP
            <input name="postal_code" maxLength={20} inputMode="numeric" autoComplete="off" enterKeyHint="next" />
          </label>
        </div>
        <label className="field">
          Job name (optional)
          <input name="name" maxLength={200} autoComplete="off" enterKeyHint="go" placeholder="Defaults to customer and street" />
        </label>
        {error ? (
          <div className="issue error" role="alert">
            {error}
          </div>
        ) : null}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Starting…" : "Start load calc"}
        </button>
        {startOpen ? null : (
          <button type="button" className="linkish" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </button>
        )}
        <p className="fine">You can link it to a WorkEdge job later.</p>
      </form>
    </section>
  );
}
