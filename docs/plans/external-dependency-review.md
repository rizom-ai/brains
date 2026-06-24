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
`lucide-preact` 1.18 → 1.20; targeted consumer checks pass. A Phase 3
ESLint tightening slice now enforces `--max-warnings 0` through the root
lint entrypoint and cleaned up existing warnings; root `lint` and
`typecheck` pass. A follow-up ESLint tightening slice enabled
`preserve-caught-error` and updated symptom rethrows to retain `cause`;
forced root lint and typecheck pass. Another ESLint tightening slice enabled
`no-useless-assignment` and removed dead initial assignments; forced root
lint and typecheck pass. Another ESLint tightening slice promoted
`@typescript-eslint/consistent-type-imports` to error; forced root lint and
typecheck pass. Another ESLint tightening slice promoted
`@typescript-eslint/prefer-nullish-coalescing` to error; forced root lint
passes. Another ESLint tightening slice promoted
`@typescript-eslint/no-unnecessary-condition` to error; forced root lint
passes. The TypeScript tooling-major slice updated `typescript` 5.9 →
6.0 across synced workspace devDependency ranges, acknowledged the TS6
`baseUrl` deprecation window, and made the shared Bun ambient types
explicit; root typecheck passes. A TypeScript strictness slice enabled
`noUncheckedSideEffectImports`; root typecheck passes without code changes.
Another TypeScript strictness slice enabled `moduleDetection: "force"`;
root typecheck passes without code changes. Another TypeScript strictness
slice enabled `verbatimModuleSyntax`; root typecheck passes without code
changes. Another TypeScript strictness slice enabled `erasableSyntaxOnly`
and removed runtime TypeScript-only syntax such as enums and constructor
parameter properties; forced root typecheck and lint pass. A follow-up
`isolatedDeclarations` probe was reverted on 2026-06-17: the first pass
made exported Zod schemas more maintenance-hostile by spelling large Zod
internal object shapes in public annotations. Do not continue that direction.
Sequence Zod 4 before retrying `isolatedDeclarations`, then treat declaration
strictness as public API-boundary cleanup rather than schema-internal type
annotation work. Remaining outdated entries are deliberate holds/migrations
from Phase 2b+. As of 2026-06-23, the branch has a clean broad
stabilization pass after the latest isolated Zod 4 guard chunks:
`bun run typecheck`, `bun run lint`, and `bun run test` all pass. The
Zod migration is still incomplete; remaining work should be treated as
boundary-migration design for a follow-up phase rather than more low-risk
local guard cleanup.

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

| Package                                              | Current         | Latest  | Decision / notes                                                                                       |
| ---------------------------------------------------- | --------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `zod`                                                | 3.25.76         | 4.4.3   | Lock already resolves to 3.25.76 — Phase 2 aligns declared `^3.23.8` ranges; v4 is Phase 4             |
| `express`, `express-async-handler`, `@types/express` | 4.x             | 5.x     | **Delete** — `interfaces/mcp` imports none of them; HTTP transport uses `createServer`                 |
| `storybook` + `@storybook/*`                         | 8.6 + 9.1 mixed | 10.4.4  | **Delete** — only `shared/ui-library`, one demo story, no turbo/CI wiring, mixed install cannot launch |
| `marked`                                             | 12.0.2          | 18.0.5  | Six majors behind — check changelog before touching                                                    |
| `chokidar`                                           | 3.6.0           | 5.0.0   | Watcher API changes (`directory-sync`)                                                                 |
| `vite`                                               | 7.3.3           | 8.0.16  | Patch to 7.3.5 is safe drift; v8 is a separate migration                                               |
| `pdfjs-dist`                                         | 5.7.284         | 6.0.227 | Lazily imported; grep usage must include dynamic imports                                               |
| `@libsql/client`                                     | 0.15.15         | 0.17.3  | DB client — test entity/job/conversation suites against real files                                     |
| `drizzle-orm`                                        | 0.44.7          | 0.45.2  | Pre-1.0 minor = potentially breaking                                                                   |
| `@types/node`                                        | 20.19.37        | 25.9.3  | Hold at Node 20 until runtime baseline is decided; patch within 20 is okay                             |
| `tailwind-merge`                                     | 2.6.1           | 3.6.0   | Runtime UI helper migration                                                                            |
| `lucide-preact`                                      | 0.460.0         | 1.18.0  | Runtime icon package migration                                                                         |
| `ink`                                                | 6.8.0           | 7.0.5   | `chat-repl` TUI                                                                                        |
| `@clack/prompts`                                     | 0.11.0          | 1.x     | `brain-cli` prompts; verify against current inventory before starting                                  |
| `croner` / `p-limit` / `varlock` / `sharp`           | various         | various | One-major or pre-1.0 bumps; take individually with consumer tests                                      |

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
tailwind-merge 3, lucide 1.x, and optional/runtime majors such
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
- `react-devtools-core` 6 → 7 for `@rizom/brain`, generated model
  package optional deps, and Docker runtime metadata; it remains
  externalized for Ink, with app/CLI checks passing.
