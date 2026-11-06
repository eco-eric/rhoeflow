/**
 * The report stylesheet (WO-03 E1, moved here for E2). One stylesheet for the `/r/<run id>` page and
 * the PDF, so screen and paper keep one design (ADR-016's reason for a browser renderer, kept by
 * ADR-037). Light and print-first, independent of the dark field-app theme. The page inlines it;
 * the PDF document (`renderReportHtml`) inlines it with the PDF additions below.
 */
export const REPORT_CSS = `
body:has(.report) { background: #fff; }
.report { --r-ink: #13232b; --r-muted: #5a6d76; --r-line: #d3dde2; --r-band: #f3f7f9; --r-accent: #0f7d68; --r-warn: #9a6200;
  background: #fff; color: var(--r-ink); max-width: 1040px; margin: 0 auto; padding: 24px 24px 64px; font-size: 14px; }
.report h1 { font-size: 24px; margin: 4px 0; }
.report h2 { font-size: 19px; border-bottom: 2px solid var(--r-ink); padding-bottom: 4px; margin: 28px 0 12px; }
.report h3 { font-size: 15px; margin: 18px 0 6px; }
.report h4 { font-size: 14px; margin: 12px 0 4px; }
.report .muted { color: var(--r-muted); }
.report .small { font-size: 12px; }
.report .brand { color: var(--r-accent); font-weight: 700; letter-spacing: 0.02em; }
.report .sub { margin: 0; color: var(--r-muted); }
.r-head { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; border-bottom: 1px solid var(--r-line); padding-bottom: 12px; }
.run-id { display: grid; grid-template-columns: auto auto; gap: 2px 12px; margin: 0; font-size: 12px; }
.run-id dt { color: var(--r-muted); }
.run-id dd { margin: 0; font-family: ui-monospace, monospace; }
.report .banner { border-left: 4px solid var(--r-warn); background: #fff6e5; padding: 8px 12px; margin: 12px 0; }
.report table { width: 100%; border-collapse: collapse; font-size: 13px; }
.report th, .report td { border-bottom: 1px solid var(--r-line); padding: 5px 6px; vertical-align: top; text-align: left; }
.report .kv th { font-weight: 500; width: 40%; }
.report .grid-table thead th { background: var(--r-band); font-weight: 600; }
.report .grid-table td .num, .report .worksheet td:nth-child(n+3) { font-variant-numeric: tabular-nums; }
.report .worksheet td:nth-child(n+3), .report .worksheet th:nth-child(n+3), .report .worksheet tfoot th { text-align: right; }
.report .unit { color: var(--r-muted); font-size: 12px; }
.report .src { color: var(--r-muted); font-size: 11px; word-break: break-word; }
.report .prov { width: 34%; }
.report .mono { font-family: ui-monospace, monospace; font-size: 11px; word-break: break-all; }
.report .state { font-size: 10px; padding: 0 6px; border-radius: 4px; border: 1px solid currentColor; text-transform: uppercase; letter-spacing: 0.04em; }
.report .state.measured, .report .state.documented { color: #0f7d68; }
.report .state.assumed { color: #2b55c6; }
.report .state.defaulted { color: #6a42b8; }
.report .state.derived, .report .state.run { color: var(--r-muted); }
.report .cell-state { margin-top: 2px; }
.report .totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
.report .total { background: var(--r-band); border-radius: 8px; padding: 10px 12px; }
.report .total span { display: block; color: var(--r-muted); font-size: 12px; }
.report .total strong { font-size: 22px; }
.report .excluded { border: 1px dashed var(--r-line); padding: 4px 14px; border-radius: 8px; }
.report .address { font-size: 16px; font-weight: 600; margin: 0 0 6px; }
.report .satellite { margin: 0 0 10px; max-width: 340px; break-inside: avoid; }
.report .satellite svg { display: block; width: 100%; height: auto; aspect-ratio: 1 / 1; border-radius: 6px; border: 1px solid var(--r-line); background: var(--r-line); }
.report .satellite .pin { fill: #e8483b; stroke: #fff; stroke-width: 0.5; }
.report .satellite figcaption { margin-top: 4px; }
.report .notices p { font-size: 12px; }
@media (max-width: 640px) { .report { padding: 12px; } .report .worksheet, .report .inputs { display: block; overflow-x: auto; } }
@media print {
  body { background: #fff; }
  .report { max-width: none; padding: 0; font-size: 11px; }
  .report .page { break-before: page; }
  .report .page:first-of-type { break-before: auto; }
  .report table { font-size: 10px; }
  .report tr { break-inside: avoid; }
}
.report-actions { max-width: 1040px; margin: 0 auto; padding: 16px 24px 0; display: flex; gap: 12px; flex-wrap: wrap; }
.report-actions a { display: inline-block; background: #0f7d68; color: #fff; text-decoration: none; border-radius: 10px; padding: 10px 16px; font-weight: 600; min-height: 44px; }
.report-actions .note { color: #5a6d76; font-size: 13px; align-self: center; }
@media print { .report-actions { display: none; } }
`;

/**
 * What the standalone PDF document adds (ADR-037). The field app's global rules the report relies
 * on are restated here, the embedded fonts are named, and table headers print once instead of
 * repeating on every page, so the PDF's text is exactly the page's text and the printed-equals-run
 * check (test/pdf.test.ts) can compare the two character for character.
 */
export const PDF_DOCUMENT_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; background: #fff; font-family: "Geist", sans-serif; font-size: 16px; line-height: 1.45; }
.report .mono, .run-id dd { font-family: "Geist Mono", monospace; }
.report .grid-table thead, .report .grid-table tfoot { display: table-row-group; }
.report { padding: 0; max-width: none; }
`;
