# Report pages (WO-03 E1)

Requirements: RPT-001 (reports from frozen results, every printed number matching run data under
defined rounding), RPT-002 (customer and technical packages with scope, provenance, limitations,
original branding and the non-approval notice), WTH-001 (design-condition provenance), LIC-002
(required attribution, no endorsement confusion).

The PDF (E2) is the same markup printed by Cloudflare Browser Run; see "PDF" below. Issuing a
report and writing it back to WorkEdge is E3. This page covers what the report shows and where
each value comes from.

## Where the numbers come from

The report reads one thing: a run.

1. **The run row.** The page uses its identity, its status and whether it is stale.
2. **The run's stored `output.json`.** Before reading the file, the page checks its SHA-256
   against the run's artifact record. If the hash doesn't match, the page refuses to render.

Nothing else feeds the numbers:

- **The live assessment, the draft and the template store** are never read.
- **The address line** is read from WorkEdge through the JobStore at render time (ADR-028,
  ADR-031). It is not stored, and the report still renders if WorkEdge is unreachable.

`output.json` carries the frozen input, so every input value printed is the value the run
consumed, with its provenance state and source.

`packages/report` (`buildReport`) turns the run into a typed `ReportModel`. That package is pure
TypeScript with no DOM or Node dependencies. `apps/web/app/r/[runId]` only formats the model.

**What the report itself computes.** Two stated conversions of run totals:

- tons = total cooling load ÷ 12,000;
- three ratios against conditioned floor area: ft² per ton, and Btu/h per ft² for cooling and
  for heating.

Every other figure is a run result or a frozen input.

**Refusals.** A run that is not `ok`, an output from a different run, or an output that doesn't
parse is refused with a stated reason. A stale run renders under a banner saying to run the
assessment again before issuing.

## Engine 0.3.0

The worksheet needs the values each method actually used: net area, U, HTM, CFM and the
derived psychrometrics. Engine 0.2.0 computed these values but did not keep them. Engine 0.3.0
writes them to the output (ADR-015: the version moves when the output changes):

- **Per component:** a `detail` block (`ComponentDetailSchema`).
- **Per run:** `results.design_conditions` (`DesignConditionsResultSchema`), holding the station,
  the design temperatures used, HTD and CTD, grains, pressure and the altitude factor.

No load changes. All 18 fixtures still match the oracle. `packages/calc/test/output-detail.test.ts`
checks that HTM × area (or × perimeter for a slab) reproduces every component's load exactly.

0.3.0 also carries the `MJ8.design_conditions` 0.1.1 fix from E4, which can change a run whose
cooling design temperature was overridden.

**Existing runs.** Runs made on 0.2.0 become stale, because the engine version is part of the
fingerprint. They still render: the output schema accepts 0.2.0. Their report says that engine
did not record the detail, and shows only the loads and the inputs.

## Pages

| Page | Contents | Source |
| --- | --- | --- |
| Summary: home | Address (WorkEdge, at render time); year built, floor area, stories, bedrooms, design occupants, foundation, front azimuth, each with its provenance state | Frozen input |
| Summary: design loads | Heating; cooling sensible, latent and total; tons | Run totals |
| Summary: sanity figures | ft² per ton; Btu/h per ft² for cooling and for heating; the template's band and whether the house is inside it | Run totals ÷ floor area; frozen `checks.sanity_band` |
| Summary: design conditions | Station, outdoor 99 % and 1 % design temperatures, indoor setpoints and RH | Output and frozen input |
| Summary: measured versus assumed | Counts by state; every measured or documented input; every technician choice; defaults grouped by source | Frozen input |
| Summary: not part of this report | Equipment selection (Manual S), room-by-room loads, duct design (Manual D), each labelled with the reason | Fixed text (`EXCLUDED_PAGES`) |
| Design conditions | Station, dataset and version, design-data title, elevation, pressure basis (standard atmosphere at the station elevation), 99 % / 1 % DB, MCWB, daily range, setpoints, RH, HTD, CTD, grains difference; overrides of station values with their state and source | `results.design_conditions` and frozen input (WTH-001) |
| Construction components | Walls, windows, doors, ceilings, floors, roofs, slabs, air leakage, ducts, duct leakage, mechanical ventilation (none recorded); every value with its state | Frozen input |
| Load worksheet | One row per component, giving next-to, azimuth, area or length, U or F, HTM for heating and cooling, and the three loads; notes (CFM, ACH50, occupants, SHGC, duct sides with location, area, effective R and leakage); method id; the run's totals | `results.components[].detail` |
| Run record | Assessment and revision, WorkEdge ids, scenario, template and version, weather pin, engine and output version, input hash, method ids | Output manifest and frozen input |
| All inputs | Every field: path, value, state, source | Frozen input |
| Notices | Independent software, Not an approval, OpenStudio-HPXML | `NOTICES` |

## Rounding rules (RPT-001)

Rounding is half away from zero at the rule's decimals (`packages/report/src/rounding.ts`).

**How the rules are checked.**

- Every printed number keeps its raw value and its rule.
- `packages/report/test/report.test.ts` checks, on all 18 fixtures, that each printed value is
  its raw value under its rule, and that the printed text parses back to it.
- The page carries `data-raw` and `data-rule` on every number. The E1 drive re-applied the rule
  to all 279 numbers on a rendered report and found 0 mismatches.

