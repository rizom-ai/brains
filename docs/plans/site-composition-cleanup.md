# Plan: Site-Composition Cleanup

## Status

Follow-up to `cd6b773d1 refactor(site-builder): decouple build engine boundaries`. The decoupling landed but two structural smells remain in the touched area.

## Goal

1. Split `shared/site-composition/src/index.ts` (368 lines, 5+ concerns) into focused modules under the same package.
2. Replace the `entityDisplay` parameter that threads through six files in `plugins/site-builder/src/lib/` with a single build-pipeline context value.

## Non-goals

- Do not change the public surface of `@brains/site-composition`. Consumers keep importing from the package root; the index becomes a barrel.
- Do not change message-bus channels, schemas, or runtime behavior.
- Do not generalize the build-pipeline context into a base abstraction reused by other plugins.
- Do not move `SiteCompositionPlugin` out of the package — it lives there to break a circular dep with `@brains/plugins`.

## Current state

### `shared/site-composition/src/index.ts` (368 lines)

Mixes these concerns in one file:

- `SiteCompositionPlugin` minimal plugin shape (lines 4-14)
- Section/Route/Navigation schemas + types (17-114)
- Route registry payloads + responses + `NavigationItem` (91-131)
- Site metadata schemas + bus channel constants (137-167)
- `SiteLayoutInfo` runtime shape (184-196)
- `SitePackage` contract + `extendSite` + `sitePackageSchema` + `themeCssSchema` (226-368)

Importers reach into `@brains/site-composition` for any of the above, so we have flexibility in how we split internally.

### `entityDisplay` threading

`EntityDisplayMap` is config-time data (label/pluralName/layout/paginate/navigation per entity type) computed once and read everywhere downstream. It currently appears as an explicit `entityDisplay?: EntityDisplayMap | undefined` field on:

- `site-builder.ts` constructor + private field (passed in by plugin)
- `run-site-build.ts:RunSiteBuildOptions`
- `generate-site-routes.ts:GenerateSiteRoutesOptions`
- `create-build-context.ts:CreateBuildContextOptions`
- `content-resolver.ts:SiteContentResolverOptions`
- `content-enrichment.ts:ContentEnrichmentOptions`

Every options bag forwards it untouched to the next layer. The same pattern applies to `services`, `logger`, `routeRegistry`, `profileService` — they all thread through the same call chain. `entityDisplay` is the most visible because it's the only one that's explicitly optional and has no inherent ownership.

## Proposed approach

### Part A — Split `site-composition/src/index.ts`

Restructure the package into:

```
shared/site-composition/src/
  plugin.ts            # SiteCompositionPlugin
  routes.ts            # Section, Route, Navigation schemas + payloads + responses + NavigationItem
  metadata.ts          # site metadata schemas + channel constants + SiteLayoutInfo
  package.ts           # SitePackage, extendSite, sitePackageSchema, themeCssSchema
  index.ts             # barrel re-exports for backward compat
```

Each file should be self-contained or import only from its in-package siblings. `index.ts` is a pure re-export file.

After the split, scan importers in `plugins/site-builder`, `shell/plugins`, `entities/site-info`, `sites/*` for any that should switch to the deeper imports for clarity — but a flat `from "@brains/site-composition"` everywhere is also fine.

### Part B — Build-pipeline context

Introduce a `BuildPipelineContext` interface holding the cross-cutting values that thread through the chain:

```ts
interface BuildPipelineContext {
  logger: Logger;
  services: SiteBuilderServices;
  routeRegistry: RouteRegistry;
  profileService: SiteBuildProfileService;
  entityDisplay: EntityDisplayMap | undefined;
}
```

`SiteBuilder` builds this once in its constructor. Each helper in `plugins/site-builder/src/lib/` takes the context plus its own narrow inputs:

- `runSiteBuild(context, buildOptions, progress)`
- `generateSiteRoutes(context)`
- `createBuildContext(context, { routes, parsedOptions, buildOptions, imageBuildService, siteMetadata })`
- `resolveSiteSectionContent(section, route, publishedOnly, context, imageBuildService)`
- `enrichWithUrls(data, context, imageBuildService)`

This collapses ~5 redundant `?: EntityDisplayMap | undefined` fields and removes the "every options bag is everything the caller knows" smell flagged in the quality review.

## Validation

- `bun run typecheck` clean across `shared/site-composition`, `plugins/site-builder`, `shell/plugins`, `entities/site-info`, `sites/*`.
- `bun test plugins/site-builder/test` — 94 tests still pass.
- No behavior change: route generation, content resolution, image enrichment, navigation, and metadata flow are unchanged.
- Spot-check that importers haven't broken in the affected app packages.

## Exit criteria

- `shared/site-composition/src/index.ts` is a barrel under ~30 lines.
- No file in `plugins/site-builder/src/lib/` declares an `entityDisplay?:` field on its own options interface.
- `BuildPipelineContext` is the single carrier of the cross-cutting build dependencies.
- Test count and assertions unchanged.

## Risk and tradeoffs

- The split is mostly a move with re-exports; risk is low but importer count is large (search shows ~30 files import from `@brains/site-composition`).
- The pipeline context is a real refactor of internal call signatures. Rolling it out incrementally (helper-by-helper) keeps each diff reviewable.
- Combining both parts into a single PR is fine if they land within one or two sessions; otherwise split — Part A is an internal package change, Part B is a plugin-internal change.