- `vite` 7 → 8 for `@brains/web-chat`; the minimal alias-only config
  remains unchanged, with package typecheck, lint, tests, and UI build
  passing.

### Phase 3 — tooling majors, one slice each

Done in worktree:

- `@changesets/changelog-github` 0.6 → 0.7; config remains unchanged and
  `changeset status --since=HEAD` passes.
- `lint-staged` 15 → 17; root package-json config remains valid, and the
  hook command was exercised with `lint-staged --diff HEAD`.
- `syncpack` 13 → 15; root scripts now use the v15 `lint`/`fix`
  commands, preserving the old `deps:check` mismatch-only semantics, and
  `syncpack lint` passes with the existing version-group policy.
- `eslint` 8 → 10 and `eslint-config-prettier` 8 → 10; root flat config
  uses `FlatCompat` to preserve the shared legacy policy, old `--ext`
  scripts were converted to equivalent glob scopes, ESLint 10-only core
  rules absent from the ESLint 8 baseline are disabled, and representative
  `--print-config` comparisons show no loosened existing rule severities.
  Full repo `bun run lint` passes.
- Root lint now uses `scripts/lint.mjs` to run Turbo with
  `--max-warnings 0` passed to package ESLint commands, keeping package
  scripts local while failing the repo lint on any warning and preserving
  Turbo flags such as the pre-commit hook's `--continue`. The initial
  warning cleanup fixed stale disables, type-only imports, missing return
  types, unnecessary conditionals, and one closure-state false positive;
  full repo `bun run lint` and `bun run typecheck` pass.
- `preserve-caught-error` is now an error. Existing symptom rethrows were
  updated to preserve their original caught errors with `cause`; forced full
  repo lint and root typecheck pass.
- `no-useless-assignment` is now an error. Existing dead initial assignments
  were removed or rewritten to direct initialization/definite assignment;
  forced full repo lint, root typecheck, and targeted package tests pass.
- `@typescript-eslint/consistent-type-imports` is now an error. No code
  changes were needed after the previous zero-warning cleanup; forced full
  repo lint and root typecheck pass.
- `@typescript-eslint/prefer-nullish-coalescing` is now an error. No code
  changes were needed after the previous zero-warning cleanup; forced full
  repo lint passes.
- `@typescript-eslint/no-unnecessary-condition` is now an error. No code
  changes were needed after the previous zero-warning cleanup; forced full
  repo lint passes.
- `typescript` 5.9 → 6.0.3 across synced workspace devDependency ranges;
  root config now explicitly includes Bun ambient types and acknowledges
  the TS6 `baseUrl` deprecation window until path/baseUrl config is
  migrated before TypeScript 7. Root typecheck passes.
- `noUncheckedSideEffectImports` is now enabled. No code changes were
  needed; root typecheck passes.
- `moduleDetection: "force"` is now enabled. No code changes were needed;
  root typecheck passes.
- `verbatimModuleSyntax` is now enabled. No code changes were needed;
  root typecheck passes.
- `erasableSyntaxOnly` is now enabled. Runtime TypeScript-only syntax was
  removed by replacing enums with const-object unions and expanding
  constructor parameter properties into explicit fields/assignments. Forced
  root typecheck and lint pass.
