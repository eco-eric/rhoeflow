import type { Cell, LabeledCell, PrintedValue, ReportModel, Table } from "@rhoeflow/report";

/**
 * Printable report pages (WO-03 E1). Every value on the page comes from the report model, which
 * comes only from the frozen run; this file formats, it does not compute. Customer summary first,
 * then the technical pages a reviewer audits (plan §Reports).
 */

const STATE_LABEL: Record<string, string> = {
  measured: "Measured",
  documented: "Documented",
  assumed: "Assumed",
  derived: "Derived",
  defaulted: "Default",
  proposed: "Proposed",
  unknown: "Unknown",
};

function V({ v, unit = true }: { v: PrintedValue; unit?: boolean }) {
  if ("raw" in v) {
    return (
      <span className="num" data-raw={v.raw} data-rule={v.rule}>
        {v.text}
        {unit && v.unit ? <span className="unit"> {v.unit}</span> : null}
      </span>
    );
  }
  return <span>{v.text}</span>;
}

function State({ c }: { c: Cell }) {
  if (!c.state) return <span className="state run">Run result</span>;
  return <span className={`state ${c.state}`}>{STATE_LABEL[c.state] ?? c.state}</span>;
}

function Rows({ rows, sources = true }: { rows: LabeledCell[]; sources?: boolean }) {
  return (
    <table className="kv">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label + r.path}>
            <th scope="row">{r.label}</th>
            <td>
              <V v={r.value} />
            </td>
            <td className="prov">
              <State c={r} />
              {sources && r.source ? <div className="src">{r.source}</div> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ComponentTable({ t }: { t: Table }) {
  return (
    <section className="block">
      <h3>{t.title}</h3>
      {t.rows.length === 0 ? (
        <p className="muted">{t.empty ?? "None."}</p>
      ) : (
        <table className="grid-table">
          <thead>
            <tr>
              {t.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                {r.cells.map((c, i) => (
                  <td key={i}>
                    {c ? (
                      <>
                        <V v={c.value} unit={false} />
                        <div className="cell-state">
                          <State c={c} />
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const KIND_LABEL: Record<string, string> = {
  wall: "Wall",
  window: "Window",
  door: "Door",
  ceiling: "Ceiling",
  floor: "Floor",
  roof: "Roof",
  slab: "Slab edge",
  infiltration: "Infiltration",
  internal_gain: "Internal gains",
  duct: "Ducts",
  aed_excursion: "Window peak excursion (AED)",
  ventilation: "Ventilation",
  people: "People",
};

export function ReportView({ model: m }: { model: ReportModel }) {
  const counts = m.provenance.counts;
  return (
    <div className="report">
      <header className="r-head">
        <div>
          <div className="brand">TruFicient Energy Solutions · RhoeFlow Pro</div>
          <h1>Heating and cooling load report</h1>
          <p className="sub">Whole-house (block) design load</p>
        </div>
        <dl className="run-id">
          <dt>Run</dt>
          <dd>{m.meta.run_id}</dd>
          <dt>Calculated</dt>
          <dd>{m.meta.run_created_at}</dd>
          <dt>Assessment revision</dt>
          <dd>
            {m.meta.revision}
            {m.meta.scenario.id !== "baseline" ? ` · scenario ${m.meta.scenario.name}` : ""}
          </dd>
          <dt>Engine</dt>
          <dd>
            {m.meta.engine.name} {m.meta.engine.version}
          </dd>
        </dl>
      </header>

      {m.meta.stale ? (
        <div className="banner warn" role="status">
          This run is out of date{m.meta.stale_reason ? `: ${m.meta.stale_reason}` : ""}. Run the assessment again before issuing a report.
        </div>
      ) : null}

      {/* ------------------------------------------------------------ customer summary */}
      <section className="page">
        <h2>Summary</h2>
        <section className="block">
          <h3>Home</h3>
          {m.home.property_label ? (
            <p className="address">
              {m.home.property_label.text}
              <span className="src"> ({m.home.property_label.source})</span>
            </p>
          ) : null}
          <Rows rows={m.home.rows} sources={false} />
        </section>

        <section className="block">
          <h3>Design loads</h3>
          <div className="totals">
            {[m.totals.heating, m.totals.cooling_sensible, m.totals.cooling_latent, m.totals.cooling_total].map((c) => (
              <div className="total" key={c.label}>
                <span>{c.label}</span>
                <strong>
                  <V v={c.value} />
                </strong>
              </div>
            ))}
            <div className="total">
              <span>{m.totals.cooling_tons.label}</span>
              <strong>
                <V v={m.totals.cooling_tons.value} />
              </strong>
            </div>
          </div>
          <p className="muted small">Loads are the run&apos;s results rounded to whole Btu/h. Tons are the total cooling load divided by 12,000; they are not an equipment size.</p>
        </section>

        <section className="block">
          <h3>Sanity figures</h3>
          <Rows rows={m.sanity.rows} sources={false} />
          {m.sanity.band ? (
            <p className={m.sanity.band.inside ? "muted small" : "banner warn"}>
              Era template {m.sanity.band.template_id} v{m.sanity.band.template_version} expects {m.sanity.band.low} to {m.sanity.band.high} ft² per ton ({m.sanity.band.source}).{" "}
              {m.sanity.band.inside ? "This house is inside that band." : "This house is outside that band: check for upgrades or an input mistake."}
            </p>
          ) : (
            <p className="muted small">No sanity band on file for this house&apos;s template.</p>
          )}
        </section>

        <section className="block">
          <h3>Design conditions</h3>
          <Rows rows={m.design_conditions.rows.filter((r) => /Outdoor|Indoor|Weather station/.test(r.label))} sources={false} />
        </section>

        <section className="block">
          <h3>What was measured and what was assumed</h3>
          <p>
            Of {m.provenance.total} inputs: {counts.measured} measured, {counts.documented} from documents or records, {counts.assumed} chosen by the technician, {counts.derived} derived from other inputs, and {counts.defaulted} defaults with a cited source. None is unknown.
          </p>
          {m.provenance.measured_or_documented.length > 0 ? (
            <>
              <h4>Measured or documented</h4>
              <Rows rows={m.provenance.measured_or_documented} />
            </>
          ) : null}
          {m.provenance.assumed.length > 0 ? (
            <>
              <h4>Chosen by the technician</h4>
              <Rows rows={m.provenance.assumed} />
            </>
          ) : null}
          <h4>Defaults, by source</h4>
          <table className="kv">
            <tbody>
              {m.provenance.defaulted_by_source.map((g) => (
                <tr key={g.source}>
                  <th scope="row">{g.source}</th>
                  <td>{g.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="block excluded">
          <h3>Not part of this report</h3>
          <ul>
            {m.excluded.map((x) => (
              <li key={x.page}>
                <strong>{x.page}.</strong> {x.reason}
              </li>
            ))}
          </ul>
        </section>
      </section>

      {/* ------------------------------------------------------------ technical pages */}
      <section className="page">
        <h2>Design conditions</h2>
        {!m.design_conditions.recorded ? <p className="banner warn">Engine {m.meta.engine.version} did not record its derived design conditions; only the inputs are shown.</p> : null}
        <Rows rows={m.design_conditions.rows} />
        {m.design_conditions.overrides.length > 0 ? (
          <>
            <h3>Overrides of the station&apos;s values</h3>
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Value</th>
                  <th>Station</th>
                  <th>Used</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {m.design_conditions.overrides.map((o) => (
                  <tr key={o.label}>
                    <td>{o.label}</td>
                    <td>{o.station}</td>
                    <td>{o.used}</td>
                    <td className="src">
                      <span className={`state ${o.state}`}>{STATE_LABEL[o.state]}</span> {o.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="muted small">No design condition differs from the weather station&apos;s values.</p>
        )}
      </section>

      <section className="page">
        <h2>Construction components</h2>
        {m.construction.map((t) => (
          <ComponentTable key={t.title} t={t} />
        ))}
      </section>

      <section className="page">
        <h2>Load worksheet</h2>
        {!m.worksheet.recorded ? <p className="banner warn">Engine {m.meta.engine.version} did not record component detail (area, U, HTM); only the loads are shown.</p> : null}
        <table className="grid-table worksheet">
          <thead>
            <tr>
              <th>Component</th>
              <th>Next to</th>
              <th>Az. (°)</th>
              <th>Area or length</th>
              <th>U or F</th>
              <th>HTM heat</th>
              <th>HTM cool</th>
              <th>Heating (Btu/h)</th>
              <th>Cooling sens. (Btu/h)</th>
              <th>Cooling lat. (Btu/h)</th>
            </tr>
          </thead>
          <tbody>
            {m.worksheet.rows.map((r) => (
              <tr key={r.component_id}>
                <td>
                  {KIND_LABEL[r.kind] ?? r.kind} <span className="muted">{r.component_id}</span>
                  {r.notes.length ? <div className="src">{r.notes.join("; ")}</div> : null}
                  <div className="src">{r.method_id}</div>
                </td>
                <td>{r.adjacent_to ?? ""}</td>
                <td>{r.azimuth ? <V v={r.azimuth} unit={false} /> : ""}</td>
                <td>{r.size ? <V v={r.size} /> : ""}</td>
                <td>{r.conductance ? <V v={r.conductance} unit={false} /> : ""}</td>
                <td>{r.htm_heating ? <V v={r.htm_heating} unit={false} /> : ""}</td>
                <td>{r.htm_cooling ? <V v={r.htm_cooling} unit={false} /> : ""}</td>
                <td>
                  <V v={r.heating} unit={false} />
                </td>
                <td>
                  <V v={r.cooling_sensible} unit={false} />
                </td>
                <td>
                  <V v={r.cooling_latent} unit={false} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={7}>Total (from the run)</th>
              <th>
                <V v={m.worksheet.totals.heating} unit={false} />
              </th>
              <th>
                <V v={m.worksheet.totals.cooling_sensible} unit={false} />
              </th>
              <th>
                <V v={m.worksheet.totals.cooling_latent} unit={false} />
              </th>
            </tr>
          </tfoot>
        </table>
        <p className="muted small">
          HTM is the heat transfer multiplier the method used: Btu/h per ft² of net area, or per ft of exposed perimeter for a slab edge. U is in Btu/h·ft²·°F (1 ÷ assembly R; the rated U-factor for windows); F in Btu/h·ft·°F. Each row is rounded on its own, so rows may not add to the total by a few Btu/h; the total is the run&apos;s.
        </p>
        {m.warnings.length > 0 ? (
          <>
            <h3>Run notes</h3>
            <ul className="src">
              {m.warnings.map((w) => (
                <li key={w.code + w.message}>
                  {w.code}: {w.message}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="page">
        <h2>Run record</h2>
        <table className="kv">
          <tbody>
            <tr>
              <th scope="row">Assessment</th>
              <td>
                {m.meta.assessment_id}, revision {m.meta.revision}
              </td>
            </tr>
            <tr>
              <th scope="row">WorkEdge</th>
              <td>
                team {m.meta.workedge.team_id}, project {m.meta.workedge.project_id}, property {m.meta.workedge.property_id}
              </td>
            </tr>
            <tr>
              <th scope="row">Scenario</th>
              <td>
                {m.meta.scenario.name} ({m.meta.scenario.override_count} override{m.meta.scenario.override_count === 1 ? "" : "s"})
              </td>
            </tr>
            <tr>
              <th scope="row">Template</th>
              <td>{m.meta.template ? `${m.meta.template.id}${m.meta.template.version ? ` v${m.meta.template.version}` : " (repository copy)"}` : "none"}</td>
            </tr>
            <tr>
              <th scope="row">Weather</th>
              <td>
                {m.meta.weather.library} {m.meta.weather.version}, station {m.meta.weather.station_key}
              </td>
            </tr>
            <tr>
              <th scope="row">Engine and output</th>
              <td>
                {m.meta.engine.name} {m.meta.engine.version}, output {m.meta.calc_output_version}
              </td>
            </tr>
            <tr>
              <th scope="row">Input hash</th>
              <td className="mono">{m.meta.input_hash}</td>
            </tr>
            <tr>
              <th scope="row">Methods</th>
              <td className="mono">{m.meta.method_ids.join(", ")}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="page">
        <h2>All inputs and where they came from</h2>
        <table className="grid-table inputs">
          <thead>
            <tr>
              <th>Field</th>
              <th>Value</th>
              <th>State</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {m.inputs.map((c) => (
              <tr key={c.path}>
                <td className="mono">{c.path}</td>
                <td>
                  <V v={c.value} />
                </td>
                <td>
                  <State c={c} />
                </td>
                <td className="src">{c.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="page notices">
        <h2>Notices</h2>
        {m.notices.map((n) => (
          <section key={n.id} className="block" id={`notice-${n.id}`}>
            <h3>{n.title}</h3>
            <p>{n.text}</p>
          </section>
        ))}
      </footer>
    </div>
  );
}
