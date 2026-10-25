# Kickoff prompt — paste into Claude Code (first session)

Before pasting: create the GitHub repo (suggested: `rhoeflow`), clone it, copy this folder's contents into the repo root (`CLAUDE.md`, `KICKOFF-PROMPT.md`, `claude/`), commit, then open Claude Code in the repo and paste everything below the line.

---

You are starting work on **RhoeFlow**, TruFicient Energy Solutions' in-house Manual J / S / D block-load, equipment-selection and duct-design app. I'm Eric Love, the owner. This repo was just created and contains only the planning docs under `claude/` and a `CLAUDE.md` with standing rules.

**Step 1 — Read before anything else, in this order:** `CLAUDE.md`, `claude/00-start-here.md`, `claude/03-decisions/decision-log.md`, `claude/06-architecture/workedge-integration-standard.md`, `claude/08-build/work-order-01-kickoff.md`, and the "Recommended tech stack", "Domain model, provenance and governance" and "Build plan" sections of `claude/01-plan/research-and-plan.md`. Then tell me in ten lines or fewer what you understand the app to be, what this app owns versus what WorkEdge owns, and what WO-01 asks for. Do not write code yet.

**Step 2 — Confirm the environment.** Report Node, pnpm and git versions, and whether OpenStudio / OpenStudio-HPXML can be installed on this machine (Track A needs the Ruby/OpenStudio CLI runtime). If pnpm is missing, ask before installing it.

**Step 3 — Plan WO-01 Track B as a task list** before building: monorepo scaffold under `@rhoeflow/*`, `packages/schema`, `packages/calc` (types + CLI + fixture format only), `packages/jobstore` with the `JobStore` interface and the two implementations (`jobstore-workedge` stubbed, `jobstore-local` on the app's own Supabase storage), six era/style templates as data, CI (typecheck, schema tests, fixture round-trip, provenance lint). Show me the task list and the proposed folder layout, and wait for my go-ahead.

**Step 4 — Build Track B** once I approve. Work package by package; after each one run the tests and show me actual output. Commit as you go with requirement IDs and ADR numbers in the messages (format in `CLAUDE.md`).

**Step 5 — Track A (R01 spike)** when Track B's scaffold is green or when I say so: pin an OpenStudio-HPXML release (check whether v1.12.0 is still current before pinning), run design-only on two reference houses (1960s DFW ranch, 2010 two-story), audit defaults and autosizing behavior (it defaults to HERS, not ACCA — ADR-005), record output granularity, and write `claude/09-spikes/r01-hpxml-findings.md` with every command run and the numbers observed. Propose the ADR-006 status change in the decision log; I'll approve it.

**Rules that apply the whole time** (full list in `CLAUDE.md`):
- Scope is WO-01 only. No Manual J formulas, no UI beyond a placeholder page, no photo engine, no duct canvas, no live WorkEdge calls. If something looks necessary but is outside WO-01, write it down as a proposed WO-02 item and keep going.
- Do not reopen Locked or Decided ADRs. Cite the ADR for every architectural choice.
- This app has no job, customer, property, photo-file or user table (ADR-028). WorkEdge is the system of record; this app stores WorkEdge ids and talks to it only through `JobStore` (ADR-031).
- Every input field carries `{ value, state, source, evidence }`; unknown is never zero; no confidence percentages.
- Stop and ask before adding any dependency not named in the plan's tech stack.
- Report work as files changed, requirement IDs, commands run, observed results.

Supabase: I'll give you the project URL and anon key when `jobstore-local` needs them — don't create a Supabase project yourself. Vercel: scaffold the Next.js app so it deploys, but don't deploy until I say so.

Start with Step 1.