- `isolatedDeclarations` was probed and explicitly deferred. The reverted
  probe showed that enabling it directly on the current Zod 3-heavy public
  API pushes the repo toward broad, ugly annotations of Zod internals. That
  is the wrong direction. Do not use broad codemods, casts, blanket `as const`,
  invented domain literals, or giant `z.ZodObject<{ ... }>` annotations as the
  migration strategy.

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
Before changing the repo default, keep the import boundary clean: internal
implementation packages should import `z` through `@brains/utils`; public
SDK/contract surfaces that feed generated `@rizom/brain` declarations may
import `zod` directly to avoid leaking private `@brains/*` packages into
published declarations. The public `@rizom/brain` root export owns the
external authoring boundary by re-exporting blessed `z`, so external plugins
should not declare their own `zod` dependency.

Incremental migration progress:

- Added `@brains/utils/zod-v4` as an explicit opt-in wrapper around the
  `zod/v4` subpath while the repo default remains Zod 3.
- Migrated self-contained web-chat request/upload/card payload schemas to
  `@brains/utils/zod-v4`. This is intentionally narrow: avoid switching
  APIs that accept schemas from other packages until both sides of that
  boundary move together.
- Split more defaulted plugin configs into parsed output and caller input:
  `directory-sync`, `atproto`, `atproto-registry`, and `site-builder` now use
  `z.output<typeof schema>` for runtime config and `z.input<typeof schema>` for
  constructor/factory input. `site-builder` keeps its typed runtime fields
  (`templates`, `layouts`, `routes`, `entityDisplay`) while still allowing
  defaulted schema fields to be omitted by callers.
- Audited site plugin config inputs for `site-personal`, `site-professional`,
  and `site-rizom`. Professional site config now has an explicit Post/Deck
  homepage entity-display default so the optional `SitePackage` plugin callback
  stays schema-true without `Partial<Config>`.
- Audited interface plugin configs for `a2a`, `webserver`, and `chat-repl`.
  Defaulted interface config fields now use schema input types at constructor
  boundaries. `discord` remains a visible `Partial<Config>` marker because its
  required `botToken` crosses the dynamic brain-model `PluginConfig` constructor
  boundary and should be handled as a separate framework-boundary cleanup.
- Audited service plugin config inputs for `analytics`, `buttondown`,
  `email-resend`, and `stock-photo`; factory/constructor inputs now use
  schema-derived input types, while runtime config remains parsed schema output.
- Removed the hidden `Partial<TConfig>` input from the `MCPBridgePlugin` base;
  bridge subclasses now spell their config input type explicitly. `notion` and
  `hackmd` keep required token inputs schema-true and test missing-token
  failures at the schema boundary.
- Audited schema-owned service plugin config inputs for `dashboard` and
  `content-pipeline`; runtime config uses `z.output<typeof schema>`, while
  constructors and factories accept `z.input<typeof schema>`. Nested
  content-pipeline publish registration payloads use schema input, while parsed
  publish/generation configs use schema output.
- Audited defaulted entity plugin config inputs for `blog`, `note`, and
  `products`; their parsed configs use `z.output<typeof schema>` and caller
  inputs use `z.input<typeof schema>`.
- Audited additional defaulted/empty entity plugin config inputs for
  `conversation-memory`, `topics`, `wishlist`, and `image`; removed visible
  `Partial<Config>` markers where the schema now owns the input contract.
- Audited more schema-owned entity plugin config inputs for `portfolio`,
  `newsletter`, and `social-media`, including defaulted constructor/factory
  inputs where every caller-provided field is optional before parsing. Nested
  social-media LinkedIn config now exposes runtime output and caller input
  aliases separately.
- Audited schema-owned config inputs for `link`, `document`, `obsidian-vault`,
  and `cms`; callers now use schema-derived input types and parsed runtime
  config remains schema output.
- Audited `site-content` config by typing its shallow schema validator against
  the existing rich `SiteContentDefinition` contract, then deriving runtime and
  caller config types from that schema.
- Updated plugin examples and the external public plugin fixture to use
  schema-derived config input/output types, so authoring examples match the
  production plugin config boundary.
- Audited `auth-service` config by deriving parsed runtime config with
  `z.output<typeof schema>` and caller input with `z.input<typeof schema>`.
- Replaced `Shell.getInstance`'s raw `Partial<ShellConfig>` parameter with the
  named `ShellConfigInput` pre-parse contract.
- Added a named `AppConfigInput` caller contract for `App.create`/`App.run`,
  then split app config runtime/input around defaulted deployment parsing:
  runtime `AppConfig` carries schema output, while callers can still provide
  `DeploymentConfigInput` before defaults.
