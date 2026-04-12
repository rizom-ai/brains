# Plan: Site Builder Decoupling

## Problem

The site-builder plugin couples two concerns: plugin orchestration (tools, events, job queue) and the build engine (rendering, CSS, file I/O). This makes the engine untestable in isolation and prevents architectural improvements like parallel route rendering.

Additionally, routes render sequentially — each waits for content resolution and Preact rendering before the next starts. With 30+ routes, this is the main performance bottleneck.

## Goals

1. **Decouple** — extract the build engine into `@brains/site-engine`, zero plugin dependencies
2. **Parallelize** — render routes concurrently using `pLimit` from `@brains/utils`

## Current Architecture

```
SiteBuilderPlugin (plugin.ts)
  ├── RebuildManager         — entity events → job queue
  ├── SiteBuildJobHandler    — job queue → SiteBuilder.build()
  ├── RouteRegistry          — in-memory route storage (no plugin deps)
  ├── UISlotRegistry         — component registry (no plugin deps)
  ├── DynamicRouteGenerator  — entity types → routes (needs entityService)
  ├── SiteBuilder            — orchestrates full build (needs context.templates, context.views)
  │   ├── ImageBuildService  — fetch + optimize images (needs entityService)
  │   └── PreactBuilder      — render routes to HTML, run Tailwind, write files
  │       ├── HydrationManager
  │       ├── TailwindCSSProcessor (PostCSS — async)
  │       └── HeadCollector, HTML generator
  └── SEO file handler       — robots.txt, sitemap, CMS config
```

**Sequential bottleneck** (`preact-builder.ts` line 61-64):

```typescript
for (const route of context.routes) {
  await this.buildRoute(route, context, siteInfo);
}
```

Each `buildRoute` call: resolve section content (async DB) → create Preact components → `render()` (sync) → write file (async I/O). These are independent per route.

## Design

### Package split

**`@brains/site-engine`** (new, in `shared/site-engine/`) — standalone build engine:

- RouteRegistry, UISlotRegistry, NavigationDataSource
- PreactBuilder, HydrationManager, TailwindCSSProcessor
- ImageBuildService, ImageOptimizer
- DynamicRouteGenerator
- SiteBuilder (refactored)
- HTML generator, HeadCollector, image utils

**`plugins/site-builder`** — thin orchestration plugin:

- SiteBuilderPlugin (tools, resources, event subscriptions)
- RebuildManager (entity events → job queue)
- SiteBuildJobHandler (job queue → engine)
- SEO file handler (cross-plugin messaging)

### Interface between them

```typescript
interface SiteEngineServices {
  resolveContent: (
    templateName: string,
    options?: ResolutionOptions,
  ) => Promise<unknown>;
  getViewTemplate: (name: string) => ViewTemplate | undefined;
  listEntities: (type: string) => Promise<BaseEntity[]>;
  getEntity: (type: string, id: string) => Promise<BaseEntity | null>;
  getEntityTypes: () => string[];
  logger: Logger;
}
```

Plugin creates this from its context:

```typescript
const engine = createSiteEngine({
  resolveContent: context.templates.resolve,
  getViewTemplate: context.views.get,
  listEntities: (type) => context.entityService.listEntities(type),
  getEntity: (type, id) => context.entityService.getEntity(type, id),
  getEntityTypes: () => context.entityService.getEntityTypes(),
  logger: context.logger,
});
```

### Parallel route rendering

Replace the sequential loop with `pLimit`:

```typescript
import { pLimit } from "@brains/utils";

const limit = pLimit(4);

await Promise.all(
  context.routes.map((route) =>
    limit(async () => {
      onProgress(`Building route: ${route.path}`);
      await this.buildRoute(route, context, siteInfo);
    }),
  ),
);
```

Routes are independent — different paths, different output files, different content. The only shared state is the logger and `context.getContent` (which does DB reads — safe for concurrent access).

Tailwind runs after all routes complete (it scans generated HTML), so parallelizing routes doesn't affect CSS processing.

## Steps

### Phase 1: Parallel route rendering

Do this first — immediate performance win, minimal risk.

1. Add `pLimit` import to `preact-builder.ts`
2. Replace sequential `for...of` with `pLimit(4)` + `Promise.all`
3. Verify no shared mutable state between `buildRoute` calls
4. Test: build output is identical, timing improves
5. Tune concurrency limit (4 is a safe starting point)

### Phase 2: Create `@brains/site-engine` package

1. Create `shared/site-engine/` with package.json, tsconfig
2. Define `SiteEngineServices` interface
3. Move the already-independent files first: RouteRegistry, UISlotRegistry, NavigationDataSource, PreactBuilder, HydrationManager, TailwindCSSProcessor, ImageOptimizer, image utils, HTML generator, HeadCollector
4. Update imports in plugin
5. Tests pass

