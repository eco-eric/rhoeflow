"use client";
import { useState } from "react";
import {
  DESIGN_LIMITS,
  DESIGN_OVERRIDE_KEYS,
  designValuesInUse,
  type DesignDefaultsContext,
  type DesignOverrides,
  type DesignValueInUse,
  type StationDesignValues,
} from "@rhoeflow/templates";

const ORIGIN: Record<DesignValueInUse["origin"], { label: string; tone: string }> = {
  this_calc: { label: "This load calc", tone: "warn" },
  account: { label: "Company default", tone: "ok" },
  standard: { label: "Standard", tone: "" },
};

const one = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * The four design conditions this load calc uses (ADR-047): indoor set points and outdoor winter and
 * summer design temperatures, each with where it came from. The tech can change any of them for
 * this job only; the change is saved with the answers and marked as the tech's choice on the report.
 */
export function DesignConditionsCard({
  station,
  design,
  overrides,
  onChange,
}: {
  station: StationDesignValues;
  design: DesignDefaultsContext | null;
  overrides: DesignOverrides | undefined;
  onChange: (next: DesignOverrides | undefined) => void;
}) {
  const used = designValuesInUse(station, design?.defaults ?? null, overrides);
  const [editing, setEditing] = useState<DesignValueInUse["key"] | null>(null);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const set = (u: DesignValueInUse, value: number | undefined) => {
    const k = DESIGN_OVERRIDE_KEYS[u.key];
    const next = { ...(overrides ?? {}) } as Record<string, unknown>;
    if (value === undefined) delete next[k];
    else next[k] = { value, state: "assumed", evidence: [], alternatives: [] };
    onChange(Object.keys(next).length ? (next as DesignOverrides) : undefined);
  };
  const save = (u: DesignValueInUse) => {
    const lim = DESIGN_LIMITS[u.key];
    const v = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(v)) return setErr("Enter a temperature in °F.");
    if (v < lim.min || v > lim.max) return setErr(`Use a value from ${lim.min} to ${lim.max} °F.`);
    set(u, Math.round(v * 10) / 10);
    setEditing(null);
    setErr(null);
  };

  return (
    <section className="panel">
      <h2>Design conditions</h2>
      <p className="muted fine">
        {design ? `Your company's defaults from Settings, unless changed here for this job.` : "Standard values. Your admins can set company defaults under Settings, Design conditions."}
      </p>
      {used.map((u) => (
        <div key={u.key} className="row spread">
          {editing === u.key ? (
            <form
              className="row"
              style={{ width: "100%" }}
              onSubmit={(e) => {
                e.preventDefault();
                save(u);
              }}
            >
              <label className="field">
                {u.label} for this load calc (°F)
                <input className="full" type="number" inputMode="decimal" step="0.1" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} />
              </label>
              <button className="primary" type="submit">Use it</button>
              <button className="secondary" type="button" onClick={() => { setEditing(null); setErr(null); }}>Cancel</button>
              {err ? <p className="issue error" role="alert" style={{ width: "100%" }}>{err}</p> : null}
            </form>
          ) : (
            <>
              <span>
                {u.label}
                <small className="muted block">
                  <strong>{one(u.value)} °F</strong> <span className={`pill ${ORIGIN[u.origin].tone}`}>{ORIGIN[u.origin].label}</span>
                  {u.origin !== "standard" ? ` Standard is ${one(u.standard)} °F.` : ""}
                </small>
              </span>
              <span>
                {u.origin === "this_calc" ? (
                  <button type="button" className="linkish" onClick={() => set(u, undefined)}>
                    Use {u.account !== null ? "company default" : "standard"}
                  </button>
                ) : null}{" "}
                <button type="button" className="linkish" onClick={() => { setEditing(u.key); setDraft(one(u.value)); setErr(null); }}>
                  Change
                </button>
              </span>
            </>
          )}
        </div>
      ))}
    </section>
  );
}