- Audited Discord by deriving runtime/direct schema input types and replacing
  `Partial<DiscordConfig>` with an explicit raw constructor config boundary for
  the post-merge brain model resolver path.
- Named the AI service's partial runtime update contract as
  `AIModelConfigUpdate`.
- Replaced remaining test helper inline `Partial<...Config>` markers with named
  `...Overrides` aliases or schema-derived input contracts.
- Audited composite factory config inputs for `agent-discovery`, `assessment`,
  and `newsletter`; factories now accept schema input while exported runtime
  config aliases remain schema output.
- Audited the public `brain.yaml` parser boundary: parsed configs use schema
  output and the exported input alias represents the raw YAML shape before
  validation/normalization.
- Audited the plugin eval `eval.yaml` parser boundary the same way: parsed eval
  configs use schema output and the input alias represents pre-parse YAML data.
- Audited template permission entity-action policy schemas: stored policy types
  use schema output, while `PermissionConfig` accepts schema input before the
  service parses it.
- Audited `brains-ops` YAML registry config aliases (`pilot`, `user`, and
  `cohort`) so runtime config uses schema output and input aliases represent
  pre-parse YAML shapes.
- Named the shell config schema output used by the runtime `ShellConfig` type;
  the existing named partial `ShellConfigInput` remains the visible pre-parse
  override boundary.
- Clarified plugin config helper aliases so `PluginConfigInput<T>` is schema
  input and runtime `PluginConfig<T>` is schema output.
- Completed the originally identified config-boundary `z.infer` inventory. The
  remaining `z.infer` uses are mostly domain DTOs, tool payloads, and exported
  schemas composed across package boundaries; explicit `@brains/utils/zod-v4`
  migration should happen at those composition boundaries instead of mixing v3
  and v4 schemas inside a single schema tree.
- Started safe explicit Zod 4 islands beyond web chat by migrating local
  `ai-service` agent-result and SDK tool-output parsing schemas to
  `@brains/utils/zod-v4`, using `z.looseObject` for intentional passthrough
  shapes and Zod 4 record syntax.
- Migrated notification message payload/result schemas to explicit Zod 4 while
  keeping the plugin config schema on the main Zod export until plugin base
  config-schema boundaries are migrated together.
- Migrated shared email message contracts to explicit Zod 4 and split sender
  input from parsed payload output where schema defaults apply.
- Migrated A2A client response parsing to explicit Zod 4 with
  `z.looseObject` for intentionally open response parts.
- Migrated A2A JSON-RPC request and stream parameter protocol schemas to
  explicit Zod 4, with named input/output aliases for request boundaries.
- Migrated Brain CLI Bitwarden API response parsing schemas to explicit Zod 4,
  using `z.looseObject` for third-party JSON objects with additional fields.
- Migrated Brain CLI Origin CA bootstrap environment parsing to explicit Zod 4,
  using `z.looseObject` for `process.env`.
- Made the Brain CLI `parseJsonResponse` helper structural over `safeParse` so
  local callers can pass either Zod generation, then migrated Hetzner SSH key
  response schemas to explicit Zod 4.
- Made `parseYamlDocument` structural over `safeParse` so YAML callers can pass
  either Zod generation, then migrated ops registry YAML schemas to explicit
  Zod 4 with `z.strictObject`.
- Migrated auth-service OAuth dynamic client registration request parsing to
  explicit Zod 4 while keeping plugin config schemas on the main Zod boundary.
- Migrated conversation metadata JSON coercion to explicit Zod 4 and the Zod 4
  `z.record(z.string(), value)` form.
- Migrated ops health-check response parsing and encrypted user-secret parsing
  to explicit Zod 4, using `z.looseObject` for third-party health JSON and
  `z.strictObject` for sealed secret files.
- Made shared `parseJsonResponse` structural over `safeParse`, then migrated
  deploy-support Cloudflare Origin CA responses and ops Hetzner SSH key
  responses to explicit Zod 4 with `z.looseObject` for provider JSON.
- Migrated site-builder content-enrichment local entity/image guard schemas to
  explicit Zod 4 with `z.looseObject` for enriched runtime objects.
- Migrated shared UI widget render-time data guards to explicit Zod 4 and used
  Zod 4 `z.record(z.string(), value)` syntax for open widget data maps,
  including list/system widget parsers.
