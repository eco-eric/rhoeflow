"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project, Property } from "@rhoeflow/jobstore";
import { collectFields } from "@rhoeflow/schema";
import { CALC_INPUT_VERSION, ENGINE_NAME, ENGINE_VERSION, WEATHER_LIBRARY, prepareInput, runCalculation, type CalcOutput } from "@rhoeflow/calc";
import {
  QUICK_PASS_QUESTIONS,
  buildQuickPass,
  emptyQuickPassAnswers,
  getTemplate,
  sanityBandCheck,
  suggestFrom,
  type Template,
  type QuestionInfo,
  type QuestionKey,
  type QuickPassAnswers,
  type QuickPassResult,
} from "@rhoeflow/templates";
import { api, apiText, ApiError } from "../../../lib/api-client";
import { readCached, writeCached } from "../../../lib/cache";
import { QuestionCard, isShown, type AnswerValue } from "./questions";

/**
 * The field app for one WorkEdge project (WO-03 Track D: D1, D2, D3, D5, D6, D7, D8).
 * ADR-027: the job is set once and shown in a persistent bar with "Wrong project?"; the job
 * opens on a task overview; sections can be done in any order; the system states are named,
 * never collapsed into one check. ADR-003: no AI anywhere; the manual path is the only path.
 */

interface AssessmentRow {
  assessment_id: string;
  workedge_team_id: string;
  workedge_project_id: string;
  workedge_property_id: string;
  revision: number;
  draft: Record<string, unknown> | null;
  draft_version: number;
  template_id: string | null;
  template_version: string | null;
  created_at: string;
  updated_at: string;
}

interface RunRow {
  run_id: string;
  revision: number;
  status: string;
  stale: boolean;
  stale_reason: string | null;
  requested_at: string;
  engine_version: string;
  input_hash: string | null;
  totals: { heating_sensible: number; cooling_sensible: number; cooling_latent: number } | null;
  warnings: { code: string; message: string }[];
  errors: { code: string; message: string }[];
}

type View = "overview" | QuestionInfo["section"] | "template" | "review" | "results";
type SaveState = "loading" | "saved" | "saving" | "unsaved" | "offline" | "conflict" | "error";

const SECTIONS: { key: QuestionInfo["section"]; label: string }[] = [
  { key: "home", label: "Home and age" },
  { key: "size", label: "Size and layout" },
  { key: "orientation", label: "Orientation and foundation" },
  { key: "windows", label: "Windows" },
  { key: "attic", label: "Attic" },
  { key: "ducts", label: "System and ducts" },
  { key: "tightness", label: "Tightness" },
];

