# Plan: External dependency review and updates

## Status

In progress in `~/Documents/brains-worktrees/external-deps` on branch
`chore/external-deps-phase1`. Trigger: the zod version policy decided in
`npm-package-boundaries.md` (2026-06-10) — the blessed `z` ships as the
workspace zod, and the zod 4 migration is a release blocker for the
first stable `@rizom/brain`. That decision needs a home for sequencing
and mechanics, and the same review surfaced broader drift worth
handling deliberately instead of ad hoc.

Execution rule: dependency-changing work happens in a dedicated worktree
(e.g. `~/Documents/brains-worktrees/external-deps`), never in the main
checkout.

Progress as of 2026-06-15: Phases 1a, 1b, 1c, and 2 are implemented in
the worktree and pass `deps:check`, `typecheck`, `lint`, and `test`.
Rover evals were run with `bun run eval --skip-llm-judge --max-parallel
1`; result was 157/161 passing, so the dependency work is not eval-green
yet. A 2026-06-16 follow-up safe-drift slice updated newly surfaced
patch/minor drift for AI SDK React bindings, `ai`, TypeScript-ESLint,
`radix-ui`, and `playwright-core`; targeted consumer checks and root
lint pass. The first Phase 2b runtime-major slice updated `croner` 9 →
10 for `@brains/content-pipeline`; package typecheck, lint, and tests
pass. A second Phase 2b slice updated `p-limit` 6 → 7 behind the
`@brains/utils` re-export; utils and direct consumer package checks pass.
A third Phase 2b slice updated `tailwind-merge` 2 → 3 for UI packages
and added the missing direct dependency declaration for `@brains/web-chat`;
UI typecheck/lint/test/build checks pass. A fourth Phase 2b slice updated
`lucide-preact` 0.x → 1.x for `@brains/product-site-content`; package
checks pass. A small tooling slice updated `@changesets/changelog-github`
0.6 → 0.7 and verified Changesets status. Another Phase 2b slice
updated `sharp` 0.34 → 0.35 across site-engine, brain-cli optional deps,
and generated model package optional deps; affected package checks pass.
Another Phase 2b slice updated `@clack/prompts` 0.11 → 1.5 for the
`@rizom/brain` init prompt flow; `@rizom/brain` typecheck, lint, and
tests pass. Another Phase 2b slice updated `chokidar` 3 → 5 for
`@brains/directory-sync`; package typecheck, lint, and tests pass.
Another Phase 2b slice updated `marked` 12 → 18 for `@brains/chat-repl`
and `@brains/ui-library`; package typecheck, lint, and tests pass.
Another Phase 2b slice updated `pdfjs-dist` 5 → 6 for
`@brains/document`; package typecheck, lint, and tests pass. Another
Phase 2b slice updated `@libsql/client` 0.15 → 0.17 across entity,
conversation, and job-queue services plus published optional dependency
metadata; targeted DB/service checks pass. Another Phase 2b slice
updated `drizzle-orm` 0.44 → 0.45 across the same DB services; targeted
DB/service checks pass. Another Phase 2b slice updated `ink` 6 → 7 for
`@brains/chat-repl`; package typecheck, lint, and tests pass. Another
Phase 2b slice updated `varlock` 0.5 → 1.7 for `@brains/app`; package
typecheck, lint, and tests pass. A follow-up delete-vs-upgrade slice
removed unused `better-sqlite3` optional dependency metadata now that DB
runtime paths consistently use `@libsql/client`; targeted package checks
pass. A follow-up icon-package drift slice updated `lucide-react` and
`lucide-preact` 1.18 → 1.20; targeted consumer checks pass. Remaining
outdated entries are deliberate holds/migrations from Phase 2b+.

## Inventory (verified 2026-06-15 via `bun outdated --filter '*'`)

Safe root drift (minor/patch, no API changes expected):

| Package                     | Current | Latest  | Notes                              |
| --------------------------- | ------- | ------- | ---------------------------------- |
| `@ai-sdk/anthropic`         | 3.0.58  | 3.0.84  | Sweep with AI SDK family           |
| `@ai-sdk/openai`            | 3.0.41  | 3.0.71  | Sweep with AI SDK family           |
| `ai`                        | 6.0.116 | 6.0.205 | AI SDK patch/minor drift           |
| `@modelcontextprotocol/sdk` | 1.27.1  | 1.29.0  | Also used by MCP workspaces        |
| `@changesets/cli`           | 2.30.0  | 2.31.0  | Safe tooling drift                 |
| `dependency-cruiser`        | 17.3.8  | 17.4.3  | Safe tooling drift                 |
| `preact`                    | 10.28.4 | 10.29.2 | Sync with workspace Preact drift   |
| `prettier`                  | 3.8.1   | 3.8.4   | Safe tooling drift                 |
| `turbo`                     | 2.8.14  | 2.9.18  | Also replace root `"latest"` range |

