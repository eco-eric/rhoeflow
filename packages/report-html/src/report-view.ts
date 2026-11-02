import type { Cell, LabeledCell, PrintedValue, ReportModel, Table } from "@rhoeflow/report";
import { html, type Html } from "./html.js";

/**
 * Printable report pages (WO-03 E1; E2 renders the same markup to PDF, ADR-037). Every value comes
 * from the report model, which comes only from the frozen run; this file formats, it does not
 * compute. Customer summary first, then the technical pages a reviewer audits (plan §Reports).
 *
 * The view is a plain escaping template rather than a React component so that the page, the
 * Worker's PDF route and the CI check all produce the same markup from one function: React's
 * `react-dom/server` is not available where Next.js runs route handlers.
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

/** A printed value. Numbers carry their raw value and rounding rule for the printed-equals-run checks. */
function V(v: PrintedValue, unit = true): Html {
  if ("raw" in v) {
    return html`<span class="num" data-raw="${v.raw}" data-rule="${v.rule}">${v.text}${unit && v.unit ? html`<span class="unit"> ${v.unit}</span>` : null}</span>`;
  }
  return html`<span>${v.text}</span>`;
}

function State(c: Cell): Html {
  if (!c.state) return html`<span class="state run">Run result</span>`;
  return html`<span class="state ${c.state}">${STATE_LABEL[c.state] ?? c.state}</span>`;
}

function Rows(rows: LabeledCell[], sources = true): Html {
  return html`<table class="kv"><tbody>${rows.map(
    (r) => html`<tr><th scope="row">${r.label}</th><td>${V(r.value)}</td><td class="prov">${State(r)}${sources && r.source ? html`<div class="src">${r.source}</div>` : null}</td></tr>`,
  )}</tbody></table>`;
}

