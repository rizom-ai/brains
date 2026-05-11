# Utils Package Boundary Plan

## Status

In progress. Implementation branch/worktree: `refactor/utils-package-boundaries` at `/home/yeehaa/Documents/brains-utils-package-boundaries`.

## Goal

Turn `@brains/utils` back into a small private primitives package and move domain-specific contracts/helpers to clearer internal homes, while exposing only curated public APIs through `@rizom/brain/*`.

## Decisions

- `@brains/utils` stays private and is not published directly.
- Internal migrations can be breaking inside the worktree; merge only once all imports and checks are green.
- Public consumers should depend on `@rizom/brain` and its subpaths, not private `@brains/*` packages.
- `z` remains centrally re-exported internally, but any public schema helper must be deliberately exposed through `@rizom/brain`.
- Do not add long-lived compatibility shims unless an external published package requires them.

## Target boundaries

### Keep in `@brains/utils`

Generic, low-level primitives:

- Zod re-export/types used internally
- logger types/basic logger utilities
- error helpers
- string/date/array/id/hash helpers
- YAML and markdown primitives
- generic HTTP response helpers
- generic progress helpers if still broadly shared

### Move out of `@brains/utils`

- Ops/deployment/env/cert/CI helpers → private `@brains/deploy-support`, consumed internally by `@rizom/brain` and `@rizom/ops`
- Public/shared schemas and result contracts → internal `@brains/contracts`, then curated `@rizom/brain/*` exports when public
- Entity/site URL helpers and entity field formatters → owning entity/site/content package
- Publish/job contracts → contracts package if shared by multiple domains
- Deck/presentation helpers → decks/presentation-owned package unless proven generic

## Public API rule

`@rizom/brain` remains the public SDK/package. Its generated declarations must not leak `@brains/*` imports.

Candidate public exports should be promoted only from concrete authoring needs, for example:

- schema helper/types needed by plugins/entities
- narrow logger/progress interfaces
- stable entity/template contracts
- markdown/frontmatter helpers only if external authors need them

## Implementation phases

1. Inventory current `@brains/utils` exports and repo imports.
2. Classify each export as primitive, contract, ops, entity/site, presentation, or obsolete.
3. Create/move target internal modules/packages.
4. Update all internal imports in the worktree; no root-compat shims by default.
5. Add or adjust `@rizom/brain/*` curated exports only when needed for public authoring.
6. Fix docs, package metadata, and stale README examples.
7. Run validation before merge.

## Validation

Minimum before merge:

- `bun run typecheck`
- targeted package tests for moved code
- `bun run lint` or targeted lint where practical
- `bun run build --filter=@rizom/brain` or the package build that verifies public declarations do not leak `@brains/*`

## First slice

Start with the least ambiguous moves:

1. Move ops/env/cert/CI helpers out of `@brains/utils` into `@brains/deploy-support`. ✅
2. Move shared result/response/publish/job schemas into a contracts home.
3. Keep primitive helpers and `z` in `@brains/utils`.
4. Update imports repo-wide and run typecheck.

## Open questions

- Should the contracts home be a new `shared/contracts` package or an existing shell/shared package?
- Which schema helpers should be public through `@rizom/brain` versus internal only?
- Are any official plugin/entity packages about to be published separately, requiring stricter public-only imports now?