const QP = "x_quick_pass";
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export function FieldApp({ project, property }: { project: Project; property: Property | null }) {
  const [row, setRow] = useState<AssessmentRow | null>(null);
  const [answers, setAnswers] = useState<QuickPassAnswers>(emptyQuickPassAnswers());
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [view, setView] = useState<View>("overview");
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [runDetail, setRunDetail] = useState<{ output: CalcOutput; frozen: { assessment: unknown; checks?: { sanity_band?: { low_ft2_per_ton: number; high_ft2_per_ton: number; source: string } } } } | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "warn" | "ok"; text: string; issues?: { path?: string; message: string }[] } | null>(null);
  const [wrongProject, setWrongProject] = useState(false);
  const [preview, setPreview] = useState<CalcOutput | null>(null);
  const pendingRunKey = useRef<string | null>(null);
  /** The templates a tech can pick now: the team's stored current versions, or the repo set (C7, D9). */
  const [catalog, setCatalog] = useState<Map<string, { version: string | null; payload: Template }> | null>(null);
  /** Payloads of older stored versions this job is pinned to, fetched on demand. */
  const [pinnedPayloads, setPinnedPayloads] = useState<Record<string, Template>>({});
  /** Set when the tech takes a newer template version: the next save sends the template again. */
  const adoptTemplate = useRef(false);
  const [adopting, setAdopting] = useState(false);
  const rowRef = useRef<AssessmentRow | null>(null);
  rowRef.current = row;

  // ---------------------------------------------------------------- load: create or resume (C2)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ assessment: AssessmentRow; resumed: boolean }>("/api/assessments", {
          method: "POST",
          body: { workedge: { project_id: project.id, property_id: project.property_id ?? property?.id ?? "" } },
        });
        if (cancelled) return;
        const a = res.assessment;
        setRow(a);
        let ans = (a.draft?.[QP] as QuickPassAnswers | undefined) ?? emptyQuickPassAnswers();
        let tpl = a.template_id;
        let isDirty = false;
        const cached = await readCached(a.assessment_id);
        if (cached?.dirty) {
          if (cached.base_draft_version === a.draft_version) {
            ans = cached.answers;
            tpl = cached.template_id;
            isDirty = true;
          } else {
            setSaveState("conflict");
            setMessage({ kind: "warn", text: "Answers on this phone were not saved and the job changed on the server since. Your unsaved answers are kept below the server's; choose which to keep." });
          }
        }
        pendingRunKey.current = cached?.pending_run_key ?? null;
        // WorkEdge property facts become documented answers when the tech has not answered (ADR-028: cited, not copied).
        if (property) {
          if (!ans.year_built && property.year_built) {
            ans = { ...ans, year_built: { value: property.year_built, state: "documented", source: `workedge:property:${property.id}.year_built`, evidence: [] } };
            isDirty = true;
          }
          if (!ans.floor_area && property.conditioned_floor_area_ft2) {
            ans = { ...ans, floor_area: { value: property.conditioned_floor_area_ft2, state: "documented", source: `workedge:property:${property.id}.conditioned_floor_area_ft2`, evidence: [] } };
            isDirty = true;
          }
        }
        setAnswers(ans);
        setTemplateId(tpl);
        setDirty(isDirty);
        setSaveState((s) => (s === "conflict" ? s : isDirty ? "unsaved" : "saved"));
        const [r, cat] = await Promise.all([
          api<{ runs: RunRow[] }>(`/api/assessments/${a.assessment_id}/runs`),
          api<{ current: { template_id: string; version: string | null; payload: Template }[] }>("/api/templates"),
        ]);
        if (cancelled) return;
        setRuns(r.runs);
        setCatalog(new Map(cat.current.map((c) => [c.template_id, { version: c.version, payload: c.payload }])));
      } catch (e) {
        if (cancelled) return;
        setSaveState(e instanceof ApiError && e.offline ? "offline" : "error");
        setMessage({ kind: "error", text: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, project.property_id, property]);

  // ---------------------------------------------------------------- the template this job uses
  // A saved pick is pinned to its version (null = the repo copy); an unsaved pick takes the current
  // stored version, which is what the server resolves on save. The preview always builds from the
  // same payload the server will freeze.
  const savedPick = !!row && templateId !== null && row.template_id === templateId && !adopting;
  const pinned = useMemo((): { payload: Template; version: string | null } | null => {
    if (!templateId || !catalog) return null;
    const cur = catalog.get(templateId);
    if (!savedPick) return cur ? { payload: cur.payload, version: cur.version } : null;
    const v = row!.template_version;
    if (v === null) {
      try {
        return { payload: getTemplate(templateId), version: null };
      } catch {
        return null;
      }
    }
    if (cur && cur.version === v) return { payload: cur.payload, version: v };
    const old = pinnedPayloads[`${templateId}@${v}`];
    return old ? { payload: old, version: v } : null;
  }, [templateId, catalog, savedPick, row, pinnedPayloads]);
  useEffect(() => {
    const v = row?.template_version;
    if (!savedPick || !templateId || !v || !catalog || catalog.get(templateId)?.version === v || pinnedPayloads[`${templateId}@${v}`]) return;
    void api<{ versions: { version: number; payload: Template }[] }>(`/api/templates/${encodeURIComponent(templateId)}`).then((d) => {
      const hit = d.versions.find((x) => `v${x.version}` === v);
      if (hit) setPinnedPayloads((p) => ({ ...p, [`${templateId}@${v}`]: hit.payload }));
    });
  }, [savedPick, templateId, row?.template_version, catalog, pinnedPayloads]);
  const newer = savedPick && pinned && catalog?.get(templateId!) && catalog.get(templateId!)!.version !== pinned.version ? catalog.get(templateId!)! : null;
  const takeNewer = () => {
    adoptTemplate.current = true;
    setAdopting(true);
    dirtyRef.current = true;
    setDirty(true);
  };

  // ---------------------------------------------------------------- local build (preview, never a run)
  const result: QuickPassResult | null = useMemo(() => {
    if (!row || !templateId || !pinned) return null;
    try {
      return buildQuickPass(answers, {
        template: pinned.payload,
        template_version: pinned.version,
        assessment_id: row.assessment_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        workedge: { team_id: row.workedge_team_id, project_id: row.workedge_project_id, property_id: row.workedge_property_id },
      });
    } catch (e) {
      return { method: { id: "RHOE.quick_pass.box_geometry", version: "0.1.0" }, assessment: null, issues: [{ question: null, severity: "error", code: "build_failed", message: e instanceof Error ? e.message : String(e) }], status: {} as QuickPassResult["status"], fields: {} } as QuickPassResult;
    }
  }, [answers, templateId, row, pinned]);
  const noTemplateResult = useMemo(() => {
    // Without a template the status per question still shows; required checks still apply.
    if (templateId || !row) return null;
    return buildQuickPass(answers, {
      template: getTemplate("dfw-pre1980-ranch-slab"),
      template_version: null,
      assessment_id: row.assessment_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      workedge: { team_id: row.workedge_team_id, project_id: row.workedge_project_id, property_id: row.workedge_property_id },
    });
  }, [answers, templateId, row]);
  const shown = result ?? noTemplateResult;

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    if (!result?.assessment || !templateId || !pinned) return;
    const band = sanityBandCheck(pinned.payload, pinned.version ?? undefined);
    const p = prepareInput({
      calc_input_version: CALC_INPUT_VERSION,
      requested_engine: { name: ENGINE_NAME, version: ENGINE_VERSION },
      method_ids: [],
      weather: { library: WEATHER_LIBRARY.name, version: WEATHER_LIBRARY.version, station_key: result.assessment.building.climate_and_risk_zones.weather_station.station_key.value ?? "" },
      scenario: { id: "baseline", name: "Baseline", overrides: [] },
      assessment: result.assessment,
      ...(band ? { checks: { sanity_band: band } } : {}),
    });
    if (!p.ok) return;
    void runCalculation(p.input).then((o) => {
      if (!cancelled) setPreview(o);
    });
    return () => {
      cancelled = true;
    };
  }, [result, templateId, pinned]);

  // ---------------------------------------------------------------- save: cache first, then server (D8, C2)
  // Saves are queued: the debounced auto-save and the Run button never send two drafts with the
  // same expected version, so a 412 always means another device, never this one.
  const latest = useRef({ answers, templateId });
  latest.current = { answers, templateId };
  /** Set synchronously on every edit and cleared only by a save that sent exactly those answers. */
  const dirtyRef = useRef(false);
  const inFlight = useRef<Promise<AssessmentRow | null> | null>(null);
  const autoSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveOnce = useCallback(async (): Promise<AssessmentRow | null> => {
    const r = rowRef.current;
    if (!r) return null;
    const { answers: ans, templateId: tpl } = latest.current;
    setSaveState("saving");
    try {
      const draft = { ...(r.draft ?? {}), assessment_id: r.assessment_id, workedge: (r.draft?.["workedge"] as object) ?? { team_id: r.workedge_team_id, project_id: r.workedge_project_id, property_id: r.workedge_property_id }, [QP]: ans };
      const next = await api<AssessmentRow>(`/api/assessments/${r.assessment_id}`, {
        method: "PUT",
        body: { draft, expected_draft_version: r.draft_version, ...(tpl && (tpl !== r.template_id || adoptTemplate.current) ? { template_id: tpl } : {}) },
      });
      adoptTemplate.current = false;
      setAdopting(false);
      rowRef.current = next;
      setRow(next);
      const stillDirty = latest.current.answers !== ans || latest.current.templateId !== tpl;
      dirtyRef.current = stillDirty;
      setDirty(stillDirty);
      setSaveState(stillDirty ? "unsaved" : "saved");
      await writeCached({ assessment_id: next.assessment_id, answers: ans, template_id: tpl, base_draft_version: next.draft_version, dirty: stillDirty, pending_run_key: pendingRunKey.current, updated_at: new Date().toISOString() });
      return next;
    } catch (e) {
      if (e instanceof ApiError && e.status === 412) {
        setSaveState("conflict");
        setMessage({ kind: "warn", text: "This job was changed on another device. Your answers are still on this phone; reload to see the other version, or keep yours." });
      } else setSaveState(e instanceof ApiError && e.offline ? "offline" : "error");
      return null;
    }
  }, []);
  const save = useCallback(async (): Promise<AssessmentRow | null> => {
    while (inFlight.current) await inFlight.current;
    const p = saveOnce();
    inFlight.current = p;
    try {
      return await p;
    } finally {
      inFlight.current = null;
    }
  }, [saveOnce]);

  useEffect(() => {
    if (!row || !dirty) return;
    void writeCached({ assessment_id: row.assessment_id, answers, template_id: templateId, base_draft_version: row.draft_version, dirty: true, pending_run_key: pendingRunKey.current, updated_at: new Date().toISOString() });
    if (saveState === "conflict") return;
    setSaveState("unsaved");
    autoSave.current = setTimeout(() => void save(), 800);
    return () => {
      if (autoSave.current) clearTimeout(autoSave.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, templateId, dirty]);

  const keepMine = async () => {
    const r = rowRef.current;
    if (!r) return;
    const fresh = await api<AssessmentRow>(`/api/assessments/${r.assessment_id}`);
    setRow(fresh);
    rowRef.current = fresh;
    setSaveState("unsaved");
    setMessage(null);
    await save();
  };

  const setAnswer = (k: QuestionKey, a: AnswerValue) => {
    setAnswers((prev) => {
      const next = { ...prev } as Record<string, unknown>;
      if (a === undefined) delete next[k];
      else next[k] = a;
      return next as QuickPassAnswers;
    });
    dirtyRef.current = true;
    setDirty(true);
  };

  // ---------------------------------------------------------------- run (C3): accept, then frozen run
  const latestRun = runs.length > 0 ? runs[runs.length - 1]! : null;
  const loadRunDetail = useCallback(async (run: RunRow) => {
    if (run.status !== "ok") return setRunDetail(null);
    const [o, f] = await Promise.all([apiText(`/api/runs/${run.run_id}/artifacts/output.json`), apiText(`/api/runs/${run.run_id}/artifacts/frozen-input.json`)]);
    setRunDetail({ output: JSON.parse(o) as CalcOutput, frozen: JSON.parse(f) });
  }, []);
  useEffect(() => {
    if (latestRun && !runDetail) void loadRunDetail(latestRun);
  }, [latestRun, runDetail, loadRunDetail]);

  const run = async () => {
    setRunning(true);
    setMessage(null);
    try {
      // Flush: no auto-save may land between this save and the accept below.
      if (autoSave.current) clearTimeout(autoSave.current);
      while (inFlight.current) await inFlight.current;
      for (let i = 0; dirtyRef.current && i < 3; i++) await save();
      const r = rowRef.current;
      if (!r || dirtyRef.current) throw new Error("the answers could not be saved; check the signal and try again");
      const acc = await api<{ assessment: AssessmentRow; unchanged: boolean }>(`/api/assessments/${r.assessment_id}/accept`, { method: "POST", body: { expected_draft_version: r.draft_version } });
      rowRef.current = acc.assessment;
      setRow(acc.assessment);
      pendingRunKey.current ??= globalThis.crypto.randomUUID();
      await writeCached({ assessment_id: r.assessment_id, answers, template_id: templateId, base_draft_version: acc.assessment.draft_version, dirty: false, pending_run_key: pendingRunKey.current, updated_at: new Date().toISOString() });
      const created = await api<RunRow>(`/api/assessments/${r.assessment_id}/runs`, { method: "POST", body: { idempotency_key: pendingRunKey.current } });
      pendingRunKey.current = null;
      await writeCached({ assessment_id: r.assessment_id, answers, template_id: templateId, base_draft_version: acc.assessment.draft_version, dirty: false, pending_run_key: null, updated_at: new Date().toISOString() });
      const list = await api<{ runs: RunRow[] }>(`/api/assessments/${r.assessment_id}/runs`);
      setRuns(list.runs);
      setRunDetail(null);
      await loadRunDetail(created);
      setView("results");
    } catch (e) {
      const issues = e instanceof ApiError ? ((e.details?.["issues"] as { path?: string; message: string }[] | undefined) ?? []) : [];
      setMessage({ kind: "error", text: e instanceof ApiError && e.offline ? "No signal: the answers are saved on this phone. Run again when you are back online." : e instanceof Error ? e.message : String(e), issues });
      setView("review");
    } finally {
      setRunning(false);
    }
  };

  // ---------------------------------------------------------------- system state (ADR-027: named, not collapsed)
  const errors = shown?.issues.filter((i) => i.severity === "error") ?? [];
  const missingRequired = QUICK_PASS_QUESTIONS.filter((q) => q.required && shown?.status[q.key] !== "answered");
  const runIsCurrent = !!latestRun && latestRun.status === "ok" && !latestRun.stale && !dirty && latestRun.revision === row?.revision;
  const state: { label: string; tone: "ok" | "warn" | "error" } = running
    ? { label: "Running", tone: "warn" }
    : missingRequired.length > 0
      ? { label: `Needs answers (${missingRequired.length} required)`, tone: "error" }
      : !templateId
        ? { label: "Pick the era template", tone: "error" }
        : errors.length > 0
          ? { label: "Has problems to fix", tone: "error" }
          : runIsCurrent
            ? { label: "Run is current", tone: "ok" }
            : latestRun
              ? { label: "Run is out of date: run again", tone: "warn" }
              : { label: "Ready to run", tone: "ok" };
  const SAVE_WORDS: Record<SaveState, string> = { loading: "Loading", saved: "Saved", saving: "Saving", unsaved: "Saved on this phone", offline: "Offline: saved on this phone", conflict: "Changed elsewhere", error: "Not saved" };

  const year = answers.year_built && "value" in answers.year_built ? (answers.year_built.value as number) : null;
  const stories = answers.stories && "value" in answers.stories ? (answers.stories.value as number) : undefined;
  const suggestions = year && catalog ? suggestFrom([...catalog.values()].map((c) => c.payload), year, stories) : [];

  // ---------------------------------------------------------------- render
  const address = property ? `${property.address.line1}, ${property.address.city}` : "No property on this project";
  return (
    <>
      <header className="bar">
        <div className="inner">
          <div className="job">
            <strong>{project.name}</strong>
            <span>{address}</span>
          </div>
          <button type="button" className="linkish" onClick={() => setWrongProject((v) => !v)}>
            Wrong project?
          </button>
        </div>
        {wrongProject ? (
          <div className="inner" style={{ display: "block", paddingTop: 8 }}>
            <p className="muted" style={{ margin: 0 }}>
              This assessment belongs to WorkEdge project {project.id}. To work on a different job, open that job in WorkEdge and tap Assessment there. Nothing here moves to another job.
            </p>
          </div>
        ) : null}
      </header>
      <main className="wrap">
        {!row ? (
          <p className="muted" role="status" style={{ marginTop: 24 }}>
            {saveState === "loading" ? "Opening the job…" : "This job could not be opened."}
          </p>
        ) : null}
        <div className="status" aria-live="polite">
          <span className={`pill ${state.tone}`}>{state.label}</span>
          <span className="pill">{SAVE_WORDS[saveState]}</span>
          {row ? <span className="muted" style={{ fontSize: 13 }}>Revision {row.revision}</span> : null}
        </div>
        {message ? (
          <div className={`issue ${message.kind === "error" ? "error" : ""}`} role="alert">
            {message.text}
            {message.issues?.map((i) => (
              <div key={(i.path ?? "") + i.message} className="source">
                {i.path ? `${i.path}: ` : ""}
                {i.message}
              </div>
            ))}
            {saveState === "conflict" ? (
              <div className="row" style={{ marginTop: 8 }}>
                <button type="button" className="secondary" onClick={() => void keepMine()}>
                  Keep my answers
                </button>
                <button type="button" className="secondary" onClick={() => location.reload()}>
                  Load the other version
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {view !== "overview" ? (
          <button type="button" className="linkish" onClick={() => setView("overview")}>
            ← Task overview
          </button>
        ) : null}

        {row && view === "overview" ? (
          <>
            <h1>Quick pass</h1>
            {newer ? (
              <div className="issue" role="status">
                Template {templateId} has a newer version, {newer.version}. This job uses {pinned?.version ?? "the repo copy"}.{" "}
                <button type="button" className="linkish" onClick={takeNewer}>
                  Use {newer.version}
                </button>
              </div>
            ) : null}
            <button type="button" className="task" onClick={() => setView("template")}>
              <span>
                Era template
                <small>{templateId ? `${pinned?.payload.name ?? templateId} (${pinned?.version ?? "repo copy"})` : year ? "Pick one: suggested from year built and stories" : "Answer year built first"}</small>
              </span>
              <span className={`pill ${templateId ? "ok" : "error"}`}>{templateId ? "Picked" : "Needed"}</span>
            </button>
            {SECTIONS.map((s) => {
              const qs = QUICK_PASS_QUESTIONS.filter((q) => q.section === s.key && isShown(q.key, answers));
              const answered = qs.filter((q) => shown?.status[q.key] === "answered").length;
              const unknown = qs.filter((q) => shown?.status[q.key] === "didnt_inspect" || shown?.status[q.key] === "inspected_cant_tell").length;
              const req = qs.filter((q) => q.required && shown?.status[q.key] !== "answered").length;
              const errs = shown?.issues.filter((i) => i.severity === "error" && qs.some((q) => q.key === i.question)).length ?? 0;
              return (
                <button type="button" key={s.key} className="task" onClick={() => setView(s.key)}>
                  <span>
                    {s.label}
                    <small>
                      {answered} of {qs.length} answered{unknown ? `, ${unknown} unknown` : ""}
                      {qs.length - answered - unknown > 0 ? `, ${qs.length - answered - unknown} using defaults` : ""}
                    </small>
                  </span>
                  <span className={`pill ${req || errs ? "error" : answered === qs.length ? "ok" : ""}`}>{req ? `${req} required` : errs ? "Fix" : answered === qs.length ? "Done" : "Defaults"}</span>
                </button>
              );
            })}
            <button type="button" className="task" onClick={() => setView("review")}>
              <span>
                Review and run
                <small>{errors.length ? `${errors.length} problems` : (shown?.issues.length ?? 0) > 0 ? `${shown!.issues.length} warnings` : "Nothing blocking"}</small>
              </span>
              <span className={`pill ${state.tone}`}>{state.label}</span>
            </button>
            <button type="button" className="task" onClick={() => setView("results")} disabled={!latestRun}>
              <span>
                Results
                <small>{latestRun ? `Last run ${new Date(latestRun.requested_at).toLocaleString()}` : "No run yet"}</small>
              </span>
              {latestRun ? <span className={`pill ${runIsCurrent ? "ok" : "warn"}`}>{runIsCurrent ? "Current" : "Out of date"}</span> : null}
            </button>
            {preview?.results.building ? <PreviewCard preview={preview} cfa={result?.assessment?.building.building_construction.conditioned_floor_area.value ?? null} /> : null}
          </>
        ) : null}

        {view === "template" ? (
          <section className="panel">
            <h2>Era template</h2>
            <p className="muted">The template supplies every default the quick pass does not ask about. Suggested from year built and stories; you pick (nothing is applied automatically).</p>
            {!year ? <p>Answer year built first.</p> : null}
            {suggestions.map((t) => (
              <button
                type="button"
                key={t.template_id}
                className="task"
                aria-pressed={t.template_id === templateId}
                onClick={() => {
                  setTemplateId(t.template_id);
                  dirtyRef.current = true;
                  setDirty(true);
                  setView("overview");
                }}
              >
                <span>
                  {t.name}
                  <small>
                    {t.era.year_from ?? "before"}–{t.era.year_to ?? "now"}, {t.style.stories} {t.style.stories === 1 ? "story" : "stories"}, {t.style.foundation}
                  </small>
                </span>
                <span className={`pill ${t.template_id === templateId ? "ok" : ""}`}>{t.template_id === templateId ? "Picked" : "Use"}</span>
              </button>
            ))}
            {year && suggestions.length === 0 ? <p className="issue">No template covers {year}. Check the year.</p> : null}
          </section>
        ) : null}

        {SECTIONS.some((s) => s.key === view)
          ? QUICK_PASS_QUESTIONS.filter((q) => q.section === view && isShown(q.key, answers)).map((q) => (
              <QuestionCard key={q.key} q={q} answer={answers[q.key] as AnswerValue} result={shown} onChange={(a) => setAnswer(q.key, a)} />
            ))
          : null}

        {view === "review" ? (
          <section className="panel">
            <h2>Review and run</h2>
            {missingRequired.map((q) => (
              <div key={q.key} className="issue error">
                Q{q.number} {q.label} is required.{" "}
                <button type="button" className="linkish" onClick={() => setView(q.section)}>
                  Answer it
                </button>
              </div>
            ))}
            {!templateId ? (
              <div className="issue error">
                Pick the era template.{" "}
                <button type="button" className="linkish" onClick={() => setView("template")}>
                  Pick
                </button>
              </div>
            ) : null}
            {(result?.issues ?? []).filter((i) => i.code !== "required").map((i) => (
              <div key={i.code + i.message} className={`issue ${i.severity}`}>
                {i.message}
                {i.question ? (
                  <>
                    {" "}
                    <button type="button" className="linkish" onClick={() => setView(QUICK_PASS_QUESTIONS.find((q) => q.key === i.question)!.section)}>
                      Go to the question
                    </button>
                  </>
                ) : null}
              </div>
            ))}
            {result?.assessment ? <AssumptionSummary assessment={result.assessment} /> : null}
            <button type="button" className="primary" disabled={running || state.tone === "error" || !result?.assessment} onClick={() => void run()}>
              {running ? "Running…" : runIsCurrent ? "Run again" : "Run the load"}
            </button>
            <p className="muted" style={{ fontSize: 14 }}>
              A run freezes these answers as a revision. Changing an answer afterwards marks the run out of date; it is never overwritten.
            </p>
          </section>
        ) : null}

        {view === "results" ? <Results run={latestRun} detail={runDetail} current={runIsCurrent} template={templateId} /> : null}
      </main>
    </>
  );
}

function PreviewCard({ preview, cfa }: { preview: CalcOutput; cfa: number | null }) {
  const b = preview.results.building!;
  const total = b.cooling_sensible + b.cooling_latent;
  return (
    <section className="panel preview" aria-label="Preview">
      <h2>Preview, not a run</h2>
      <p className="muted" style={{ marginTop: 0 }}>Computed on this phone from the current answers. Only a run is saved and can go on a report.</p>
      <div className="grid">
        <div className="metric">
          <span>Heating</span>
          {fmt(b.heating_sensible)} Btu/h
        </div>
        <div className="metric">
          <span>Cooling total</span>
          {fmt(total)} Btu/h
        </div>
        {cfa ? (
          <div className="metric">
            <span>ft² per ton</span>
            {fmt(cfa / (total / 12000))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

const STATE_ORDER = ["measured", "documented", "assumed", "derived", "defaulted"] as const;

function AssumptionSummary({ assessment }: { assessment: unknown }) {
  const fields = collectFields(assessment);
  const counts = Object.fromEntries(STATE_ORDER.map((s) => [s, fields.filter((f) => f.field.state === s).length]));
  return (
    <div className="status" style={{ margin: "12px 0" }}>
      {STATE_ORDER.map((s) => (
        <span key={s} className={`state ${s}`}>
          {counts[s]} {s}
        </span>
      ))}
    </div>
  );
}

function Results({ run, detail, current, template }: { run: RunRow | null; detail: { output: CalcOutput; frozen: { assessment: unknown; checks?: { sanity_band?: { low_ft2_per_ton: number; high_ft2_per_ton: number; source: string } } } } | null; current: boolean; template: string | null }) {
  const [showAll, setShowAll] = useState(false);
  if (!run) return <p>No run yet.</p>;
  if (run.status !== "ok" || !run.totals) {
    return (
      <section className="panel">
        <h2>The last run did not finish</h2>
        {run.errors.map((e) => (
          <div key={e.code} className="issue error">
            {e.code}: {e.message}
          </div>
        ))}
      </section>
    );
  }
  const t = run.totals;
  const coolTotal = t.cooling_sensible + t.cooling_latent;
  const frozen = detail?.frozen.assessment as { building: { building_construction: { conditioned_floor_area: { value: number } } } } | undefined;
  const cfa = frozen?.building.building_construction.conditioned_floor_area.value ?? null;
  const band = detail?.frozen.checks?.sanity_band;
  const perTon = cfa ? cfa / (coolTotal / 12000) : null;
  const fields = detail ? collectFields(detail.frozen.assessment) : [];
  const byState = (s: string) => fields.filter((f) => f.field.state === s);
  const components = detail?.output.results.components ?? [];
  return (
    <>
      <section className="panel">
        <div className="status" style={{ marginTop: 0 }}>
          <span className={`pill ${current ? "ok" : "warn"}`}>{current ? "Current" : run.stale ? `Out of date: ${run.stale_reason ?? "inputs changed"}` : "Out of date: answers changed since this run"}</span>
          <span className="muted" style={{ fontSize: 13 }}>
            Revision {run.revision}, engine {run.engine_version}
          </span>
        </div>
        <div className="grid">
          <div className="metric">
            <span>Heating</span>
            <div className="big">{fmt(t.heating_sensible)}</div>Btu/h
          </div>
          <div className="metric">
            <span>Cooling sensible</span>
            <div className="big">{fmt(t.cooling_sensible)}</div>Btu/h
          </div>
          <div className="metric">
            <span>Cooling latent</span>
            <div className="big">{fmt(t.cooling_latent)}</div>Btu/h
          </div>
          <div className="metric">
            <span>Cooling total</span>
            <div className="big">{(coolTotal / 12000).toFixed(2)}</div>tons
          </div>
          {cfa ? (
            <>
              <div className="metric">
                <span>ft² per ton</span>
                <div className="big">{fmt(perTon!)}</div>
              </div>
              <div className="metric">
                <span>Btu/h per ft²</span>
                {(t.heating_sensible / cfa).toFixed(1)} heating
                <br />
                {(coolTotal / cfa).toFixed(1)} cooling
              </div>
            </>
          ) : null}
        </div>
        <p className="source">
          {band ? `Template band ${band.low_ft2_per_ton} to ${band.high_ft2_per_ton} ft² per ton (${band.source}).` : `No band on file for template ${template ?? "(none)"}.`}
        </p>
        {run.warnings.map((w) => (
          <div key={w.code + w.message} className="issue">
            {w.message}
          </div>
        ))}
      </section>
      {components.length > 0 ? (
        <section className="panel">
          <h2>Where the load comes from</h2>
          <table>
            <thead>
              <tr>
                <th>Component</th>
                <th>Heating</th>
                <th>Cooling sens.</th>
                <th>Cooling lat.</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr key={c.component_id}>
                  <td>{c.component_id}</td>
                  <td>{c.heating_sensible === null ? "–" : fmt(c.heating_sensible)}</td>
                  <td>{c.cooling_sensible === null ? "–" : fmt(c.cooling_sensible)}</td>
                  <td>{c.cooling_latent === null ? "–" : fmt(c.cooling_latent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {detail ? (
        <section className="panel">
          <h2>Measured versus assumed</h2>
          <AssumptionSummary assessment={detail.frozen.assessment} />
          {(["measured", "documented", "assumed"] as const).map((s) =>
            byState(s).length ? (
              <div key={s}>
                <strong className={`state ${s}`}>{s}</strong>
                <ul>
                  {byState(s).map((f) => (
                    <li key={f.path} className="source">
                      {f.path}: {String(f.field.value)} ({(f.field as { source: string }).source})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          <button type="button" className="linkish" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Hide" : "Show"} defaulted and derived values ({byState("defaulted").length + byState("derived").length})
          </button>
          {showAll ? (
            <ul>
              {[...byState("defaulted"), ...byState("derived")].map((f) => (
                <li key={f.path} className="source">
                  <span className={`state ${f.field.state}`}>{f.field.state}</span> {f.path}: {String(f.field.value)} ({(f.field as { source: string }).source})
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
