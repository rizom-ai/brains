# Plan: External dependency review and updates

## Status

Proposed. Trigger: the zod version policy decided in
`npm-package-boundaries.md` (2026-06-10) — the blessed `z` ships as the
workspace zod, and the zod 4 migration is a release blocker for the
first stable `@rizom/brain`. That decision needs a home for sequencing
and mechanics, and the same review surfaced broader drift worth
handling deliberately instead of ad hoc.

## Inventory (root, verified 2026-06-10 via `bun outdated`)

Safe drift (minor/patch, no API changes expected):

| Package                     | Current | Latest  |
| --------------------------- | ------- | ------- |
| `@ai-sdk/anthropic`         | 3.0.58  | 3.0.82  |
| `@ai-sdk/openai`            | 3.0.41  | 3.0.69  |
| `ai`                        | 6.0.116 | 6.0.199 |
| `@modelcontextprotocol/sdk` | 1.27.1  | 1.29.0  |
| `@changesets/cli`           | 2.30.0  | 2.31.0  |
| `dependency-cruiser`        | 17.3.8  | 17.4.3  |
| `preact`                    | 10.28.4 | 10.29.2 |
| `prettier`                  | 3.8.1   | 3.8.4   |
| `turbo`                     | 2.8.14  | 2.9.17  |

Major jumps (real migration work, one slice each):

| Package       | Current | Latest | Notes                                                                                  |
| ------------- | ------- | ------ | -------------------------------------------------------------------------------------- |
| `eslint`      | 8.57.1  | 10.4.1 | Two majors behind; v8 is EOL; flat-config migration touches every package's lint setup |
| `typescript`  | 5.9.3   | 6.0.3  | Check `@brains/typescript-config` strictness flags against 6.0 behavior changes        |
| `lint-staged` | 15.5.2  | 17.0.7 | Hook pipeline; low blast radius                                                        |
| `syncpack`    | 13.0.4  | 15.3.1 | Config format changes between majors; verify the version-group rules survive           |

Workspace majors (verified 2026-06-10 via `bun outdated --filter '*'`):