Safe workspace drift to include in Phase 1a when low-risk and already
covered by broad checks:

| Package family / package                                                    | Current                | Latest                  | Notes                                                      |
| --------------------------------------------------------------------------- | ---------------------- | ----------------------- | ---------------------------------------------------------- |
| `preact`, `preact-render-to-string`                                         | 10.28.4 / 6.6.6        | 10.29.2 / 6.7           | Sync all consumers and peer ranges                         |
| `tailwindcss`, `@tailwindcss/postcss`, `@tailwindcss/typography`, `postcss` | 4.2.1 / 0.5.19 / 8.5.8 | 4.3.1 / 0.5.20 / 8.5.15 | Patch/minor CSS toolchain drift                            |
| `js-yaml`, `yaml`, `dotenv`, `simple-git`, `xstate`, `sanitize-html`        | various                | minor/patch             | Consumer-specific smoke tests plus repo checks             |
| `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`             | 8.56.1                 | 8.61.0                  | Safe within current eslint 8 setup                         |
| `@simplewebauthn/server`, `drizzle-kit`, `rollup`, `@types/react`           | various                | patch/minor             | Low-risk patch/minor drift                                 |
| `@types/node`                                                               | 20.19.37               | 20.19.43                | Patch within Node 20 only; do not jump to 25 in this phase |
| `@types/bun`                                                                | 1.3.11 / 1.3.13        | 1.3.14                  | Align declarations/resolution; see Phase 1c                |

Major jumps and pre-1.0 minors (real migration work, one slice each):

| Package                        | Current | Latest | Notes                                                                                  |
| ------------------------------ | ------- | ------ | -------------------------------------------------------------------------------------- |
| `eslint`                       | 8.57.1  | 10.5.0 | Two majors behind; v8 is EOL; flat-config migration touches every package's lint setup |
| `typescript`                   | 5.9.3   | 6.0.3  | Check `@brains/typescript-config` strictness flags against 6.0 behavior changes        |
| `lint-staged`                  | 15.5.2  | 17.0.7 | Hook pipeline; low blast radius                                                        |
| `syncpack`                     | 13.0.4  | 15.3.1 | Config format changes between majors; verify version-group rules survive               |
| `eslint-config-prettier`       | 8.10.2  | 10.1.8 | Pair with eslint flat-config work                                                      |
| `@changesets/changelog-github` | 0.6.0   | 0.7.0  | 0.x minor; treat as a migration, not safe drift                                        |

Workspace majors and delete-vs-upgrade decisions:

| Package                                                            | Current         | Latest  | Decision / notes                                                                                       |
| ------------------------------------------------------------------ | --------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `zod`                                                              | 3.25.76         | 4.4.3   | Lock already resolves to 3.25.76 — Phase 2 aligns declared `^3.23.8` ranges; v4 is Phase 4             |
| `express`, `express-async-handler`, `@types/express`               | 4.x             | 5.x     | **Delete** — `interfaces/mcp` imports none of them; HTTP transport uses `createServer`                 |
| `storybook` + `@storybook/*`                                       | 8.6 + 9.1 mixed | 10.4.4  | **Delete** — only `shared/ui-library`, one demo story, no turbo/CI wiring, mixed install cannot launch |
| `marked`                                                           | 12.0.2          | 18.0.5  | Six majors behind — check changelog before touching                                                    |
| `chokidar`                                                         | 3.6.0           | 5.0.0   | Watcher API changes (`directory-sync`)                                                                 |
| `vite`                                                             | 7.3.3           | 8.0.16  | Patch to 7.3.5 is safe drift; v8 is a separate migration                                               |
| `pdfjs-dist`                                                       | 5.7.284         | 6.0.227 | Lazily imported; grep usage must include dynamic imports                                               |
| `@libsql/client`                                                   | 0.15.15         | 0.17.3  | DB client — test entity/job/conversation suites against real files                                     |
| `drizzle-orm`                                                      | 0.44.7          | 0.45.2  | Pre-1.0 minor = potentially breaking                                                                   |
| `@types/node`                                                      | 20.19.37        | 25.9.3  | Hold at Node 20 until runtime baseline is decided; patch within 20 is okay                             |
| `tailwind-merge`                                                   | 2.6.1           | 3.6.0   | Runtime UI helper migration                                                                            |
| `lucide-preact`                                                    | 0.460.0         | 1.18.0  | Runtime icon package migration                                                                         |
| `ink`                                                              | 6.8.0           | 7.0.5   | `chat-repl` TUI                                                                                        |
| `@clack/prompts`                                                   | 0.11.0          | 1.x     | `brain-cli` prompts; verify against current inventory before starting                                  |
| `croner` / `p-limit` / `varlock` / `sharp` / `react-devtools-core` | various         | various | One-major or pre-1.0 bumps; take individually with consumer tests                                      |

