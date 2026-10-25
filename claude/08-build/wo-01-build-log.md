# WO-01 build log (Track B)

Environment facts and decisions made while scaffolding, kept so the next session does not
rediscover them. Dates are 2026-10-24 unless noted. Machine: Windows 11 Pro 10.0.26200,
x64, 32 GB; Node 24.14.1; git 2.53.0.

## Environment

- **Repo location.** Cloned to `C:\Users\eric\dev\rhoeflow`, outside OneDrive: pnpm's
  hard-linked store and `node_modules` churn conflict with OneDrive sync. The OneDrive
  project folder holds research only and is not the repo root (owner instruction).
- **pnpm.** `corepack enable` cannot write to `C:\Program Files\nodejs` without elevation
  (EPERM). The shim was installed with
  `corepack enable --install-directory C:\Users\eric\bin pnpm`; `C:\Users\eric\bin` is on
  PATH. pnpm 12.15.0 is pinned via `packageManager`.
  - Incident: `corepack use pnpm@latest` was run once with the OneDrive project folder as
    cwd; it walked up to a pre-existing `C:\Users\eric\package.json` (holding the `supabase`
    CLI), added a `packageManager` field, wrote a `pnpm-lock.yaml` and re-laid out that
    `node_modules`. All three were reverted the same hour: field removed, lockfile deleted,
    the renamed `supabase` folder restored and `npm rebuild supabase` re-created the bin shims.
- **Windows Smart App Control is ON** (`VerifiedAndReputablePolicyState = 1`; WDAC user-mode
  enforcement 2). It blocked `@rolldown/binding-win32-x64-msvc@1.2.15` (Code Integrity
  events 3077/3033: "An Application Control policy has blocked this file"), which Vitest 4
  / Vite 8 need. The wasm fallback (`@rolldown/binding-wasm32-wasi`) loads but cannot
  resolve Windows paths through WASI. Allowed and verified working: esbuild 0.25/0.28
  binary, `@next/swc-win32-x64-msvc@16.4.3`, rollup's win32 binding (Vitest 3 / Vite 7).
  Decision: **Vitest 3.2.7**. No security setting was changed. Owner may choose to
  change Smart App Control; this log only records the fact.
- **pnpm 12 build scripts.** `pnpm.onlyBuiltDependencies` in `package.json` is no longer
  read; the setting is `allowBuilds` in `pnpm-workspace.yaml` (esbuild allowed).
- **OpenStudio / Ruby / Docker / gh CLI**: not installed as of this log. Owner approved the
  official OpenStudio Windows installer for Track A; version and URL go in
  `claude/09-spikes/r01-hpxml-findings.md`.

## Decisions inside WO-01 scope (no new ADRs)

- Workspace package resolution: each package's `exports` maps `types` and `import` to
  `dist/` and `development` to `src/`. Vite/Vitest pick `development`, so tests run against
  source; Node and tsc use `dist/`, so `pnpm build` precedes `typecheck` in CI.
- `packages/calc` has a second tsconfig (`tsconfig.core.json`, no Node types, DOM lib
  only) that compiles everything except `cli.ts`; it is the guard for "no DOM or Node
  dependencies" in the engine core (CLAUDE.md).
- Content hashing uses Web Crypto (`globalThis.crypto.subtle`) so the engine stays free of
  Node imports.
- Rated efficiencies and duct leakage carry their HPXML `Units` as the quantity's own
  unit (`AFUE` / `SEER2` / `cfm25` / `fraction`); the serializer maps `fraction` to
  HPXML `Percent`.
- Templates seed HPXML layer values (`insulation_cavity_r_value`) rather than assembly
  R-values, because nominal-to-assembly is a method (WO-02). Fixtures therefore carry
  placeholder assembly R-values marked `assumed` with a PLACEHOLDER note.
- The template applier never converts units; a slot whose unit the target cannot take
  (cfm25 per 100 ft2 duct leakage) is reported as skipped with the reason.
- `year_built` and `conditioned_floor_area` appear in the Assessment as `documented`
  fields whose source cites `workedge:property:<id>.<field>`. This is the engineering input
  the run was frozen against, with provenance, not a copy of the Property record (ADR-028).
  Flagged for the owner in the WO-01 report.

## Dependencies added (all within the plan's named stack or approved)

| Package | Version | Why | Approval |
| --- | --- | --- | --- |
| typescript | 5.9.3 | Named stack | plan |
| vitest | 3.2.7 | Named stack (pinned to 3.x, see above) | plan |
| zod | ^4.6.7 | Runtime schema validation | owner, Oct 24 |
| @types/node | ^24 | Types for CLI and tests only | type package |
| @supabase/supabase-js | ^2.118.0 | jobstore-local on Supabase Storage | plan (Supabase) |
| next, react, react-dom | 16.4.3 / 19.3.1 | Named stack | plan |
| @types/react, @types/react-dom | ^19.3 | Types for apps/web | type package |

Not added: Turborepo, ESLint/Biome, tsx/tsup, any glob library (the lint walks directories itself).

## Track A (R01), 2026-10-25

- OpenStudio 3.11.0+241b8abb4d installed from the official Windows tar.gz into
  `C:\Users\eric\openstudio-3.11.0` (no elevation; `openstudio.exe` signature valid, NREL). The
  signed `.exe` installer was downloaded and digest-verified but needs UAC, so it was not run.
- OpenStudio-HPXML v1.12.0 extracted to `C:\Users\eric\dev\openstudio-hpxml\v1.12.0`.
- Pins, URLs and digests: `tools/hpxml-oracle/pin.json`. Runner: `run-design-only.mjs`.
- Findings: `claude/09-spikes/r01-hpxml-findings.md`; evidence copied to `claude/09-spikes/r01/runs/`.
- Downloads were kept in the session scratchpad (not in the repo): installer 239 MB, archive
  327 MB, OS-HPXML zip 16 MB.

## Supabase smoke upload, 2026-10-25

`pnpm --filter @rhoeflow/jobstore-local smoke:upload` against the app's own project
(`https://twelymqeeurtdzlxrjcb.supabase.co`, bucket `rhoe-media`, publishable key passed as an
environment variable for the one command, never stored) returned
`{ media_id: "local:b127345b-b79a-4eee-88df-014ca829ea8d", kind: "photo", stored_in: "local" }`,
exit 0. Object path `smoke-team/smoke-project/00000000-0000-4000-8000-000000000000/<uuid>.png`
plus its `.meta.json` sidecar. The upload used a temporary anon insert policy scoped to the
`smoke-team/` prefix that the owner created for this test; it is to be deleted now that the
smoke has passed. The production path will use a signed-in user's token under RLS.
With this, every item in WO-01's definition of done has been executed.

## WO-01 closed, 2026-10-25

Owner confirmed the temporary `smoke-team/` anon insert policy is deleted and closed WO-01.
WO-02 (phase 1 engine port, block load) requires a new bounded work order under GOV-003;
candidate items are in `wo-02-proposed-items.md`.