- Migrated the ai-evaluation `eval.yaml` local parse schema to explicit Zod 4,
  while leaving AI-service/template-composed schemas on the current boundary.
- Migrated dashboard widget-card render-time data guards to explicit Zod 4,
  keeping registry schemas on the existing permission-schema boundary.
- Migrated the assessment SWOT widget render-time data guard to explicit Zod 4,
  while leaving entity-composed widget data builders on the existing boundary.
- Migrated directory-sync cover-image frontmatter detection to explicit Zod 4
  and used the Zod 4 `z.url()` string helper.
- Migrated the series optional metadata field guard to explicit Zod 4.
- Made `parseMarkdownWithFrontmatter` structural over `parse`, matching the
  prior JSON/YAML parser-helper approach and allowing either Zod generation at
  markdown frontmatter parse boundaries.
- Migrated content-pipeline publish-content local frontmatter/document reference
  guards to explicit Zod 4 with `z.record(z.string(), value)` syntax.
- Migrated blog eval-handler input parsers to explicit Zod 4 with parsed
  handler inputs typed as schema output.
- Migrated agent-discovery skill eval-handler input parsing to explicit Zod 4
  while leaving entity/template schemas on their existing composition boundary.
- Migrated topics eval-handler input parsers to explicit Zod 4 with parsed
  handler inputs typed as schema output and Zod 4 record syntax.
- Migrated the plugins tool-activity message parser to explicit Zod 4 while
  keeping exported event contracts as plain TypeScript types.
- Migrated the plugins runtime-upload metadata parser to explicit Zod 4 while
  keeping the exported upload contracts as plain TypeScript interfaces.
- Migrated the plugins prompt-resolver frontmatter body extraction schema to
  explicit Zod 4 now that the markdown parser accepts structural schemas.
- Migrated the content-formatters simple-text formatter guard to explicit Zod 4
  while leaving formatter constructor/schema contracts on the existing boundary.
- Migrated series generation-handler job/member-summary local guards to explicit
  Zod 4 while leaving series entity/frontmatter schemas on the existing boundary.
- Migrated the series projection job-data parser to explicit Zod 4 while the
  entity schema remains on the existing plugin schema boundary.
- Migrated the note eval-handler input parser to explicit Zod 4 while keeping
  note config/entity schemas on the existing plugin boundary.
- Migrated the blog RSS datasource query parser to explicit Zod 4; the
  datasource output schema stays typed to the existing framework-facing Zod
  boundary.
- Migrated the link eval-handler input parser to explicit Zod 4 while keeping
  link config/entity schemas on the existing plugin boundary.
- Migrated the social-media eval-handler input parsers to explicit Zod 4 while
  keeping generation job schemas on their existing job-handler boundary.
- Migrated the newsletter eval-handler input parser to explicit Zod 4 while
  keeping newsletter config/entity schemas on the existing plugin boundary.
- Migrated the portfolio eval-handler input parser to explicit Zod 4 while
  keeping portfolio template/entity schemas on the existing framework boundary.
- Migrated the products datasource query parser to explicit Zod 4 while keeping
  datasource output/entity schemas on the existing framework boundary.
- Migrated the decks eval-handler input parsers to explicit Zod 4 while keeping
  deck entity/template schemas on the existing plugin boundary.
- Migrated the rizom ecosystem datasource query parser to explicit Zod 4 using
  `z.looseObject` for the intentional passthrough query boundary.
- Migrated the conversation-memory summary datasource query parser to explicit
  Zod 4 while keeping summary entity/template schemas on existing boundaries.
- Migrated the series datasource query parsers to explicit Zod 4, using
  `z.looseObject` for dynamic route query passthrough while leaving series
  entity/template schemas on existing boundaries.
- Migrated the directory-sync internal options normalizer to explicit Zod 4;
  kept plugin config/job/template schemas on existing framework boundaries.
- Migrated the site-builder navigation datasource query parser to explicit Zod 4
  while keeping the framework-provided output schema on the existing boundary.
- Migrated the site-builder Preact section-content record guards to explicit
  Zod 4 while leaving template schema parsing on the existing framework boundary.
- Migrated the shell core entity datasource query parser to explicit Zod 4 while
  keeping the framework-provided output schema on the existing boundary.
