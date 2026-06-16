# NPM Package Boundary Plan

## Status

Accepted direction. Near-term: the external authoring path is already alpha-usable through `@rizom/brain/*`, and this plan narrows the publishing target before more official package refactors and broader external adoption. Builds on the now-landed external plugin API and the generated `@rizom/brain/*` public contract.

Fact-checked against the tree 2026-06-10:

- The public subpaths exist and exceed the Tier 2 list below: `@rizom/brain` (packages/brain-cli) ships `./plugins`, `./entities`, `./services`, `./interfaces`, `./templates`, plus `./site`, `./themes`, `./deploy`, and the `./cli` bin.
- Declaration cleanliness is already guarded: `packages/brain-cli/scripts/declaration-leaks.ts` fails the build when generated declarations contain `@brains/*` imports.
- dependency-cruiser is configured (`bun run arch:check`) with layering rules (no-circular, plugins-can-only-import-shell-and-shared, no plugin-to-plugin, …) — but not yet the published-official-plugin dependency rule from migration step 4.
- The blessed `z` root export (utils section below) is **not yet implemented** — no public entry exports `z`.
- Milestone A has not started: `@brains/note` still depends on five private workspaces (`@brains/plugins`, `@brains/contracts`, `@brains/atproto-contracts`, `@brains/document`, `@brains/utils`).

New external-facing plugin/entity work should not add private `@brains/*` shortcut imports when a suitable public `@rizom/brain/*` surface exists or should be added. Existing packages can migrate package-by-package, but new work should move toward the public-only shape instead of deepening private coupling.

## Goal

Make official plugins/entities publishable to npm without exposing internal workspace packages as part of the public authoring contract.

The public contract should answer two questions:

1. What packages can an external plugin author depend on?
2. What packages can an official publishable plugin/entity package depend on?

## Publishing source

Official plugin/entity packages should publish from this monorepo first. Extract packages to separate repositories only when independent lifecycle, ownership, or community-maintenance needs justify the extra release infrastructure.

## Naming convention

Public plugin packages should use distinctive Rizom Brain names for npm discovery:

- official packages: `@rizom/brain-plugin-*`, for example `@rizom/brain-plugin-note`
- scoped third-party packages: `@scope/rizom-brain-plugin-*`, for example `@yeehaa/rizom-brain-plugin-calendar`
- unscoped third-party packages: `rizom-brain-plugin-*`

Recommended discovery keywords:

```json
["rizom", "rizom-brain", "rizom-brain-plugin"]
```

Keep `@brains/*` as the private workspace/internal implementation scope, not the public npm plugin namespace.

## Package tiers

### Tier 1: public runtime package

- `@rizom/brain`

This is the installed product and public authoring package. It owns the stable plugin-authoring subpaths already planned/documented under `@rizom/brain/*`.

### Tier 2: public authoring subpaths

Published from `@rizom/brain`, not separate `@brains/*` npm packages unless a later need proves otherwise. Shipping today (2026-06-10):

- `@rizom/brain/plugins`
- `@rizom/brain/entities`
- `@rizom/brain/services`
- `@rizom/brain/interfaces`
- `@rizom/brain/templates`
- `@rizom/brain/site`
- `@rizom/brain/themes`
- `@rizom/brain/deploy`
- optional future `@rizom/brain/ui` or equivalent template/UI subpath

These subpaths are the SDK. They must have generated declarations with no `@brains/*` imports (enforced by `scripts/declaration-leaks.ts`).

Subpath curation rule (decided 2026-06-10): the list above is the
registry. Adding a subpath requires a named concrete consumer (a
package or fixture that needs it today, not speculatively), a
declaration-leak-clean build, and an edit to this list in the same
change. `./site`, `./themes`, and `./deploy` are ratified retroactively
— they serve brain definitions, site skins, and fleet deploy. Anything
that can't name its consumer stays internal; this rule exists so the
SDK doesn't accrete the way `@brains/utils` did.

### Tier 3: official publishable plugin/entity packages

Examples:

- internal workspace: `@brains/note` → public package: `@rizom/brain-plugin-note`
- internal workspace: `@brains/topics` → public package: `@rizom/brain-plugin-topics`
- internal workspace: `@brains/blog` → public package: `@rizom/brain-plugin-blog`
- internal workspace: `@brains/link` → public package: `@rizom/brain-plugin-link`
- internal workspace: `@brains/decks` → public package: `@rizom/brain-plugin-decks`
- internal workspace: `@brains/social-media` → public package: `@rizom/brain-plugin-social-media`

