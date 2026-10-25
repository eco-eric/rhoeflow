"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FOUNDATION_TYPES, IECC_CLIMATE_ZONES } from "@rhoeflow/schema";
import { SLOT_SPECS, TEMPLATE_SLOTS, TEMPLATE_VERSION, TemplateSchema, diffTemplates, type Template, type TemplateSlot } from "@rhoeflow/templates";
import { api, ApiError } from "../../../lib/api-client";

/**
 * Template editor (WO-03 D9; ADR-024; owner decision 5). Desktop first, usable on a phone.
 * - Every value needs at least one source and a basis: the schema refuses it otherwise, and Save
 *   stays off until the whole template validates.
 * - Saving makes a new immutable version with a change note; nothing is edited in place.
 * - Before saving it shows what changed and which open jobs picked this template. Those jobs keep
 *   their version until the tech takes the new one in the field app (ADR-003).
 */

interface Detail {
  template: { template_id: string; current_version: number } | null;
  current: { template_id: string; version: string | null; payload: Template };
  versions: { version: number; source: string; editor_user_id: string | null; change_note: string; created_at: string }[];
  affected: { assessment_id: string; workedge_project_id: string; template_version: string | null; revision: number }[];
  can_edit: boolean;
}

const SLOT_LABELS: Record<TemplateSlot, string> = {
  ceiling_insulation_cavity_r: "Attic (ceiling) insulation, nominal R",
  wall_insulation_cavity_r: "Wall cavity insulation, nominal R",
  wall_insulation_continuous_r: "Wall continuous insulation, nominal R",
  window_ufactor: "Window U-factor",
  window_shgc: "Window SHGC",
  air_leakage: "Air leakage (the quick pass uses ResDB instead; kept for direct use)",
  duct_insulation_r: "Duct insulation R",
  duct_leakage_to_outside: "Duct leakage to outside, total",
  roof_radiant_barrier: "Radiant barrier",
  average_ceiling_height: "Ceiling height (quick pass Q4 default)",
  window_area_fraction: "Typical window area / floor area (quick pass Q7 \"typical\")",
  duct_leakage_sealed: "Duct leakage when sealed (quick pass Q10 \"sealed\")",
};

function blank(): Template {
  return {
    template_version: TEMPLATE_VERSION,
    template_id: "",
    name: "",
    description: "",
    region: { market: "DFW", state: "TX", iecc_climate_zone: "3A" },
    era: { year_from: null, year_to: null, code_basis: "" },
    style: { stories: 1, foundation: "slab-on-grade", attic: "vented", typical_cladding: "" },
    sources: [],
    defaults: {},
  } as Template;
}

