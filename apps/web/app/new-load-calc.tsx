"use client";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api-client";

/** Start a load calc in RhoeFlow from a customer name and an address (ADR-040). WorkEdge is optional. */
export function NewLoadCalc() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <form onSubmit={start} className="stack">
      <label className="field">
        Customer name
        <input name="customer_name" className="full" required maxLength={200} autoComplete="off" />
      </label>
      <label className="field">
        Street address
        <input name="address_line1" className="full" required maxLength={200} autoComplete="off" />
      </label>
      <div className="row">
        <label className="field">
          City
          <input name="city" maxLength={100} autoComplete="off" />
        </label>
        <label className="field">
          State
          <input name="state" maxLength={50} size={4} autoComplete="off" />
        </label>
        <label className="field">
          ZIP
          <input name="postal_code" maxLength={20} size={8} inputMode="numeric" autoComplete="off" />
        </label>
      </div>
      <label className="field">
        Job name (optional)
        <input name="name" className="full" maxLength={200} placeholder="Defaults to the customer and street" autoComplete="off" />
      </label>
      {error ? (
        <div className="issue error" role="alert">
          {error}
        </div>
      ) : null}
      <button type="submit" disabled={busy}>
        {busy ? "Starting…" : "Start load calc"}
      </button>
    </form>
  );
}