- Migrated the shell core AI content datasource generation-context parser and
  local entity slug guard to explicit Zod 4 while keeping template/output schemas
  on existing framework boundaries.
- Migrated media-page-composer render-time content record guards to explicit
  Zod 4 while leaving media template schemas on existing framework boundaries.
- Migrated the social-media generation-handler local source metadata slug guard
  to explicit Zod 4 with `z.looseObject`, while leaving generation job/result
  schemas on the existing job-handler/framework boundary.
- Migrated entity-service list/search option parser schemas to explicit Zod 4;
  these remain local parser guards over service call options, not exported
  framework schema contracts.
- Migrated the conversation-memory projection event payload parser to explicit
  Zod 4 while leaving entity/config/projection schemas on their existing plugin
  boundaries.
- Migrated the entity-service embedding job-data validator to explicit Zod 4;
  the schema remains local to the manual job handler and is not exported or
  composed into the job framework.
- Migrated the MCP service tool-execution message envelope guard to explicit
  Zod 4 while leaving exported tool response schemas on the current framework
  boundary.
- Migrated the content-formatters structured-content markdown text-node guard
  to explicit Zod 4 while keeping formatter constructor schemas on the existing
  caller-provided framework boundary.
- Migrated app resolver package-shape guards for conventional site package
  overrides to explicit Zod 4, using `z.looseObject(...)` and two-argument
  `z.record(...)`, while leaving imported app/site/template schemas on the
  current framework boundary.
- Migrated the email-resend external API response guard to explicit Zod 4 while
  keeping plugin config on the current ServicePlugin config-schema boundary.
- Migrated the ATProto registry validate-lexicon tool's handler-local input
  parser to explicit Zod 4 while keeping the plugin config and framework-facing
  tool input schema on the current main-Zod boundary.
- Migrated the stock-photo search/select tool handler-local input parsers to
  explicit Zod 4, using `z.url()`, while keeping framework-facing tool input
  schemas on the current main-Zod boundary for MCP introspection.
- Migrated the ATProto publish/discovery tool handler-local input parsers to
  explicit Zod 4 while keeping framework-facing tool input schemas on the
  current main-Zod boundary for MCP introspection.
- Migrated the content-pipeline publish tool handler-local input parser to
  explicit Zod 4 while keeping exported/tool-facing input and output schemas on
  the current main-Zod boundary.
- Migrated the site-builder site metadata message response guard to explicit
  Zod 4 while keeping shared site-composition schemas on the current boundary.
- Migrated the A2A client call tool handler-local input parser to explicit Zod
  4 while keeping the tool-facing input schema on the current main-Zod
  boundary.
- Migrated Buttondown external API response guards to explicit Zod 4 while
  leaving plugin config and tool schemas on the current main-Zod boundary.
- Migrated analytics Cloudflare GraphQL response guards to explicit Zod 4 while
  leaving plugin config and tool schemas on the current main-Zod boundary.
- Migrated ATProto handle/DID document network response guards to explicit Zod
  4 while leaving plugin config and projection schemas on their current
  boundaries.
- Migrated stock-photo Unsplash API response guards to explicit Zod 4 while
  leaving provider contracts and tool schemas on their current boundaries.
- Migrated social-media LinkedIn API response guards to explicit Zod 4 while
  leaving provider contracts and publish schemas on their current boundaries.
- Migrated ATProto PDS client external API response guards to explicit Zod 4
  while preserving the existing exported client result interfaces.
- Migrated CMS GitHub OAuth token response guards to explicit Zod 4 while
  keeping the plugin config schema on the current main-Zod boundary.
- Migrated auth-service JSON request-body normalization to explicit Zod 4 while
  leaving OAuth client/session contracts on the current boundary.
- Replaced auth-service OAuth client-store persisted JSON hand guards with
  explicit Zod 4 schemas and `z.url()` request metadata validation.
- Replaced auth-service persisted JSON hand guards for refresh tokens,
  authorization codes, operator sessions, and setup state with explicit Zod 4
  schemas while preserving exact optional output shapes.
- Replaced auth-service passkey store and signing-key JSON hand guards with
  explicit Zod 4 schemas, preserving generated/public JWK output contracts.
- Replaced auth-service WebAuthn clientData challenge JSON hand guard with an
  explicit Zod 4 schema.
