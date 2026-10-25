# RhoeFlow — start here

**RhoeFlow** (brand: RhoeFlow Pro; from Greek ῥοή *rhoē* = flow): TruFicient's in-house Manual J / S / D block load, equipment selection and duct design app. Owner: Eric Love. Domains: rhoeflow.pro (primary), rhoeflow.com (redirect). Name and spelling rules: ADR-033. Status (Oct 24, 2026): research and plan complete (v2), WorkEdge integration standard locked, name chosen; first work order WO-01 (R01 OpenStudio-HPXML spike + repo scaffold) filed in `08-build/`.

## Folder map

| Path | What it is |
| --- | --- |
| `claude/00-start-here.md` | This index |
| `claude/01-plan/research-and-plan.md` | The plan, v2: research findings, legal/permit posture, calc engine, input flow, duct tool, reports, domain model and provenance, tech stack, build plan with gates, sources. Editable live copy with the roadmap drawing: https://claude.ai/artifact/87MxJH2zapFXcCD8XLzAqp |
| `claude/02-perplexity-package/` | The Perplexity v3 handoff package as received: master brief, 97-item requirements register (CSV), decision log (CSV), AI handoff prompts, HCD addendum, README. Specification only; contains no code. (Only the requirements CSV is copied into the repo; the rest lives in the Claude Project.) |
| `claude/03-decisions/decision-log.md` | Merged ADR log: the brief's ADR-001 to 014, plan-v2 decisions 015–020, and Oct 24 decisions 021–033 (photo pipeline, templates, portal, usability gates, WorkEdge integration, native shells, product name) |
| `claude/04-design/` | Field-app mockups v1 and the human-centered design review (in the Claude Project; add to the repo when phase 3 starts) |
| `claude/05-research/` | Photo analysis and dimension-capture research (in the Claude Project; add when the photo engine starts) |
| `claude/06-architecture/` | Storage/organization and the WorkEdge integration standard |
| `claude/07-briefs/` | Briefs to send to other projects (WorkEdge integration) |
| `claude/08-build/` | Work orders; WO-01 is the first |
| `claude/09-spikes/` | Spike findings (R01 HPXML findings go here) |

## How the two sources relate

The Perplexity brief supplies governance (requirement IDs, ADRs, method matrix, release gates G0–G9, provenance categories, sizing-vs-prediction duct modes). The Claude plan supplies the research (what is public vs. ACCA's, DFW permit reality, competitor landscape, DFW design data, Manual S 2023 limits, Manual D values, stack decisions with evidence) and the sequence. Plan v2 merges them; the comparison section in the plan explains every point of difference and how it was resolved.

## Working rules for AI sessions in this project

- Call the product RhoeFlow. Code, package scope (`@rhoeflow/*`), stores and URLs use plain `rhoe`/`rhoeflow`; "Rhoē" with the macron appears only in the wordmark.
- Read `01-plan/research-and-plan.md` and `03-decisions/decision-log.md` before proposing architecture. Do not reopen Locked or Decided ADRs without new evidence; say which ADR you are challenging.
- Use the requirements CSV IDs when scoping work; each build phase in the plan names the IDs it closes.
- Do not write app code until a work order is authorized (brief GOV-003). WO-01 is authorized and filed; it starts with R01.
- Report completed work as files changed, requirement IDs, commands run and observed results; a screenshot is not evidence the engineering works.
- Era defaults, design conditions and every other software-supplied value are tagged *defaulted* with a source; unknown is never zero; no invented confidence percentages.

## Next steps

1. Register rhoeflow.pro and rhoeflow.com.
2. Run WO-01: pin an OpenStudio-HPXML release, run design-only on two reference houses, audit defaults and sizing policy, record output granularity; scaffold the repo under `@rhoeflow/*`.
3. Send `07-briefs/brief-to-workedge-integration.md` to the WorkEdge project (with `source: rhoeflow`).
4. Buy Manual J 8th, Manual S 2023, Manual D 3rd.
5. Pick the first 15–25 Mitsubishi pairings for the equipment library.
