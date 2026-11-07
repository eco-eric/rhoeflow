"use client";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api-client";

interface StationStandard {
  station_key: string;
  name: string;
  state: string;
  heating_design_temp_f: number;
  cooling_design_temp_f: number;
  title: string;
}
interface Defaults {
  heating_setpoint_f?: number;
  cooling_setpoint_f?: number;
  stations: Record<string, { heating_design_temp_f?: number; cooling_design_temp_f?: number }>;
}
interface DesignView {
  defaults: Defaults;
  updated_at: string | null;
  can_edit: boolean;
  standard: { setpoints: { heating_setpoint_f: number; cooling_setpoint_f: number }; stations: StationStandard[] };
}

type Form = { heat: string; cool: string; stations: Record<string, { winter: string; summer: string }> };

const one = (n: number) => (Math.round(n * 10) / 10).toString();
const str = (n: number | undefined) => (n === undefined ? "" : String(n));
const num = (s: string): number | undefined => (s.trim() === "" ? undefined : Number(s));

function toForm(v: DesignView): Form {
  return {
    heat: str(v.defaults.heating_setpoint_f),
    cool: str(v.defaults.cooling_setpoint_f),
    stations: Object.fromEntries(
      v.standard.stations.map((s) => [s.station_key, { winter: str(v.defaults.stations[s.station_key]?.heating_design_temp_f), summer: str(v.defaults.stations[s.station_key]?.cooling_design_temp_f) }]),
    ),
  };
}

/**
 * The account's design conditions (ADR-047). A blank box uses the standard value shown in it:
 * Manual J's indoor 70 °F / 75 °F and each weather station's ASHRAE 99 % and 1 % dry bulbs. Admins
 * change them; everyone sees them. A load calc can still change any of them for one job.
 */
export function DesignSettings() {
  const [view, setView] = useState<DesignView | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<DesignView>("/api/account/design")
      .then((v) => {
        setView(v);
        setForm(toForm(v));
      })
      .catch((e: unknown) => setMsg({ text: e instanceof Error ? e.message : String(e), error: true }));
  }, []);

  if (!view || !form) return msg ? <p className="issue error" role="alert">{msg.text}</p> : <p className="muted">Loading…</p>;
  const edit = view.can_edit;
  const std = view.standard;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body: Defaults = { stations: {} };
      const h = num(form.heat);
      const c = num(form.cool);
      if (h !== undefined) body.heating_setpoint_f = h;
      if (c !== undefined) body.cooling_setpoint_f = c;
      for (const [k, s] of Object.entries(form.stations)) {
        const w = num(s.winter);
        const u = num(s.summer);
        if (w !== undefined || u !== undefined) body.stations[k] = { ...(w !== undefined ? { heating_design_temp_f: w } : {}), ...(u !== undefined ? { cooling_design_temp_f: u } : {}) };
      }
      const v = await api<DesignView>("/api/account/design", { method: "PUT", body });
      setView(v);
      setForm(toForm(v));
      setMsg({ text: "Saved. Load calcs use these the next time they're run; runs already made keep the values they used." });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, value: string, standard: number, onChange: (v: string) => void, help: string) => (
    <label className="field">
      {label}
      <input
        className="full"
        type="number"
        inputMode="decimal"
        step="0.1"
        value={value}
        placeholder={`${one(standard)} (standard)`}
        disabled={!edit || busy}
        onChange={(e) => onChange(e.target.value)}
      />
      <small className="muted">{value.trim() === "" ? `Using the standard ${one(standard)} °F. ${help}` : `Standard is ${one(standard)} °F. Clear the box to use it again.`}</small>
    </label>
  );

  return (
    <form className="stack" onSubmit={(e) => void save(e)}>
      <p className="muted">
        These are your company&apos;s defaults for every new load calc. Leave a box blank to use the standard value. A tech can still change any of them on one load calc, and the
        report shows every value that differs from the standard one.
      </p>
      {!edit ? <p className="muted">Only your account&apos;s admins can change these.</p> : null}

      <section className="panel">
        <h2>Indoor set points</h2>
        {field("Heating set point (°F)", form.heat, std.setpoints.heating_setpoint_f, (heat) => setForm({ ...form, heat }), "That's Manual J's indoor winter design condition.")}
        {field("Cooling set point (°F)", form.cool, std.setpoints.cooling_setpoint_f, (cool) => setForm({ ...form, cool }), "That's Manual J's indoor summer design condition.")}
      </section>

      {std.stations.map((s) => {
        const f = form.stations[s.station_key] ?? { winter: "", summer: "" };
        const set = (patch: Partial<typeof f>) => setForm({ ...form, stations: { ...form.stations, [s.station_key]: { ...f, ...patch } } });
        return (
          <section className="panel" key={s.station_key}>
            <h2>Outdoor design temperatures</h2>
            <p className="muted">
              {s.name}, {s.state} (weather station {s.station_key}). Standard values are from {s.title}.
            </p>
            {field("Winter design temperature (°F)", f.winter, s.heating_design_temp_f, (winter) => set({ winter }), "That's the ASHRAE 99 % heating dry bulb.")}
            {field("Summer design temperature (°F)", f.summer, s.cooling_design_temp_f, (summer) => set({ summer }), "That's the ASHRAE 1 % cooling dry bulb.")}
            <p className="muted fine">Outdoor humidity stays the station&apos;s, so a hotter summer temperature raises the sensible load, not the latent load.</p>
          </section>
        );
      })}

      {edit ? (
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save design conditions"}
        </button>
      ) : null}
      {msg ? <p className={msg.error ? "issue error" : "muted"} role={msg.error ? "alert" : "status"}>{msg.text}</p> : null}
      {view.updated_at ? <p className="muted fine">Last saved {new Date(view.updated_at).toLocaleString()}.</p> : null}
    </form>
  );
}