- Migrated web-chat browser-side session, message history, and attachment job
  status response guards to explicit Zod 4.
- Replaced web-chat persisted message metadata record hand guard with explicit
  Zod 4 parsing.
- Migrated A2A SSE client event parsing to explicit Zod 4 and replaced the
  public conversation metadata JSON hand guard with the shared Zod 4 coercer.
- Reused the shared conversation metadata coercer in AI conversation history
  upload-ref parsing and migrated the app usage-log line parser to explicit
  Zod 4 schemas.
- Migrated the default YAML content formatter parser to an explicit Zod 4
  record schema.
- Migrated core system tool conversation upload metadata JSON parsing to Zod 4
  record schemas for create/upload-save access checks.
- Migrated shared image frontmatter ID extraction to a Zod 4 record guard.
- Replaced dashboard/widget key-value hand guards and nested stats casts with
  explicit Zod 4 record guards.
- Migrated directory-sync document sidecar and cover-image conversion
  frontmatter record guards to Zod 4.
- Migrated brain CLI self-package version JSON parsing to an explicit Zod 4
  guard.
- Migrated core system update JSON field normalization to explicit Zod 4
  record guards while keeping tool schema types on the main Zod boundary.
- Migrated entity-search metadata and job-progress result JSON parsing to
  explicit Zod 4 record guards while keeping service/job framework schemas on
  their current boundaries.
- Migrated app headless CLI JSON flag parsing to Zod 4 local guards for
  argument arrays and flag records while preserving raw tool-input JSON.
- Migrated ai-evaluation result/summary schemas and comparison baseline JSON
  parsing to explicit Zod 4 while leaving eval fixture/config schemas on their
  existing framework-composed boundary.
- Migrated web-chat UI data-part record access helpers to an explicit Zod 4
  record guard inside the existing UI-local parser island.
- Migrated the web-chat UI progress data guard to an explicit Zod 4 loose
  object schema.
- Migrated content-formatters property access helpers and ai-evaluation dotted
  path lookups to explicit Zod 4 record guards.
- Migrated structured-content formatter path access, app config deep-merge object
  checks, and app CLI diagnostics metadata reads to explicit Zod 4 record
  guards.
- Migrated AI-service confirmation/card upload metadata reads and web-chat stream
  redaction helpers to explicit Zod 4 local record/object guards.
- Tightened core upload-ref conversation metadata checks plus topic/skill
  derivation metadata reads with explicit Zod 4 local guards.
- Replaced local record casts in job log summaries, MCP bridge request/schema
  helpers, and brain.yaml null stripping with explicit Zod 4 record guards.
- Replaced local frontmatter/metadata record casts in conversation-memory,
  identity, site-info, and note adapters/data sources with explicit Zod 4
  guards.
- Replaced entity-service metadata row/frontmatter generation guards and stable
  JSON object traversal casts with explicit Zod 4 local guards.
- Removed remaining local record/preset casts in ai-evaluation plugin eval
  loading and directory-sync watcher job data using explicit guards or string
  literal narrowing.
- Tightened app resolver external-plugin/site-package guards and model package
  JSON reads with explicit Zod 4 schemas; replaced built-in model-name narrowing
  with literal checks.
- Replaced MCP HTTP agent request body and transport logger casts with explicit
  Zod 4 guards, and declared the direct utils workspace dependency.
- Replaced auth-service persisted-store ENOENT error casts with a shared Zod 4
  filesystem error-code guard and removed redundant JSON.parse unknown casts.
- Replaced the site-content route-list message response cast with a Zod 4 local
  guard, preserving the site-builder/framework route schemas on their current
  boundary.
- Replaced the job-queue deduplication metadata cast with a Zod 4 loose-object
  guard while keeping queue option schemas on the current boundary.
- Migrated the new chat interface's raw Discord message and card-output local
  guards to explicit Zod 4 while keeping its config schema on the current
  plugin boundary.
- Replaced new message-interface stored-metadata, confirmation-result, and
  artifact-display record hand guards with explicit Zod 4 local parsers while
  leaving shared agent card schemas on the current public plugin contract
  boundary.
- Replaced ai-evaluation eval-suite YAML record predicate checks with explicit
  Zod 4 parse helpers, and removed redundant `JSON.parse(... ) as unknown`
  casts from shared/CLI JSON response helpers without changing response shapes.
