# Plan: Rizom Site Composition

## Status

This refactor is effectively complete.

Current ownership is now:

- `@brains/site-rizom-ai` owns the final `rizom.ai` site composition
- `@brains/site-rizom-foundation` owns the final `rizom.foundation` site composition
- `@brains/site-rizom-work` owns the final `rizom.work` site composition

The old shared `sites/rizom` package has been removed.

## Shared package split

Shared Rizom code now lives in dedicated shared packages:

- `@brains/rizom-ui`
  - frame/layout primitives
  - shared UI primitives
  - `ProductCard`
- `@brains/rizom-runtime`
  - shared runtime plugin base
  - boot script
  - canvas assets
  - shared base site package
- `@brains/rizom-ecosystem`
  - family-owned ecosystem section
  - schema, formatter, template
  - `createEcosystemContent()`
- `@brains/theme-rizom`
  - shared Rizom theme tokens

## Result

The architecture now matches the intended ownership model:

- wrappers are the real sites
- shared code lives in proper shared packages
- there is no longer a pseudo-site/base hybrid package under `sites/rizom`
- there is no higher-order layout helper or shared shell object architecture

## App state

### `rizom.ai`

Owns:

- wrapper layout
- AI routes
- AI templates/sections
- AI wrapper plugin
- tracked site content

### `rizom.foundation`

Owns:

- wrapper layout
- foundation routes
- foundation templates/sections
- foundation wrapper plugin
- tracked site content

### `rizom.work`

Owns:

- wrapper layout
- work routes
- work templates/sections
- work wrapper plugin
- tracked site content

## Remaining work

What remains is no longer site-ownership cleanup. It is now mostly:

- product/content backlog tracked in `docs/plans/rizom-site-tbd.md`
- eventual standalone extraction of each app repo
- optional cleanup of docs/examples that still describe the removed transitional package

## Extraction direction

When each app is extracted from the monorepo, the target shape stays the same:

- app-local site composition
- shared reuse through `rizom-ui`, `rizom-runtime`, `rizom-ecosystem`, and `theme-rizom`
- no reintroduction of a monolithic shared site package

## Verification

This refactor is considered complete because:

1. wrappers own final layout, routes, and templates
2. shared code is split into real shared packages
3. the old `sites/rizom` compatibility package is gone
4. validation passes for the touched shared packages and wrappers

## Related

- `docs/plans/rizom-site-tbd.md`
- `docs/plans/public-release-cleanup.md`