type Path = (string | number)[];
function setIn<T>(obj: T, path: Path, value: unknown): T {
  const copy = structuredClone(obj) as Record<string | number, unknown>;
  let cur = copy;
  for (const k of path.slice(0, -1)) {
    if (cur[k] === undefined || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string | number, unknown>;
  }
  const last = path[path.length - 1]!;
  if (value === undefined) delete cur[last];
  else cur[last] = value;
  return copy as T;
}

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

export function TemplateEditor({ id, from }: { id: string; from: string | null }) {
  const isNew = id === "new";
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState<Template | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (isNew) {
          const perm = await api<{ can_edit: boolean }>("/api/templates");
          if (from) {
            const src = await api<Detail>(`/api/templates/${encodeURIComponent(from)}`);
            const copy = structuredClone(src.current.payload);
            copy.template_id = `${from}-copy`;
            copy.name = `${copy.name} (copy)`;
            setDraft(copy);
            setNote(`copied from ${from} ${src.current.version ?? "repo copy"}`);
          } else {
            setDraft(blank());
            setNote("new template");
          }
          setDetail({ template: null, current: { template_id: "", version: null, payload: blank() }, versions: [], affected: [], can_edit: perm.can_edit });
        } else {
          const d = await api<Detail>(`/api/templates/${encodeURIComponent(id)}`);
          setDetail(d);
          setDraft(structuredClone(d.current.payload));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [id, from, isNew]);

  const validation = useMemo(() => (draft ? TemplateSchema.safeParse(draft) : null), [draft]);
  const issues = validation && !validation.success ? validation.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })) : [];
  const changes = useMemo(() => (draft && detail ? diffTemplates(isNew ? null : detail.current.payload, draft) : []), [draft, detail, isNew]);

  if (error && !draft) return <div className="issue error" role="alert">{error}</div>;
  if (!draft || !detail) return <p className="muted">Loading…</p>;
  const ro = !detail.can_edit || (!isNew && detail.template === null);
  const set = (path: Path, value: unknown) => setDraft((d) => (d ? setIn(d, path, value) : d));
  const sourceIds = draft.sources.map((s) => s.id);
  const referenced = (sid: string) =>
    Object.values(draft.defaults).some((v) => v?.sources.includes(sid)) || (draft.sanity_band?.sources.includes(sid) ?? false);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      if (isNew) {
        const r = await api<{ version: { version: number } }>("/api/templates", { method: "POST", body: { payload: draft, change_note: note } });
        setSaved(`Created ${draft.template_id} v${r.version.version}.`);
        location.assign(`/templates/${encodeURIComponent(draft.template_id)}`);
        return;
      }
      const r = await api<{ version: { version: number }; stale_runs: number; affected_assessments: unknown[] }>(`/api/templates/${encodeURIComponent(id)}/versions`, {
        method: "POST",
        body: { payload: draft, change_note: note, expected_current_version: detail.template!.current_version },
      });
      setSaved(
        `Saved v${r.version.version}. ${r.affected_assessments.length} open ${r.affected_assessments.length === 1 ? "job is" : "jobs are"} offered the new version; ${r.stale_runs} ${r.stale_runs === 1 ? "run" : "runs"} on the old version marked out of date.`,
      );
      const d = await api<Detail>(`/api/templates/${encodeURIComponent(id)}`);
      setDetail(d);
      setDraft(structuredClone(d.current.payload));
      setNote("");
    } catch (e) {
      setError(e instanceof ApiError && e.status === 412 ? "Someone saved a newer version while you were editing. Reload to see it; your edits are still on this page." : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const text = (label: string, path: Path, value: string, wide = false) => (
    <label className="field">
      {label}
      <input className={wide ? "wide" : ""} disabled={ro} value={value} onChange={(e) => set(path, e.target.value)} />
    </label>
  );

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/templates">← Templates</Link>
        <span className="pill">{isNew ? "new" : (detail.current.version ?? "repo copy")}</span>
      </div>
      <h1>{isNew ? (from ? "Copy template" : "New template") : draft.name}</h1>
      {!detail.can_edit ? <div className="issue">Read only: editing needs the owner to add you to the template editor list.</div> : null}
      {detail.can_edit && !isNew && detail.template === null ? (
        <div className="issue">
          This is the repo copy. Load the templates into the store from the <Link href="/templates">template list</Link> to edit it.
        </div>
      ) : null}

      <section className="panel">
        <h2>Identity</h2>
        <div className="row">
          {isNew ? text("Template id (lowercase, dashes)", ["template_id"], draft.template_id, true) : null}
          {text("Name", ["name"], draft.name, true)}
        </div>
        <label className="field" style={{ marginTop: 8 }}>
          Description
          <textarea disabled={ro} rows={3} style={{ width: "100%" }} value={draft.description} onChange={(e) => set(["description"], e.target.value)} />
        </label>
      </section>

      <section className="panel">
        <h2>Era, style and region</h2>
        <div className="row">
          <label className="field">
            Built from (blank: no lower bound)
            <input disabled={ro} inputMode="numeric" value={draft.era.year_from ?? ""} onChange={(e) => set(["era", "year_from"], numOrNull(e.target.value))} />
          </label>
          <label className="field">
            Built through (blank: no upper bound)
            <input disabled={ro} inputMode="numeric" value={draft.era.year_to ?? ""} onChange={(e) => set(["era", "year_to"], numOrNull(e.target.value))} />
          </label>
          {text("Energy code basis", ["era", "code_basis"], draft.era.code_basis, true)}
        </div>
        <div className="row">
          <label className="field">
            Stories
            <select disabled={ro} value={draft.style.stories} onChange={(e) => set(["style", "stories"], Number(e.target.value))}>
              {[1, 2, 3].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Foundation
            <select disabled={ro} value={draft.style.foundation} onChange={(e) => set(["style", "foundation"], e.target.value)}>
              {FOUNDATION_TYPES.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Attic
            <select disabled={ro} value={draft.style.attic} onChange={(e) => set(["style", "attic"], e.target.value)}>
              {["vented", "unvented", "conditioned"].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          {text("Typical cladding", ["style", "typical_cladding"], draft.style.typical_cladding, true)}
        </div>
        <div className="row">
          {text("Market", ["region", "market"], draft.region.market)}
          {text("State", ["region", "state"], draft.region.state)}
          <label className="field">
            IECC zone
            <select disabled={ro} value={draft.region.iecc_climate_zone} onChange={(e) => set(["region", "iecc_climate_zone"], e.target.value)}>
              {IECC_CLIMATE_ZONES.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Sources</h2>
        <p className="muted" style={{ marginTop: 0 }}>Every value below cites one or more of these.</p>
        {draft.sources.map((s, i) => (
          <div className="row" key={i} style={{ marginBottom: 10 }}>
            {text("Id", ["sources", i, "id"], s.id)}
            {text("Citation", ["sources", i, "citation"], s.citation, true)}
            <label className="field">
              URL (optional)
              <input className="wide" disabled={ro} value={s.url ?? ""} onChange={(e) => set(["sources", i, "url"], e.target.value.trim() === "" ? undefined : e.target.value)} />
            </label>
            {!ro ? (
              <button type="button" className="secondary" disabled={referenced(s.id)} title={referenced(s.id) ? "a value still cites this source" : ""} onClick={() => set(["sources"], draft.sources.filter((_, k) => k !== i))}>
                Remove
              </button>
            ) : null}
          </div>
        ))}
        {!ro ? (
          <button type="button" className="secondary" onClick={() => set(["sources"], [...draft.sources, { id: `source-${draft.sources.length + 1}`, citation: "" }])}>
            Add a source
          </button>
        ) : null}
      </section>

      <section className="panel">
        <h2>Default values</h2>
        {TEMPLATE_SLOTS.map((slot) => {
          const spec = SLOT_SPECS[slot];
          const v = draft.defaults[slot] as (Record<string, unknown> & { value: number | boolean; sources: string[]; basis: string; unit?: string; range?: { low: number; high: number } }) | undefined;
          const on = v !== undefined;
          return (
            <div key={slot} id={`slot-${slot}`} style={{ borderTop: "1px solid var(--line)", padding: "12px 0" }}>
              <label className="row" style={{ alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  disabled={ro}
                  checked={on}
                  onChange={(e) =>
                    set(
                      ["defaults", slot],
                      e.target.checked ? (spec.units === "boolean" ? { value: false, sources: [], basis: "" } : { value: 0, unit: spec.units[0], sources: [], basis: "" }) : undefined,
                    )
                  }
                />
                <strong>{SLOT_LABELS[slot]}</strong>
                {!on ? <span className="muted">not set</span> : null}
              </label>
              {on && v ? (
                <>
                  <div className="row" style={{ marginTop: 8 }}>
                    {spec.units === "boolean" ? (
                      <label className="field">
                        Value
                        <select disabled={ro} value={String(v.value)} onChange={(e) => set(["defaults", slot, "value"], e.target.value === "true")}>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </label>
                    ) : (
                      <>
                        <label className="field">
                          Value
                          <input disabled={ro} inputMode="decimal" aria-label={`${slot} value`} value={Number.isNaN(v.value as number) ? "" : String(v.value)} onChange={(e) => set(["defaults", slot, "value"], e.target.value.trim() === "" ? Number.NaN : Number(e.target.value))} />
                        </label>
                        <label className="field">
                          Unit
                          <select disabled={ro} value={v.unit} onChange={(e) => set(["defaults", slot, "unit"], e.target.value)}>
                            {spec.units.map((u) => (
                              <option key={u}>{u}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          Range low (optional)
                          <input disabled={ro} inputMode="decimal" value={v.range?.low ?? ""} onChange={(e) => set(["defaults", slot, "range"], e.target.value.trim() === "" ? undefined : { low: Number(e.target.value), high: v.range?.high ?? Number(e.target.value) })} />
                        </label>
                        {v.range ? (
                          <label className="field">
                            Range high
                            <input disabled={ro} inputMode="decimal" value={v.range.high} onChange={(e) => set(["defaults", slot, "range", "high"], Number(e.target.value))} />
                          </label>
                        ) : null}
                      </>
                    )}
                  </div>
                  <SourcePicker ids={sourceIds} chosen={v.sources} disabled={ro} onChange={(next) => set(["defaults", slot, "sources"], next)} />
                  <label className="field">
                    Basis: why this value, and what to inspect to replace it
                    <textarea disabled={ro} rows={2} style={{ width: "100%" }} value={v.basis} onChange={(e) => set(["defaults", slot, "basis"], e.target.value)} />
                  </label>
                </>
              ) : null}
            </div>
          );
        })}
      </section>

      <section className="panel" id="sanity-band">
        <h2>Sanity band</h2>
        <label className="row" style={{ alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            disabled={ro}
            checked={!!draft.sanity_band}
            onChange={(e) => set(["sanity_band"], e.target.checked ? { ft2_per_ton: { low: 350, high: 450 }, sources: [], basis: "" } : undefined)}
          />
          {draft.sanity_band ? "Warn when a result falls outside this band (never an error)" : "No band on file"}
        </label>
        {draft.sanity_band ? (
          <>
            <div className="row" style={{ marginTop: 8 }}>
              <label className="field">
                Low (ft² per ton)
                <input disabled={ro} inputMode="decimal" aria-label="band low" value={draft.sanity_band.ft2_per_ton.low} onChange={(e) => set(["sanity_band", "ft2_per_ton", "low"], Number(e.target.value))} />
              </label>
              <label className="field">
                High (ft² per ton)
                <input disabled={ro} inputMode="decimal" aria-label="band high" value={draft.sanity_band.ft2_per_ton.high} onChange={(e) => set(["sanity_band", "ft2_per_ton", "high"], Number(e.target.value))} />
              </label>
            </div>
            <SourcePicker ids={sourceIds} chosen={draft.sanity_band.sources} disabled={ro} onChange={(next) => set(["sanity_band", "sources"], next)} />
            <label className="field">
              Basis
              <textarea disabled={ro} rows={2} style={{ width: "100%" }} value={draft.sanity_band.basis} onChange={(e) => set(["sanity_band", "basis"], e.target.value)} />
            </label>
          </>
        ) : null}
      </section>

      {!ro ? (
        <section className="panel" aria-label="Review and save">
          <h2>Review and save</h2>
          {issues.length ? (
            <>
              <p>Fix these before saving:</p>
              {issues.map((i) => (
                <div key={i.path + i.message} className="issue error">
                  {i.path || "template"}: {i.message}
                </div>
              ))}
            </>
          ) : (
            <p className="pill ok" style={{ display: "inline-block" }}>Every value is sourced and the template validates</p>
          )}
          <h3>{changes.length} {changes.length === 1 ? "change" : "changes"}{isNew ? "" : ` from ${detail.current.version ?? "the current version"}`}</h3>
          <ul>
            {changes.slice(0, 60).map((c) => (
              <li key={c.path} className="source">
                {c.path}: {JSON.stringify(c.from) ?? "–"} → {JSON.stringify(c.to) ?? "removed"}
              </li>
            ))}
          </ul>
          {!isNew ? (
            <>
              <h3>Open jobs using this template: {detail.affected.length}</h3>
              <ul>
                {detail.affected.map((a) => (
                  <li key={a.assessment_id} className="source">
                    WorkEdge project {a.workedge_project_id}, on {a.template_version ?? "the repo copy"}, revision {a.revision}
                  </li>
                ))}
              </ul>
              <p className="muted">They keep their version; each tech is offered the new one and decides. Runs that used the old stored version are marked out of date.</p>
            </>
          ) : null}
          <label className="field">
            Change note (required)
            <input className="wide" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. band from the first ten jobs" />
          </label>
          {error ? <div className="issue error" role="alert">{error}</div> : null}
          {saved ? <div className="issue" role="status">{saved}</div> : null}
          <button type="button" className="primary" style={{ marginTop: 12 }} disabled={busy || issues.length > 0 || changes.length === 0 || note.trim() === ""} onClick={() => void save()}>
            {busy ? "Saving…" : isNew ? "Create template" : "Save as a new version"}
          </button>
        </section>
      ) : null}

      {!isNew ? (
        <section className="panel">
          <h2>Versions</h2>
          {detail.versions.length === 0 ? <p className="muted">Repo copy: not in the store yet.</p> : null}
          <ul>
            {[...detail.versions].reverse().map((v) => (
              <li key={v.version} className="source">
                v{v.version} · {new Date(v.created_at).toLocaleString()} · {v.source === "repo" ? "from the repo" : `by ${v.editor_user_id ?? "unknown"}`} · {v.change_note}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function SourcePicker({ ids, chosen, disabled, onChange }: { ids: string[]; chosen: string[]; disabled: boolean; onChange: (next: string[]) => void }) {
  return (
    <div className="choices" role="group" aria-label="Sources">
      <span className="muted" style={{ alignSelf: "center" }}>
        Sources:
      </span>
      {ids.length === 0 ? <span className="muted">add a source above first</span> : null}
      {ids.map((id) => (
        <button type="button" key={id} className="choice" disabled={disabled} aria-pressed={chosen.includes(id)} onClick={() => onChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id])}>
          {id}
        </button>
      ))}
      {chosen.length === 0 ? <span className="issue error" style={{ margin: 0 }}>no source: this value cannot be saved</span> : null}
    </div>
  );
}