function ComponentTable(t: Table): Html {
  return html`<section class="block"><h3>${t.title}</h3>${
    t.rows.length === 0
      ? html`<p class="muted">${t.empty ?? "None."}</p>`
      : html`<table class="grid-table"><thead><tr>${t.columns.map((c) => html`<th>${c}</th>`)}</tr></thead><tbody>${t.rows.map(
          (r) =>
            html`<tr><td>${r.id}</td>${r.cells.map((c) => html`<td>${c ? html`${V(c.value, false)}<div class="cell-state">${State(c)}</div>` : "—"}</td>`)}</tr>`,
        )}</tbody></table>`
  }</section>`;
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

const opt = (v: Parameters<typeof V>[0] | null, unit = true): Html | string => (v ? V(v, unit) : "");

/** The report's markup: one `<div class="report">`, without a document around it. */
export function reportBodyHtml(m: ReportModel): string {
  const counts = m.provenance.counts;
  const totals = [m.totals.heating, m.totals.cooling_sensible, m.totals.cooling_latent, m.totals.cooling_total];

  const head = html`<header class="r-head"><div><div class="brand">TruFicient Energy Solutions · RhoeFlow Pro</div><h1>Heating and cooling load report</h1><p class="sub">Whole-house (block) design load</p></div><dl class="run-id"><dt>Run</dt><dd>${m.meta.run_id}</dd><dt>Calculated</dt><dd>${m.meta.run_created_at}</dd><dt>Assessment revision</dt><dd>${m.meta.revision}${m.meta.scenario.id !== "baseline" ? ` · scenario ${m.meta.scenario.name}` : ""}</dd><dt>Engine</dt><dd>${m.meta.engine.name} ${m.meta.engine.version}</dd></dl></header>`;

  const stale = m.meta.stale
    ? html`<div class="banner warn" role="status">This run is out of date${m.meta.stale_reason ? `: ${m.meta.stale_reason}` : ""}. Run the assessment again before issuing a report.</div>`
    : null;

  // ------------------------------------------------------------ customer summary
  const summary = html`<section class="page"><h2>Summary</h2>
<section class="block"><h3>Home</h3>${
    m.home.property_label ? html`<p class="address">${m.home.property_label.text}<span class="src"> (${m.home.property_label.source})</span></p>` : null
  }${Rows(m.home.rows, false)}</section>
<section class="block"><h3>Design loads</h3><div class="totals">${totals.map((c) => html`<div class="total"><span>${c.label}</span><strong>${V(c.value)}</strong></div>`)}<div class="total"><span>${m.totals.cooling_tons.label}</span><strong>${V(m.totals.cooling_tons.value)}</strong></div></div><p class="muted small">Loads are the run's results rounded to whole Btu/h. Tons are the total cooling load divided by 12,000; they are not an equipment size.</p></section>
<section class="block"><h3>Sanity figures</h3>${Rows(m.sanity.rows, false)}${
    m.sanity.band
      ? html`<p class="${m.sanity.band.inside ? "muted small" : "banner warn"}">Era template ${m.sanity.band.template_id} v${m.sanity.band.template_version} expects ${m.sanity.band.low} to ${m.sanity.band.high} ft² per ton (${m.sanity.band.source}). ${
          m.sanity.band.inside ? "This house is inside that band." : "This house is outside that band: check for upgrades or an input mistake."
        }</p>`
      : html`<p class="muted small">No sanity band on file for this house's template.</p>`
  }</section>
<section class="block"><h3>Design conditions</h3>${Rows(
    m.design_conditions.rows.filter((r) => /Outdoor|Indoor|Weather station/.test(r.label)),
    false,
  )}</section>
<section class="block"><h3>What was measured and what was assumed</h3><p>Of ${m.provenance.total} inputs: ${counts.measured} measured, ${counts.documented} from documents or records, ${counts.assumed} chosen by the technician, ${counts.derived} derived from other inputs, and ${counts.defaulted} defaults with a cited source. None is unknown.</p>${
    m.provenance.measured_or_documented.length > 0 ? html`<h4>Measured or documented</h4>${Rows(m.provenance.measured_or_documented)}` : null
  }${m.provenance.assumed.length > 0 ? html`<h4>Chosen by the technician</h4>${Rows(m.provenance.assumed)}` : null}<h4>Defaults, by source</h4><table class="kv"><tbody>${m.provenance.defaulted_by_source.map(
    (g) => html`<tr><th scope="row">${g.source}</th><td>${g.count}</td></tr>`,
  )}</tbody></table></section>
<section class="block excluded"><h3>Not part of this report</h3><ul>${m.excluded.map((x) => html`<li><strong>${x.page}.</strong> ${x.reason}</li>`)}</ul></section>
</section>`;

  // ------------------------------------------------------------ technical pages
  const conditions = html`<section class="page"><h2>Design conditions</h2>${
    !m.design_conditions.recorded ? html`<p class="banner warn">Engine ${m.meta.engine.version} did not record its derived design conditions; only the inputs are shown.</p>` : null
  }${Rows(m.design_conditions.rows)}${
    m.design_conditions.overrides.length > 0
      ? html`<h3>Overrides of the station's values</h3><table class="grid-table"><thead><tr><th>Value</th><th>Station</th><th>Used</th><th>Why</th></tr></thead><tbody>${m.design_conditions.overrides.map(
          (o) => html`<tr><td>${o.label}</td><td>${o.station}</td><td>${o.used}</td><td class="src"><span class="state ${o.state}">${STATE_LABEL[o.state]}</span> ${o.source}</td></tr>`,
        )}</tbody></table>`
      : html`<p class="muted small">No design condition differs from the weather station's values.</p>`
  }</section>`;

  const construction = html`<section class="page"><h2>Construction components</h2>${m.construction.map((t) => ComponentTable(t))}</section>`;

  const worksheet = html`<section class="page"><h2>Load worksheet</h2>${
    !m.worksheet.recorded ? html`<p class="banner warn">Engine ${m.meta.engine.version} did not record component detail (area, U, HTM); only the loads are shown.</p>` : null
  }<table class="grid-table worksheet"><thead><tr><th>Component</th><th>Next to</th><th>Az. (°)</th><th>Area or length</th><th>U or F</th><th>HTM heat</th><th>HTM cool</th><th>Heating (Btu/h)</th><th>Cooling sens. (Btu/h)</th><th>Cooling lat. (Btu/h)</th></tr></thead><tbody>${m.worksheet.rows.map(
    (r) =>
      html`<tr><td>${KIND_LABEL[r.kind] ?? r.kind} <span class="muted">${r.component_id}</span>${r.notes.length ? html`<div class="src">${r.notes.join("; ")}</div>` : null}<div class="src">${r.method_id}</div></td><td>${r.adjacent_to ?? ""}</td><td>${opt(r.azimuth, false)}</td><td>${opt(r.size)}</td><td>${opt(r.conductance, false)}</td><td>${opt(r.htm_heating, false)}</td><td>${opt(r.htm_cooling, false)}</td><td>${V(r.heating, false)}</td><td>${V(r.cooling_sensible, false)}</td><td>${V(r.cooling_latent, false)}</td></tr>`,
  )}</tbody><tfoot><tr><th colspan="7">Total (from the run)</th><th>${V(m.worksheet.totals.heating, false)}</th><th>${V(m.worksheet.totals.cooling_sensible, false)}</th><th>${V(m.worksheet.totals.cooling_latent, false)}</th></tr></tfoot></table><p class="muted small">HTM is the heat transfer multiplier the method used: Btu/h per ft² of net area, or per ft of exposed perimeter for a slab edge. U is in Btu/h·ft²·°F (1 ÷ assembly R; the rated U-factor for windows); F in Btu/h·ft·°F. Each row is rounded on its own, so rows may not add to the total by a few Btu/h; the total is the run's.</p>${
    m.warnings.length > 0 ? html`<h3>Run notes</h3><ul class="src">${m.warnings.map((w) => html`<li>${w.code}: ${w.message}</li>`)}</ul>` : null
  }</section>`;

  const template = m.meta.template ? `${m.meta.template.id}${m.meta.template.version ? ` v${m.meta.template.version}` : " (repository copy)"}` : "none";
  const workedgeLine = m.meta.workedge.project_id ? `project ${m.meta.workedge.project_id}${m.meta.workedge.property_id ? `, property ${m.meta.workedge.property_id}` : ""}` : "not linked";
  const record = html`<section class="page"><h2>Run record</h2><table class="kv"><tbody><tr><th scope="row">Assessment</th><td>${m.meta.assessment_id}, revision ${m.meta.revision}</td></tr><tr><th scope="row">Account</th><td>${m.meta.workedge.team_id}</td></tr><tr><th scope="row">WorkEdge</th><td>${workedgeLine}</td></tr><tr><th scope="row">Scenario</th><td>${m.meta.scenario.name} (${m.meta.scenario.override_count} override${m.meta.scenario.override_count === 1 ? "" : "s"})</td></tr><tr><th scope="row">Template</th><td>${template}</td></tr><tr><th scope="row">Weather</th><td>${m.meta.weather.library} ${m.meta.weather.version}, station ${m.meta.weather.station_key}</td></tr><tr><th scope="row">Engine and output</th><td>${m.meta.engine.name} ${m.meta.engine.version}, output ${m.meta.calc_output_version}</td></tr><tr><th scope="row">Input hash</th><td class="mono">${m.meta.input_hash}</td></tr><tr><th scope="row">Methods</th><td class="mono">${m.meta.method_ids.join(", ")}</td></tr></tbody></table></section>`;

  const inputs = html`<section class="page"><h2>All inputs and where they came from</h2><table class="grid-table inputs"><thead><tr><th>Field</th><th>Value</th><th>State</th><th>Source</th></tr></thead><tbody>${m.inputs.map(
    (c) => html`<tr><td class="mono">${c.path}</td><td>${V(c.value)}</td><td>${State(c)}</td><td class="src">${c.source}</td></tr>`,
  )}</tbody></table></section>`;

  const notices = html`<footer class="page notices"><h2>Notices</h2>${m.notices.map((n) => html`<section class="block" id="notice-${n.id}"><h3>${n.title}</h3><p>${n.text}</p></section>`)}</footer>`;

  return html`<div class="report">${head}${stale}
${summary}
${conditions}
${construction}
${worksheet}
${record}
${inputs}
${notices}
</div>`.value;
}
