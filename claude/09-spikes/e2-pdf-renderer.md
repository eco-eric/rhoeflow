# E2 spike: how the report PDF is rendered (ADR-037)

WO-03 E2 asks for a short comparison before any PDF code: Cloudflare's browser service against
rendering the PDF outside the Worker, judged against ADR-035 (no paid tools beyond the hosting
stack). ADR-036 moved hosting to Cloudflare Workers, so ADR-016 (Puppeteer on a Vercel function)
no longer applies. The outcome is ADR-037 in `03-decisions/decision-log.md`, approved by the
owner on 2026-11-01. Nothing here builds E2.

Sources were read on 2026-11-01 (links at the end). Cloudflare renamed Browser Rendering to
**Browser Run** in April 2026; it is the same product.

## Recommendation

Render the PDF with **Cloudflare Browser Run's `pdf` Quick Action, called from the
`rhoeflow-web` Worker through a `browser` binding**, from HTML the Worker builds itself out of the
same `ReportModel` the `/r/<run id>` page uses. It costs nothing at RhoeFlow's volume on either
Workers plan, needs no API token and no new npm package, and keeps one report design for screen
and paper, which was ADR-016's reason for a browser renderer in the first place.

## What RhoeFlow needs from the renderer

- **One source of numbers.** RPT-001: every printed number equals the frozen run under the
  stated rounding. The E1 page already prints only from `buildReport` (`packages/report`); the PDF
  should print the same model, not a second layout that can drift.
- **A file on the server.** E3 saves the PDF with the run's artifacts and writes it to the WorkEdge
  project (ADR-030); issued reports are immutable. The PDF has to exist server-side, with a hash.
- **Phone path with AI off.** WO-03 §6: a tech goes from a WorkEdge deep link to a saved PDF on a
  phone. One tap, same output on every phone.
- **No paid tool.** ADR-035: nothing beyond the hosting stack, and the hosting stack itself is the
  owner's call.
- **Low volume.** Ten real jobs in E6, then TruFicient's own jobs. Tens of PDFs a month, not
  thousands.

## Cloudflare Browser Run, current terms

| | Workers Free | Workers Paid |
| --- | --- | --- |
| Browser time included | 10 minutes per day | 10 hours per month |
| Beyond that | not available | $0.09 per browser hour |
| Quick Actions rate | 1 request every 10 s | 30 per second |
| Browser timeout | 60 s | 60 s |
| Concurrency (Browser Sessions only) | 3 browsers | 200; 10 averaged included, then $2.00 per browser |

- Quick Actions are billed on browser time only; concurrency charges apply only to Browser
  Sessions (Puppeteer or Playwright).
- From a Worker, `env.BROWSER.quickAction("pdf", { html, pdfOptions, ... })` calls it through a
  `browser` binding, with no API token. It needs `compatibility_date` 2026-03-24 or later;
  `apps/web/wrangler.jsonc` is at 2026-10-20.
- The `pdf` action takes a URL or raw HTML (request body up to 50 MB), `addStyleTag` for CSS or
  fonts, Puppeteer's PDF options (page size, margins, header and footer templates with page
  numbers), and options to block outside requests.

**What that means in money.** A one-run report rendered from HTML is a few seconds of browser
time (an estimate; E2 measures it). On Workers Free, 10 minutes a day is room for well over a
hundred PDFs a day. On Workers Paid, 10 hours a month is room for several thousand. Both are far
past RhoeFlow's volume, so the expected bill for PDFs is $0, and no new account, vendor or
subscription is added. The one thing not checked: which Workers plan the account is on. The
dashboard does not expose it to this session. Either plan works for PDFs.

## Options compared

| | A. Browser Run `pdf` Quick Action (recommended) | B. The phone's own Print to PDF | C. A PDF library inside the Worker | D. A separate rendering service |
| --- | --- | --- | --- | --- |
| How | Worker renders the report HTML from the `ReportModel` and sends it to the `pdf` action through the binding; stores the returned bytes with the run | Tech opens `/r/<run id>` and uses the browser's Print, Save as PDF | `pdf-lib`, `pdfmake` or `@react-pdf/renderer` draws the pages in TypeScript | Gotenberg or headless Chrome on another host, a Supabase Edge Function, or a CI job |
| Cost | $0 at this volume on either Workers plan (see above) | $0 | $0 (MIT packages) | Needs a machine that is always on: paid hosting, Cloudflare Containers (paid plan) or the owner's own computer |
| Same design as the screen | Yes: same model, same CSS | Yes | No: a second layout to keep in step with RPT-001 | Yes if it runs Chrome |
| Server-side file for E3 | Yes | No: the file stays on the phone | Yes | Yes |
| Same output on every phone | Yes: one Chromium renders it | No: Safari and Chrome paginate and fit differently | Yes | Yes |
| New dependency | None (a binding, not a package) | None | One package not in the plan's stack, so the owner must approve it (CLAUDE.md) | A second deploy, a secret and a network hop |
| Worker limits | The browser runs on Cloudflare's side; the Worker only waits, which is not CPU time | n/a | Layout and font work is CPU time in the Worker; Workers Free allows 10 ms per request | n/a |
| Risk | Depends on one Cloudflare service; 60 s timeout per render | Not testable as a file; tech has to work a share sheet | `@react-pdf/renderer` in Workers not verified (Yoga WASM, font loading) | Most moving parts |