Inventory inconsistencies to fix deliberately:

- Storybook packages span two majors and are not wired into CI or turbo.
- `@types/bun` declarations mix `latest` and caret ranges, and the lock
  currently resolves multiple versions (`1.3.11` / `1.3.13`). Align the
  policy before touching the lockfile.
- Root `package.json` declares `"turbo": "latest"`; replace with a
  deterministic semver range during Phase 1.

Everything else workspace-level is minor/patch drift and folds into the
Phase 1a sweep when the relevant consumer checks are included.

## Phasing

All dependency-changing work happens in a dedicated worktree (e.g.
`~/Documents/brains-worktrees/external-deps`), never in the main
checkout — dependency bumps rewrite `bun.lock` and `node_modules`, and
must not disturb in-flight work. Thin slices; each lands green
(`typecheck`, relevant tests, and `lint`) and merges to main on its own,
so a stalled major (eslint, zod 4) never holds completed sweeps hostage.

### Phase 0 — full workspace inventory

Done 2026-06-10; refreshed 2026-06-15 (tables above). On future passes:
run `bun outdated --filter '*'` — the root-only form misses every
workspace dependency — and pair it with a usage check before planning
any major migration: a declared-but-unimported dependency is a deletion,
not an upgrade (express in `interfaces/mcp` was exactly this). When
grepping for usage, check dynamic `import("pkg")` too — `pdfjs-dist` is
only loaded lazily and looks unused to a naive grep. Anything held back
deliberately gets a one-line reason here so it isn't re-flagged.

### Phase 1a — safe drift sweep (done in worktree)

Update safe root and workspace patch/minor drift in one focused slice.
Include AI SDK and MCP SDK families, Preact, Tailwind/PostCSS patches,
TypeScript-ESLint 8.x patches, and other low-risk minor/patch drift
listed above. AI SDK and MCP SDK patches occasionally tighten types —
fix fallout in the same slice.

Validation: run `bun run deps:check`, `bun run typecheck`, relevant
consumer tests for touched packages, then `bun run lint`.

### Phase 1b — dead-weight removal (done in worktree)

Delete instead of upgrading unused dependencies:

- `interfaces/mcp`: remove `express`, `express-async-handler`, and
  `@types/express`.
- `shared/ui-library`: remove Storybook devDeps, `storybook` scripts,
  `.storybook/`, `src/Button.stories.tsx`, Storybook README instructions,
  and the `.storybook` entry in `tailwind.config.js`.

Validation: package-local typecheck/build where available, plus repo
`typecheck` and `lint`.

### Phase 1c — declaration and lockfile hygiene (done in worktree)

Normalize non-deterministic or inconsistent declarations without taking
runtime majors:

- Replace root `"turbo": "latest"` with the selected semver range.
- Align `@types/bun` declarations/resolution across workspaces according
  to the syncpack policy.
- Optionally patch `@types/node` within Node 20 only; do not move to
  Node 25 until the runtime baseline is decided.

### Phase 2 — zod pin bump (`^3.23.8` → `^3.25.x`) (done in worktree)

Pure housekeeping — the lockfile already resolves zod to 3.25.76, so
this only aligns the declared ranges with reality. Every upstream peer
(MCP SDK `^3.25 || ^4`, AI SDK `^3.25.76 || ^4.1.8`) accepts it, and
3.25+ ships the `zod/v4` subpath that makes Phase 4 incremental.
Syncpack keeps the version aligned across workspaces.

### Phase 2b — runtime majors, by consumer need