### Phase 3: Refactor SiteBuilder for callback injection

1. Change SiteBuilder to accept `SiteEngineServices` instead of `ServicePluginContext`
2. Replace `context.templates.resolve()` → `services.resolveContent()`
3. Replace `context.views.get()` → `services.getViewTemplate()`
4. Replace entity service calls → `services.listEntities()` / `services.getEntity()`
5. Same for DynamicRouteGenerator and ImageBuildService
6. Move refactored files to `@brains/site-engine`
7. Tests pass

### Phase 4: Plugin becomes orchestration-only

1. Plugin creates `SiteEngineServices` from its context
2. All build logic goes through the engine
3. Remove `ServicePluginContext` from `BuildContext` interface
4. Plugin only handles: tools, events, job queue, SEO
5. Tests pass

### Phase 5: Evaluate Astro as rendering engine

The `SiteEngineServices` interface is renderer-agnostic. After Phases 2-4, swapping the rendering engine means implementing a new builder behind the same interface — the plugin doesn't change.

Astro is a strong candidate because:

- **Content Collections** map naturally to our entity types — each entity type becomes a collection, each entity a content entry
- **Island architecture** replaces our manual HydrationManager — interactive Preact components become `client:load` islands with zero custom hydration code
- **Built-in image optimization** (`astro:assets`) replaces ImageBuildService + Sharp pipeline
- **Tailwind v4 integration** is native — no custom TailwindCSSProcessor
- **File-based routing** could replace RouteRegistry for static routes, with dynamic routes via `getStaticPaths()`
- **Built-in SSG** with incremental builds — only re-renders changed pages

#### What an Astro adapter would look like

```typescript
class AstroSiteEngine implements SiteEngine {
  async build(
    config: BuildConfig,
    progress?: ProgressReporter,
  ): Promise<BuildResult> {
    // 1. Write entity data to Astro content collections (JSON/MD files)
    // 2. Generate astro.config.ts from BuildConfig
    // 3. Run `astro build` as subprocess
    // 4. Return build result
  }
}
```

The key question: can Astro consume our entities as content collections without copying files? Options:

- **Content layer API** (Astro 5+) — define loaders that read from our DB or entity service at build time
- **File-based** — write entities to `src/content/` before build, Astro reads them naturally
- **Custom integration** — Astro integration that injects routes and data programmatically

#### What we'd keep from Phases 2-4

- `SiteEngineServices` interface — Astro adapter implements it
- RouteRegistry — still useful for tracking what routes exist
- UISlotRegistry — still useful for plugin-contributed UI slots
- Plugin orchestration — tools, events, job queue unchanged

#### What Astro replaces

- PreactBuilder, HydrationManager, HeadCollector, HTML generator
- TailwindCSSProcessor
- ImageBuildService, ImageOptimizer
- Custom CSS processing pipeline

#### Steps

1. Spike: create minimal Astro project that reads from `SiteEngineServices` and renders one entity type
2. Evaluate: build time, output quality, developer experience, migration effort
3. If viable: implement `AstroSiteEngine`, run in parallel with `PreactBuilder` for comparison
4. Migrate route types one at a time (homepage → entity lists → entity detail → custom pages)
5. Remove Preact builder when all routes are migrated

#### Risks

- **Component migration** — existing Preact view templates need porting to Astro components (or kept as Preact islands)
- **Theme system** — our CSS variable / `@theme inline` system needs to work inside Astro's build pipeline
- **Build subprocess** — `astro build` runs as a separate process, progress reporting needs bridging
- **Content layer maturity** — Astro's content layer API is relatively new, custom loaders may have edge cases

## Files affected

| Phase | Files | Nature                                                           |
| ----- | ----- | ---------------------------------------------------------------- |
| 1     | 1-2   | pLimit in preact-builder, possibly test update                   |
| 2     | ~15   | Move decoupled files, update imports                             |
| 3     | ~5    | Refactor SiteBuilder + DynamicRouteGenerator + ImageBuildService |
| 4     | ~3    | Plugin wiring, BuildContext cleanup                              |
| 5     | ~20   | Astro spike, adapter implementation, component migration         |

## Verification

### Phases 1-4

1. `bun test` — all tests pass
2. `bun run typecheck` clean
3. Build output is byte-identical before and after (diff output dirs)
4. `@brains/site-engine` has zero imports from `@brains/plugins`
5. `plugins/site-builder` has no rendering or file-writing code
6. Route rendering is concurrent (observable via progress messages)

### Phase 5

7. Astro spike renders at least one entity type with correct output
8. Astro adapter implements `SiteEngine` interface — plugin code unchanged
9. Generated site passes visual diff against Preact builder output
10. Build time is comparable or better than Preact builder
