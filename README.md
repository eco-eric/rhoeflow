# RhoeFlow

TruFicient Energy Solutions' in-house Manual J / S / D block-load, equipment-selection and
duct-design app (brand: RhoeFlow Pro). Internal tool; independent software, not ACCA-approved.

Rules for every session: [`CLAUDE.md`](CLAUDE.md). Plan, decisions and work orders: [`claude/`](claude/00-start-here.md).

## Layout (WO-01)

| Path | Package | What |
| --- | --- | --- |
| `packages/schema` | `@rhoeflow/schema` | Assessment schema: provenance fields over an HPXML-shaped building model |
| `packages/calc` | `@rhoeflow/calc` | Engine contracts, fixture format, `rhoe-calc` CLI (no formulas yet) |
| `packages/calc/fixtures` | | Golden-case fixtures; `ranch-1960s-dfw` is the first |
| `packages/jobstore` | `@rhoeflow/jobstore` | The `JobStore` interface: the only door to WorkEdge |
| `packages/jobstore-workedge` | `@rhoeflow/jobstore-workedge` | WorkEdge API/MCP implementation (stubbed; documented shapes) |
| `packages/jobstore-local` | `@rhoeflow/jobstore-local` | Interim media store on the app's own Supabase Storage |
| `packages/templates` | `@rhoeflow/templates` | Six DFW era/style templates as data, plus the applier |
| `tools/provenance-lint` | `@rhoeflow/provenance-lint` | Lint: value needs source, unknown needs reason, no confidence keys |
| `apps/web` | `@rhoeflow/web` | Next.js app (placeholder page) |

## Commands

```bash
pnpm install
pnpm build        # tsc for packages, next build for apps/web
pnpm typecheck
pnpm test         # Vitest, all packages
pnpm roundtrip    # every fixture through rhoe-calc validate -> run -> re-validate
pnpm lint         # provenance lint over fixtures and templates
pnpm verify       # typecheck + test + roundtrip + lint (CI runs build first)
```

Node 24 (`.node-version`), pnpm 12 via corepack (`packageManager`). Environment variables: see `.env.example`.