These packages may be published as official plugins, but they should consume only the same public authoring contract available to external plugins.

Allowed dependencies for published official plugins:

- `@rizom/brain` public subpaths
- normal third-party npm dependencies
- optional public UI/template package or subpath once defined

Disallowed dependencies for published official plugins:

- shell internals
- app internals
- private `@brains/*` workspaces
- internal shared packages such as `@brains/utils` unless intentionally promoted to a public npm package

### Tier 4: private internal workspaces

Examples:

- `@brains/utils`
- `@brains/ui-library`
- shell service implementations
- registries, storage adapters, DB helpers, test harnesses

These may remain workspace-internal implementation details. They can be used by the runtime package and internal implementation code, but should not appear in published plugin package dependencies or generated declarations.

## Decision: do not publish `@brains/utils` as the SDK

`@brains/utils` is currently useful, but publishing it directly would freeze an accidental grab bag as public API. Instead:

- keep `@brains/utils` private/internal for now
- promote only proven stable utilities into curated `@rizom/brain/*` subpaths
- expose a blessed `z` from the root `@rizom/brain` export for plugin/entity schema authoring, avoiding schema-version skew without publishing all utilities (**not yet implemented** as of 2026-06-10 — no public entry exports `z`; this is a prerequisite for the `@brains/note` proof since note's schemas import `z` from `@brains/utils`)

### Zod version policy (decided 2026-06-10)

The blessed `z` cannot diverge from the workspace zod: the public
subpaths re-export schemas built with the workspace `z`, and mixing zod
majors in author code produces incompatible schema classes. So:

1. The blessed `z` **is** the workspace zod — v3 today. Plugin packages
   must not declare their own `zod` dependency; they use the blessed
   export exclusively (enforce with the step-4 dependency rules). The
   zod major becomes an SDK internal that authors inherit.
2. The repo-wide zod 4 migration is a **release blocker for the first
   stable (non-alpha) `@rizom/brain`**: during alpha the v3→v4 break is
   acceptable churn; after a stable release it is a breaking public API
   change. Do not ship a stable SDK on v3.
3. Sequencing and mechanics live in
   `external-dependency-review.md` (pin bump to `^3.25.x` first, which
   every upstream peer accepts and which unlocks zod's incremental
   `zod/v4` migration path).

The internal grab-bag has already been broken up: ops/env/cert moved to `@brains/deploy-support`, shared contracts to `@brains/contracts`, presentation/UI helpers to `@brains/ui-library`, entity URL/preview helpers to `@brains/site-composition`, formatters to `@brains/content-formatters`, and image markdown to `@brains/image`. Remaining boundary work is the curation question below: deciding which of the surviving `@brains/utils` primitives belong on the public `@rizom/brain/*` surface.

Candidate utilities to promote deliberately:

- public schema helpers that are part of entity/plugin contracts
- `Logger` type or a narrow public logger interface
- `ProgressReporter` type if plugin authors implement jobs
- stable ID helpers only if official plugins cannot avoid them
- frontmatter/markdown helpers required by entity adapters
- public error/result helpers used by tools/jobs

Non-candidates for promotion without more review:

- broad formatting internals
- filesystem/path helpers
- package build helpers
- internal process/env helpers
- implementation-specific logger constructors

## Decision: keep UI private until there is a narrow public surface

`@brains/ui-library` should not become a default dependency for publishable entity packages just because TSX templates need components.

Preferred direction:

1. expose a narrow template/rendering surface from `@rizom/brain/templates`; or
2. add a deliberate public UI subpath/package once template needs stabilize.

Until then, avoid moving more entity packages onto direct `@brains/ui-library` dependencies unless the package is still explicitly internal-only.

## Import policy matrix

| Importer                           | Allowed imports                                                                    | Forbidden imports                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| External plugin package            | `@rizom/brain/*`, third-party deps                                                 | `@brains/*`, shell/app internals                    |
| Official publishable plugin/entity | `@rizom/brain/*`, third-party deps, approved public UI surface                     | shell/app internals, private `@brains/*` workspaces |
| `@rizom/brain` public entries      | curated contract modules only                                                      | exports that leak `@brains/*` declarations          |
| Internal runtime implementation    | internal workspaces as needed                                                      | leaking internal types through public entries       |
| Tests/fixtures                     | public entries for external-authoring tests; internal harnesses for internal tests | using internal imports in public fixture tests      |

## Migration strategy

### 1. Inventory official plugin dependencies

For each candidate official plugin/entity package, classify imports as:

- already public via `@rizom/brain/*`
- should be promoted to public contract
- should remain internal and be replaced by a local implementation or different abstraction
- should move to third-party dependency

Start with `@brains/note` because it is the smallest proof package: no TSX/UI dependency and only a narrow set of plugin/entity, contract, and utility imports to replace. Use `@brains/topics` later as a second-stage proof once the UI/template and formatter boundaries are clearer.

### 2. Expand public entries only from concrete needs

Add exports to `@rizom/brain/*` one small slice at a time. Each slice must satisfy the public contract rules:

- generated declarations contain no `@brains/*` imports
- external fixture or official plugin typecheck proves usage
- no shell/app implementation classes leak through the API

### 3. Convert one official plugin to public-only imports

Use `@brains/note` as the first proof package.

Acceptance for that package:

- package source imports no private `@brains/*` workspaces except its own package-relative imports
- package declarations/build output do not require private workspaces
- unit tests, package evals, and Rover evals still pass

### 4. Add enforcement

Once one package proves the shape, add dependency-cruiser or lint rules:

- published official plugins cannot import private workspaces
- public entry declarations cannot contain `@brains/*`
- external plugin fixture cannot import `@brains/*`

### 5. Repeat package by package

Refactor packages in isolated worktrees, one package at a time. Do not combine public SDK expansion, dependency enforcement, and multiple package migrations in one PR unless the change is purely mechanical and already proven.

Sequencing gate (decided 2026-06-10): the `@brains/note` proof
(Milestone A) waits only for the blessed `z` — note already extends the
public `EntityPlugin`, so its migration is an import swap. But before
rolling out to the remaining entity packages, design the
adapter/handler scaffolding helpers from the related-finding section
below and land them on the public surface — otherwise twenty-plus
packages get migrated twice (once raw, once onto the helpers).

## Suggested first worktree

Branch/worktree:

```bash
refactor/npm-package-boundaries
```

### Milestone A: non-UI publish-path proof

First implementation slice:

1. inventory `@brains/note` imports
2. map each non-relative import to a public/private decision
3. add only the smallest missing `@rizom/brain/*` public exports needed by note
4. convert note imports
5. run targeted typecheck/tests/evals plus Rover eval

This milestone intentionally avoids the UI/template question. It proves the official-package dependency model, public SDK gaps, declaration cleanliness, and package-build shape without freezing a broader UI surface.

### Milestone B: UI/template publishing decision

Immediately after the non-UI proof, choose the public surface for TSX-heavy official packages. Do not publish `@brains/ui-library` as-is just to unblock plugins. Decide from concrete package needs among:

1. package-local TSX/components plus `preact`,
2. reusable components in `@rizom/ui`, and/or
3. narrow renderer/template contracts from `@rizom/brain/templates`.

Then migrate the first UI-heavy package as the second proof before broad package-by-package rollout.

## First release scope

No official plugin/entity packages are targets for the first public release. The first public release remains centered on `@rizom/brain` and its public authoring subpaths.

`@brains/note` is the first proof package for the later official-plugin publishing path, not a required first-release package.

The UI/template public-surface decision is not needed before the non-UI `@brains/note` proof. It must be made in Milestone B before publishing TSX-heavy official packages.

## Success criteria

- The public authoring contract is `@rizom/brain/*`, not internal `@brains/*` packages.
- At least one official entity package builds and typechecks using only public authoring imports.
- Generated public declarations contain no `@brains/*` imports.
- Enforcement prevents regressions after the first package migration.
- Public docs explain what external and official plugin packages may depend on.

## Related finding: plugin and entity authoring boilerplate (audit 2026-06-10)

A shell-layer refactoring audit surfaced duplication this plan's public
authoring surface should absorb when the SDK shape is curated:

- Five plugins carry 240–794-line `plugin.ts` files repeating the same
  config-schema/refine/registration pattern (`plugins/cms` 794,
  `plugins/atproto` 599, `plugins/site-builder` 359, `plugins/dashboard`
  276, `plugins/directory-sync` 240).
- The `entities/` packages share the `EntityPlugin` base (18 of 22
  extend it, and it is already exported from `@rizom/brain/plugins`) —
  but each reimplements the layer above it: adapter wiring, handler
  composition, and schema introspection.

The remaining duplication wants helpers in that layer (adapter/handler
scaffolding), surfaced through `@rizom/brain/*`. Designing them as part
of the public contract (rather than retrofitting later) keeps official
packages on the public surface from day one.
