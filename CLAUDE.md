# RhoeFlow — rules for every Claude Code session

RhoeFlow (brand RhoeFlow Pro) is TruFicient Energy Solutions' in-house Manual J / S / D block-load, equipment-selection and duct-design app. Owner: Eric Love. Package scope `@rhoeflow/*`; plain `rhoe`/`rhoeflow` in code, stores and URLs.

## Read before writing code
1. `claude/00-start-here.md` — working rules
2. `claude/03-decisions/decision-log.md` — ADR-001 to 033
3. `claude/06-architecture/workedge-integration-standard.md` — what this app owns vs. WorkEdge
4. `claude/01-plan/research-and-plan.md` — tech stack, domain model, phases, gates (skim the Tech stack and Build plan sections at minimum)
5. `claude/02-perplexity-package/Truficient-Requirements-v3.csv` — requirement IDs

## Hard rules
- Work only inside the current authorized work order (`claude/08-build/`). No code outside its scope (GOV-003). Stop and ask before adding a dependency not named in the plan's tech stack.
- Do not reopen Locked or Decided ADRs. If you believe one is wrong, say which ADR and why, then stop.
- Cite the ADR for every architectural choice in your report and in commit messages. Name requirement IDs (e.g. `DAT-001`, `MTH-002`) in commit messages.
- This app owns no job, customer, property, photo-file or user table (ADR-028). Assessments store `workedge_team_id`, `workedge_project_id`, `workedge_property_id` and reference media by WorkEdge media id. Signed URLs are never persisted.
- All WorkEdge access goes through the `JobStore` interface (ADR-031). No direct Supabase/Postgres access to WorkEdge, no shared service-role key.
- Every input value carries a provenance state (measured, documented, assumed, proposed, derived, defaulted, unknown) and a source citation. Unknown is never zero. No invented confidence percentages.
- Every write-back to WorkEdge carries `source: rhoeflow`, `assessment_id`, `run_id`.
- Calculation runs are frozen with inputs, method IDs and engine version; reports render only from frozen runs.
- AI proposes, humans accept, deterministic versioned code calculates. Manual entry must always work with AI disabled.
- Re-derive tables from ASHRAE / IECC / NOAA / OpenStudio-HPXML structure. Never copy ACCA Manual J/S/D tables verbatim.
- TypeScript strict everywhere. `packages/calc` has no DOM or Node dependencies.

## Stack (ADR-013, ADR-004, ADR-008, ADR-016)
pnpm workspaces monorepo · Next.js on Vercel · Supabase (app's own data only) · `packages/calc` pure TypeScript engine with CLI · Vitest golden fixtures · OpenStudio-HPXML pinned as the CI oracle · react-konva (never tldraw) · React Flow schematic view · Puppeteer + @sparticuz/chromium-min for PDFs · Capacitor shells later (ADR-032).

## How to report work
Files changed · requirement IDs touched or closed · commands run · observed results (actual test output, not a description of it) · omissions and anything you could not verify. A screenshot is not evidence that the engineering works.

## Conventions
- Commits: `type(scope): summary [REQ-ID, ADR-NNN]` e.g. `feat(schema): Assessment input provenance types [DAT-003, PRV-001, ADR-024]`
- Method IDs are stable and independent of app version: `MJ8.infiltration.lbl`, `MS2023.cooling_band.variable`, `MD3.friction_rate`.
- Era/template defaults, design conditions and any software-supplied value are tagged `defaulted` with a source string.
- Spike findings go in `claude/09-spikes/`. New ADRs are appended to `claude/03-decisions/decision-log.md` with the next number.