| Package                                                                        | Current         | Latest  | Notes                                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | --------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zod`                                                                          | 3.25.76         | 4.4.3   | Already resolves to 3.25.76 — Phase 2 is just aligning the declared `^3.23.8` ranges; v4 is Phase 4                                                                                            |
| `express`                                                                      | 4.22.1          | 5.2.1   | **Unused** — `interfaces/mcp` declares `express`, `express-async-handler`, and `@types/express` but imports none of them (the HTTP transport uses `createServer`). Delete instead of upgrading |
| `marked`                                                                       | 12.0.2          | 18.0.5  | Six majors behind — check changelog before touching                                                                                                                                            |
| `chokidar`                                                                     | 3.6.0           | 5.0.0   | Watcher API changes (directory-sync)                                                                                                                                                           |
| `storybook`                                                                    | 8.6 + 9.1 mixed | 10.4    | **Internally inconsistent today** — addons on 8.6.18, core on 9.1.20; consolidate on one major                                                                                                 |
| `vite`                                                                         | 7.3.3           | 8.0.16  |                                                                                                                                                                                                |
| `pdfjs-dist`                                                                   | 5.7.284         | 6.0.227 |                                                                                                                                                                                                |
| `@libsql/client`                                                               | 0.15.15         | 0.17.3  | DB client — test entity/job/conversation suites against real files                                                                                                                             |
| `drizzle-orm`                                                                  | 0.44.7          | 0.45.2  | Pre-1.0 minor = potentially breaking                                                                                                                                                           |
| `@types/node`                                                                  | 20.19.37        | 25.9.2  | Should track the runtime Node baseline, not latest — decide the baseline first                                                                                                                 |
| `tailwind-merge`                                                               | 2.6.1           | 3.6.0   |                                                                                                                                                                                                |
| `lucide-preact`                                                                | 0.460.0         | 1.17.0  |                                                                                                                                                                                                |
| `ink`                                                                          | 6.8.0           | 7.0.5   | chat-repl TUI                                                                                                                                                                                  |
| `@clack/prompts`                                                               | 0.11.0          | 1.5.1   | brain-cli prompts                                                                                                                                                                              |
| `croner` / `p-limit` / `better-sqlite3` / `varlock` / `eslint-config-prettier` | various         | various | One-major bumps, low individual risk                                                                                                                                                           |

Inventory inconsistencies found (fix in Phase 1 regardless of
upgrades): storybook packages span two majors, and `@types/bun` is on
both 1.3.11 and 1.3.13 across workspaces.

Everything else workspace-level is minor/patch drift (discord.js,
hono, xstate, yaml, shiki, simple-git, tailwindcss, typescript-eslint,
…) and folds into the Phase 1 sweep.

## Phasing

All of this happens in a dedicated worktree (e.g.
`~/Documents/brains-worktrees/external-deps`), never in the main
checkout — dependency bumps rewrite `bun.lock` and `node_modules`, and
must not disturb in-flight work. Thin slices; each lands green
(`typecheck`, `test`, `lint`) and merges to main on its own, so a
stalled major (eslint, zod 4) never holds completed sweeps hostage.

### Phase 0 — full workspace inventory

Done 2026-06-10 (tables above). On future passes: run
`bun outdated --filter '*'` — the root-only form misses every
workspace dependency — and pair it with a usage check before planning
any major migration: a declared-but-unimported dependency is a
deletion, not an upgrade (express in `interfaces/mcp` was exactly
this). When grepping for usage, check dynamic `import("pkg")` too —
`pdfjs-dist` is only loaded lazily and looks unused to a naive grep.
Anything held back deliberately gets a one-line reason here so it
isn't re-flagged.

### Phase 1 — safe drift sweep and dead-weight removal

Update everything in the safe-drift table in one commit; run the full
suite. AI SDK and MCP SDK patches occasionally tighten types — fix
fallout in the same slice. In the same phase: delete the unused
express trio from `interfaces/mcp`, consolidate the mixed storybook
majors (8.6/9.1) onto one version, and align the split `@types/bun`
pins.

### Phase 2 — zod pin bump (`^3.23.8` → `^3.25.x`)

Pure housekeeping — the lockfile already resolves zod to 3.25.76, so
this only aligns the declared ranges with reality. Every upstream peer
(MCP SDK `^3.25 || ^4`, AI SDK `^3.25.76 || ^4.1.8`) accepts it, and
3.25+ ships the `zod/v4` subpath that makes Phase 4 incremental.
Syncpack keeps the version aligned across workspaces.

### Phase 2b — runtime majors, by consumer need

From the workspace-majors table: chokidar 5, marked 18, pdfjs-dist 6,
@libsql/client 0.17, drizzle-orm 0.45, ink 7, @clack/prompts 1.x,
tailwind-merge 3, lucide 1.x, vite 8. None is urgent; take each only
when touching its consumer package. Decide the Node runtime baseline
before touching `@types/node` (20 → 25 should track the deploy
baseline, not npm latest).

### Phase 3 — tooling majors, one slice each

In rough order of value:

1. `eslint` 8 → 10 (flat config). Biggest lift; touches
   `@brains/eslint-config` and every package's lint script — pairs
   naturally with the package.json script-drift cleanup in
   `codebase-cleanup-backlog.md`.
2. `syncpack` 13 → 15 (verify version-group config survives).
3. `lint-staged` 15 → 17.
4. `typescript` 5.9 → 6.0 — last, after lint tooling is stable, since
   it can surface new diagnostics repo-wide.

### Phase 4 — zod 4 migration

The big one, and a **release blocker for the first stable
`@rizom/brain`** (see `npm-package-boundaries.md`). Scope to respect:
`@brains/utils` re-exports `z` to 600+ importing files,
`shared/atproto-contracts` alone holds 200+ schemas, and v4 changes
behavior this codebase leans on (`.passthrough()`, error
customization, record/enum typing — `conversation-service` and the
entity schemas use passthrough deliberately). Use the `zod/v4` subpath
for incremental, package-by-package migration behind the
`@brains/utils` re-export; migrate leaf packages first, contracts last.

## Cadence policy

Re-run the Phase 0 inventory at each release cut. Patch/minor drift
gets swept opportunistically (Phase 1 style); any new major gets an
entry in this doc with a decision — migrate, hold (with reason), or
drop the dependency.