- Replaced the remaining shared ATProto contract record predicate helper with
  an explicit schema parser while keeping the contract schemas on the current
  main-Zod public boundary.
- Started public/framework boundary cleanup by moving shared contracts and
  plugin public contract schema authoring off direct `zod` imports and onto the
  current `@brains/utils` Zod boundary; do not switch these to Zod 4 until their
  composing consumers can move as one unmixed boundary.
- Pointed shared contract, shared site/media/document/image/content schemas,
  messaging-service contract helpers, entity/content/conversation/identity
  service schemas, entity package schemas/templates/data sources, interface
  config/transport schemas, selected site package and Relay site-composition
  schemas, plugin integration config/tool/site-builder schemas, shell
  app/AI/auth/evaluation schemas, brain CLI YAML/schema-mapping helpers, core
  system and config schemas, MCP service and bridge schemas, job-queue,
  runtime-state, template schemas, workspace test schema helpers, plugin public
  contract schema imports, plugin author-facing Zod type references, and
  plugin framework schema/type imports at the explicit
  `@brains/utils/zod` subpath while keeping them on the current main Zod
  boundary.
- Moved the public `@rizom/brain` root `z` export to the centralized
  `@brains/utils/zod` boundary while preserving the generated public declaration
  contract for plugin authors.
- Cleared the remaining direct test import of `zod`; direct `zod` references are
  now limited to the centralized utils export and public API assertions.
- Replaced remaining test `JSON.parse(... as ...)` shape casts with explicit Zod
  4 guards in CLI/ops bootstrap tests, web-chat package metadata assertions,
  Notion header checks, utils logger JSON assertions, conversation metadata
  checks, and social-media LinkedIn request-body assertions.
- Normalized the chat interface Bun type metadata from `latest` to the pinned
  workspace range so `deps:check` stays stable after the merge refresh.
- Cleaned direct Zod package metadata after public contract centralization:
  shared contracts now depend on `@brains/utils`, and plugins no longer declare
  an unused direct `zod` dependency.
- Started Phase 2 boundary migration with `shared/atproto-contracts`: the whole
  package now authors its generated ATProto lexicon/record/event schemas on
  explicit `@brains/utils/zod-v4`, uses Zod 4 record/loose/strict/url helpers,
  removes the prior typed record-schema cast, and validates its only direct
  runtime consumer (`agent-discovery`) without mixing schema trees.
- Use Zod 4 migrations to simplify TypeScript/schema friction where possible,
  not just to swap imports. Defaulted schemas must be audited as two contracts:
  `z.input<typeof schema>` for caller-provided config/options before defaults,
  and `z.output<typeof schema>`/`z.infer<typeof schema>` for parsed values after
  defaults. Do not hide this behind compatibility generic defaults in plugin
  base classes. Plugin base classes should make config input types explicit; if
  a package is not yet audited, spell the temporary debt as `Partial<Config>` at
  the subclass boundary so it remains visible. Other verified examples: object
  fields using `z.unknown()` infer as required under Zod 4, loose objects should
  use `z.looseObject(...)` instead of `.passthrough()`, and record schemas
  should state both key and value schemas explicitly
  (`z.record(z.string(), z.unknown())`).

### Phase 5 — `isolatedDeclarations` after API-boundary cleanup

Revisit `isolatedDeclarations` only after the Zod 4 migration has settled.
The objective is clean public declarations, not making every exported runtime
schema expose its inferred implementation type. Preferred fixes, in order:

1. Stop exporting raw schemas that are not public API; keep them private and
   export typed parser/validator functions instead.
2. For schemas that are intentionally public and parse-only, annotate with a
   domain type such as `z.ZodType<DomainType, ...>` when it preserves behavior.
3. For schemas that callers compose with `.extend()`, `.merge()`, `.shape`,
   etc., treat that as an API design question: either expose an intentional
   schema factory/composition helper, or keep composition inside the owning
   package. Avoid publishing hand-written Zod-internal shape types as the
   solution.
4. Enable and validate one package at a time, with visible manual edits and
   rationale.

## Cadence policy

Re-run the Phase 0 inventory at each release cut. Patch/minor drift gets
swept opportunistically (Phase 1a style); any new major gets an entry in
this doc with a decision — migrate, hold (with reason), or drop the
dependency.
