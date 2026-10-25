"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Template } from "@rhoeflow/templates";
import { api } from "../../lib/api-client";

interface Row {
  template_id: string;
  name: string;
  current_version: number;
  archived: boolean;
  updated_at: string;
}
interface Current {
  template_id: string;
  version: string | null;
  payload: Template;
}

/** The template list (D9): the team's stored templates, or the repo set until it is seeded. */
export function TemplatesList() {
  const [data, setData] = useState<{ templates: Row[]; current: Current[]; can_edit: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<{ templates: Row[]; current: Current[]; can_edit: boolean }>("/api/templates")
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  useEffect(() => {
    void load();
  }, []);

  const seed = async () => {
    setBusy(true);
    try {
      await api("/api/templates/seed", { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="issue error" role="alert">{error}</div>;
  if (!data) return <p className="muted">Loading templates…</p>;
  const seeded = data.templates.length > 0;
  return (
    <>
      {!data.can_edit ? <div className="issue">You can read templates. Editing needs the owner to add you to the template editor list.</div> : null}
      {!seeded ? (
        <section className="panel">
          <h2>Templates are not in the store yet</h2>
          <p className="muted">Techs are picking from the repo&apos;s fixed set. Load it into the store to start editing; each template becomes version 1 with its sources.</p>
          {data.can_edit ? (
            <button type="button" className="primary" disabled={busy} onClick={() => void seed()}>
              {busy ? "Loading…" : "Load the repo templates into the store"}
            </button>
          ) : null}
        </section>
      ) : null}
      {data.can_edit && seeded ? (
        <div className="row" style={{ margin: "12px 0" }}>
          <Link className="secondary" href="/templates/new">
            New template from scratch
          </Link>
        </div>
      ) : null}
      {data.current.map((c) => {
        const t = c.payload;
        const band = t.sanity_band ? `${t.sanity_band.ft2_per_ton.low} to ${t.sanity_band.ft2_per_ton.high} ft² per ton` : "no band on file";
        return (
          <section className="panel" key={c.template_id}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0 }}>{t.name}</h2>
                <div className="source">
                  {c.template_id} · {t.era.year_from ?? "before"}–{t.era.year_to ?? "now"} · {t.style.stories} {t.style.stories === 1 ? "story" : "stories"} · {t.style.foundation}
                </div>
              </div>
              <span className="pill">{c.version ?? "repo copy"}</span>
            </div>
            <p className="source">Sanity band: {band}</p>
            <div className="row">
              <Link className="secondary" href={`/templates/${c.template_id}`}>
                {data.can_edit && seeded ? "Edit" : "View"}
              </Link>
              {data.can_edit && seeded ? (
                <Link className="secondary" href={`/templates/new?from=${encodeURIComponent(c.template_id)}`}>
                  Copy
                </Link>
              ) : null}
            </div>
          </section>
        );
      })}
    </>
  );
}
