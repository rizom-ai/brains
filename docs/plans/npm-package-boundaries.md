# NPM Package Boundary Plan

## Status

Draft. This plan narrows the publishing target before more package refactors.
It complements the external plugin API work in [`external-plugin-api.md`](./external-plugin-api.md) and the generated public contract rules in [`public-plugin-contracts.md`](./public-plugin-contracts.md).

## Goal

Make official plugins/entities publishable to npm without exposing internal workspace packages as part of the public authoring contract.

The public contract should answer two questions:

1. What packages can an external plugin author depend on?
2. What packages can an official publishable plugin/entity package depend on?

## Package tiers

### Tier 1: public runtime package

- `@rizom/brain`

This is the installed product and public authoring package. It owns the stable plugin-authoring subpaths already planned/documented under `@rizom/brain/*`.

### Tier 2: public authoring subpaths

Published from `@rizom/brain`, not separate `@brains/*` npm packages unless a later need proves otherwise:

- `@rizom/brain/plugins`
- `@rizom/brain/entities`
- `@rizom/brain/services`
- `@rizom/brain/interfaces`
- `@rizom/brain/templates`
- optional future `@rizom/brain/ui` or equivalent template/UI subpath

These subpaths are the SDK. They must have generated declarations with no `@brains/*` imports.

### Tier 3: official publishable plugin/entity packages

Examples:

- `@brains/topics`
- `@brains/blog`
- `@brains/link`
- `@brains/note`
- `@brains/decks`
- `@brains/social-media`

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
- keep external examples importing `zod` directly unless we deliberately expose a blessed schema helper

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

Start with `@brains/topics` because its recent refactor exposed the boundary problems.

### 2. Expand public entries only from concrete needs

Add exports to `@rizom/brain/*` one small slice at a time. Each slice must satisfy the public contract rules:

- generated declarations contain no `@brains/*` imports
- external fixture or official plugin typecheck proves usage
- no shell/app implementation classes leak through the API

### 3. Convert one official plugin to public-only imports

Use `@brains/topics` as the first proof package.

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

## Suggested first worktree

Branch/worktree:

```bash
refactor/npm-package-boundaries
```

First implementation slice:

1. inventory `@brains/topics` imports
2. map each non-relative import to a public/private decision
3. add only the smallest missing `@rizom/brain/*` public exports needed by topics
4. convert topics imports
5. run targeted typecheck/tests/evals plus Rover eval

## Open questions

- Should official packages keep the `@brains/*` scope on npm, or move to `@rizom/brain-plugin-*` names?
- Should `zod` be imported directly by plugins, or should the SDK expose a blessed `z`?
- Is a UI/template public surface needed before publishing TSX-heavy entity packages?
- Which official packages are actually npm targets for the first public release?
- Do official plugin packages publish from this monorepo, or are some extracted into separate repos?

## Success criteria

- The public authoring contract is `@rizom/brain/*`, not internal `@brains/*` packages.
- At least one official entity package builds and typechecks using only public authoring imports.
- Generated public declarations contain no `@brains/*` imports.
- Enforcement prevents regressions after the first package migration.
- Public docs explain what external and official plugin packages may depend on.