| Rule | Decimals | Used for |
| --- | --- | --- |
| `btuh` | 0 | Loads (the oracle also reports whole Btu/h) |
| `tons` | 2 | Total cooling ÷ 12,000 |
| `ft2_per_ton` | 0 | Sanity |
| `btuh_per_ft2` | 1 | Sanity |
| `temperature_f`, `temperature_difference_f` | 1 | Design temperatures, setpoints, HTD and CTD |
| `area_ft2`, `length_ft` | 1 | Areas, perimeters |
| `r_value` | 1 | Assembly and nominal R |
| `u_value`, `f_value` | 3 | U and F |
| `shgc` | 2 | SHGC |
| `htm` | 2 | Heat transfer multipliers |
| `azimuth_deg`, `count`, `year`, `elevation_ft`, `percent` | 0 | |
| `grains`, `cfm`, `leakage_cfm` | 1 | |
| `ach50` | 2 | |
| `pressure_psi` | 3 | |
| `factor` | 3 | Dimensionless values without a more specific rule |

The worksheet rounds each row on its own, so the rows can miss the total by a few Btu/h. The page
says so, and its total row prints the run's total.

## Notices (owner to confirm wording)

The three notices in `packages/report/src/notices.ts` are drafts:

- **Independent software:** not produced, licensed or endorsed by ACCA, ASHRAE, DOE or any
  vendor; follows the published structure of Manual J 8th with tables re-derived from public
  sources; does not reproduce ACCA's tables (ADR-001, ADR-020, CLAUDE.md).
- **Not an approval:** not reviewed or approved by ACCA, a building official or a utility; not a
  permit approval or a certification; assumed and defaulted values were not measured.
- **OpenStudio-HPXML:** the attribution recorded in `license-inventory.md`, verbatim.

## Verified

- `packages/report`: 26 tests.
- `packages/calc/test/output-detail.test.ts`: 23 tests.
- Chromium drive against the development memory store and the fixture JobStore:
  1. A quick pass (1964, 1,600 ft², one story, no garage, 3 bedrooms, faces south, pre-1980
     template) was run.
  2. "Open the report" opened `/r/<run id>`.
  3. The totals equal the results screen: 69,284 / 49,346 / 5,151 Btu/h, 4.54 tons.
  4. The worksheet has 15 rows, and its total row is the run's.
  5. All seven sections are present.
  6. All three excluded pages are listed.
  7. All three notices are present.
  8. A malformed id and an unknown run render an error, not a report.
  9. There were no page errors.
  10. Phone, desktop and print-media screenshots were checked by eye.

## PDF (WO-03 E2, ADR-037)

- **One markup for screen and PDF.** `packages/report-html` turns the `ReportModel` into the
  report's HTML (an escaping string template; React's server renderer can't run in a Next route
  handler). The page `/r/<run id>` and the PDF use the same markup and the same stylesheet.
- **The document Browser Run prints** (`renderReportHtml`) is self-contained: the markup, the
  stylesheet and the Geist and Geist Mono fonts embedded as data URLs (SIL OFL 1.1, files in
  `packages/report-html/fonts`). It has no script, link, image or outside URL, and the call
  blocks every outside request type anyway, so nothing is fetched while printing.
- **Page setup** (`reportPdfOptions`): US Letter, half-inch margins, backgrounds printed, a
  footer on every page with "RhoeFlow Pro · run <run id>" and "Page n of N". Table headers and
  total rows print once, not on every page.
- **The route.** `GET /r/<run id>/pdf` loads the run exactly as the page does (hash-checked
  `output.json`, same refusals), refuses a stale run, calls the `pdf` Quick Action through the
  Worker's `BROWSER` binding (`apps/web/wrangler.jsonc`) and returns the PDF as a download named
  "Load Calculation Report - <customer> - <address>.pdf" (owner's request, 2026-11-06; characters
  phones and desktops refuse are dropped, a missing part is left out, and with neither the short
  run id stands in), with its SHA-256 in `x-content-sha256`. The report page has
  a "Download PDF" link (hidden in print, and replaced by a note on a stale run).
- **Printed equals run, on the PDF.** CI prints every fixture's report in a local headless
  Chromium (Puppeteer) with the same document and page setup, reads the text back with pdf.js
  and checks:
  1. the PDF's text is the page's text character for character, once whitespace, list bullets
     and each page's footer are taken off;
  2. every number, in order, appears in the PDF as printed, unit included;
  3. every number in the markup is its raw value under its rounding rule, and every number in
     the report model is printed (also checked without a browser);
  4. the page used the embedded fonts.
  The report-model tests already tie each raw value to the stored run. CI keeps the printed PDFs
  as the `report-pdfs` artifact.

- **Satellite view of the home** (owner's request, 2026-11-06). Under the address in the Summary,
  page and PDF alike: the same north-up picture as the job page's map (ADR-044), 120 m across,
  centred on the job's looked-up point, with a dot on the point and the imagery credit. Esri World
  Imagery tiles when `ARCGIS_API_KEY` is set and every tile comes back, otherwise the USDA NAIP
  image of the same square (`apps/web/lib/report-satellite.ts`). The server fetches the images at
  render time and embeds them as data URLs, so the PDF document still requests nothing from
  outside and the key never leaves the Worker; nothing is stored. `@rhoeflow/report-html` takes
  the picture as images placed in a square and doesn't know the source. With no point, or if
  neither source answers in time, the report prints without the picture.

## Not yet

- **Storing an issued PDF with its SHA-256 and writing it back to WorkEdge:** E3. The E2 route
  renders on demand and keeps nothing.
- **A live check of the first PDF Browser Run prints after deploy:** by hand, once the binding is
  deployed (local `next dev` has no Browser Run).
- **Issuing, report revisions and write-back:** E3.
- **Photo evidence beside each answer:** D4, which waits on the migrations.
- **A permit cover page shaped like ACCA's plan-review form:** the plan names it; not in WO-03.