From the workspace-majors table: chokidar 5, marked 18, pdfjs-dist 6,
@libsql/client 0.17, drizzle-orm 0.45, ink 7, @clack/prompts 1.x,
tailwind-merge 3, lucide 1.x, vite 8, and optional/runtime majors such
as sharp 0.35. None is urgent; take each only when touching its consumer
package. Decide the Node runtime baseline before
touching `@types/node` 25 (the type package should track the deploy
baseline, not npm latest).

Done in worktree:

- `croner` 9 → 10 for `@brains/content-pipeline`; usage is encapsulated
  in `CronerBackend`, with package typecheck, lint, and tests passing.
- `p-limit` 6 → 7 for `@brains/utils`; usage remains the default
  `pLimit(concurrency)` API, with utils checks and direct consumer
  package tests passing.
- `tailwind-merge` 2 → 3 for `@rizom/ui`, `@brains/ui-library`, and
  `@brains/web-chat`; usage remains `twMerge`/`extendTailwindMerge`, and
  the web-chat manifest now declares the package it imports directly.
- `lucide-preact` 0.x → 1.x for `@brains/product-site-content`; usage
  remains named/icon-map component imports, with package typecheck,
  lint, and tests passing.
- `sharp` 0.34 → 0.35 for `@brains/site-engine`, `@rizom/brain` optional
  deps, and generated model package optional deps; lazy import policy is
  unchanged and affected package tests pass.
- `@clack/prompts` 0.11 → 1.5 for `@rizom/brain`; usage remains the
  existing `intro`/`password`/`confirm`/`text`/`isCancel` prompt flow,
  with package typecheck, lint, and tests passing.
- `chokidar` 3 → 5 for `@brains/directory-sync`; watcher usage remains
  the existing `watch()` + `FSWatcher` event API, with package typecheck,
  lint, and tests passing.
- `marked` 12 → 18 for `@brains/chat-repl` and `@brains/ui-library`;
  custom renderers now use Marked's token-object renderer API, with
  package typecheck, lint, and tests passing.
- `pdfjs-dist` 5 → 6 for `@brains/document`; lazy import path remains
  `pdfjs-dist/legacy/build/pdf.mjs`, and cleanup now goes through the
  v6 loading-task `destroy()` API, with package typecheck, lint, and
  tests passing.
- `@libsql/client` 0.15 → 0.17 for `@brains/entity-service`,
  `@brains/conversation-service`, `@brains/job-queue`, and
  `@rizom/brain`/model package optional dependency metadata; existing
  `createClient` usage remains unchanged, with affected package
  typecheck, lint, and tests passing.
- `drizzle-orm` 0.44 → 0.45 for `@brains/entity-service`,
  `@brains/conversation-service`, and `@brains/job-queue`; existing
  query-builder and migrator usage remains unchanged, with affected
  package typecheck, lint, and tests passing.
- `ink` 6 → 7 for `@brains/chat-repl`; existing dynamic `render()` and
  component hook usage remains unchanged, with package typecheck, lint,
  and tests passing.
- `varlock` 0.5 → 1.7 for `@brains/app`; the internal graph-loader call
  now uses v1's `entryFilePaths` option, with package typecheck, lint,
  and tests passing.
- Deleted unused `better-sqlite3` optional dependency declarations from
  `@rizom/brain`, generated model package metadata, and Docker runtime
  metadata; runtime DB usage is consistently `@libsql/client` via
  Drizzle's libSQL adapter.
- `lucide-react`/`lucide-preact` 1.18 → 1.20 for `@brains/web-chat` and
  `@brains/product-site-content`; named icon imports remain unchanged,
  with targeted consumer checks passing.

### Phase 3 — tooling majors, one slice each

In rough order of value:

1. `eslint` 8 → 10 (flat config), paired with `eslint-config-prettier` 10. Biggest lift; touches `@brains/eslint-config` and every
   package's lint script — pairs naturally with the package.json
   script-drift cleanup in `codebase-cleanup-backlog.md`.
2. `syncpack` 13 → 15 (verify version-group config survives).
3. `lint-staged` 15 → 17.
4. `typescript` 5.9 → 6.0 — last, after lint tooling is stable, since
   it can surface new diagnostics repo-wide.

Done in worktree:

- `@changesets/changelog-github` 0.6 → 0.7; config remains unchanged and
  `changeset status --since=HEAD` passes.

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

Re-run the Phase 0 inventory at each release cut. Patch/minor drift gets
swept opportunistically (Phase 1a style); any new major gets an entry in
this doc with a decision — migrate, hold (with reason), or drop the
dependency.