**B** stays as a fallback only. The E1 print stylesheet already exists, so a tech can still print
the page if Browser Run is down, but that copy is not an issued report.

**C** is the strongest alternative: no browser at all, deterministic, testable in Vitest. It loses
because it duplicates the report layout (two places to keep every number right), it adds a package
the plan doesn't name, and the layout work counts against Worker CPU limits.

**D** is rejected. Supabase Edge Functions cannot run Chromium (ADR-016 basis), and every other
host is either paid or a machine the owner has to keep running.

**ADR-016 as written** (Puppeteer and `@sparticuz/chromium-min` on a Vercel function) is out with
Vercel (ADR-036).

## How A fits the rules already decided

- **Reads only the frozen run** (RPT-001, CLAUDE.md). The Worker builds the HTML from the same
  hash-checked `output.json` and `buildReport` call as `/r/<run id>`, rendered to static markup
  with `react-dom/server` (already a dependency). The browser is handed HTML, not a URL, so it never
  needs a sign-in cookie and never reads the live assessment.
- **Nothing loaded from outside.** The CSS is inlined and the font is embedded, so the PDF looks
  the same every time and the browser makes no outside requests (the plan's "bundle fonts, no CDN"
  rule); outside requests are blocked in the call.
- **Storage and write-back unchanged.** The PDF and its SHA-256 go with the run's artifacts in
  Supabase Storage (the working copy, ADR-016 next action); E3 sends it to the WorkEdge project with
  `source: rhoeflow`, `assessment_id`, `run_id` (ADR-030). Supabase stays the data store (ADR-036).
- **Printed equals run, on the PDF.** E2's test extracts the text of the PDF with pdf.js (already
  in the plan for blueprints) and checks every printed number against the run under its rounding
  rule, the same check `packages/report` runs on the model. CI has no Cloudflare credentials, so CI
  renders the same HTML with Puppeteer's local Chromium (already the smoke-test tool, WO-03
  decision 10); the live binding is checked once by hand in E2 and in the E5 deployment doc.
- **Step up if needed.** If the Quick Action's options turn out too narrow, the same binding drives
  a Browser Session through `@cloudflare/puppeteer`. That adds a package and concurrency billing, so
  it would come back to the owner first.

## What changes if the owner approves

- `apps/web/wrangler.jsonc` gains `"browser": { "binding": "BROWSER" }`.
- ADR-016's renderer half is replaced by ADR-037; its storage half stays.
- `license-inventory.md`'s planned `@sparticuz/chromium-min` entry is dropped when E2 is built.
- No change to ADR-035: Browser Run is part of the Cloudflare hosting the owner already chose, and
  costs nothing at this volume. On Workers Paid, use past the included 10 hours a month would be
  billed at $0.09 per browser hour; usage shows in the dashboard under Compute, Browser Run. On
  Workers Free there is no overage: renders past 10 minutes a day fail until the next day.

## Not checked

- The account's Workers plan (Free or Paid).
- Actual browser seconds per report and the PDF's look in Browser Run's Chromium. E2 measures both
  on a fixture run before anything is issued.
- Whether `@react-pdf/renderer` runs in Workers today (option C was not chosen, so not tested).

## Sources

- [Browser Run pricing announcement](https://developers.cloudflare.com/changelog/post/2025-07-28-br-pricing/) (included time and prices by plan)
- [Browser Run limits](https://developers.cloudflare.com/browser-run/limits/) (updated 2026-10-14)
- [Browser Run `pdf` Quick Action](https://developers.cloudflare.com/browser-run/quick-actions/pdf-endpoint/) (updated 2026-09-26)
- [Browser Rendering renamed Browser Run](https://developers.cloudflare.com/changelog/post/2026-04-15-br-rename/)
- [Browser Run limits increase, Workers Paid](https://developers.cloudflare.com/changelog/post/2026-08-20-limits-increase/)
- [Browser Run guardrails](https://developers.cloudflare.com/changelog/post/2026-09-14-guardrails/) (blocking outside requests)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (CPU time per request by plan)
- Supabase Edge Functions cannot run Chromium: plan §Tech stack, PDF reports row.
