# Extract Site Content from Site-Builder

## Context

Site-builder currently has too many responsibilities: route management, template registration, site building (rendering to HTML), content generation orchestration, and content persistence. The content generation concern (entity type, adapter, generate tool, orchestration) should be its own plugin to reduce coupling.

This is a good time because almost nothing depends on site-content yet (1 entity across all apps).

## Current Architecture

```
site-builder plugin
├── Routes & building (core responsibility)
│   ├── RouteRegistry — defines site structure
│   ├── SiteBuilder — renders routes to HTML
│   └── getContentForSection() — reads saved content during builds
│
├── Content generation (should be separate)
│   ├── site-content entity type + schema + adapter
│   ├── site-builder_generate tool
│   ├── SiteContentService → SiteContentOperations
│   └── GenerateOptionsSchema / GenerateResultSchema
│
└── Other (stays)
    ├── SiteInfoService, UISlotRegistry, layouts
    └── SiteBuildJobHandler, NavigationDataSource
```

The generation orchestration (`SiteContentOperations`) depends on `RouteRegistry` to iterate routes/sections. This is the main coupling point.

## Target Architecture

```
site-content plugin (NEW — @brains/site-content)
├── Entity: site-content type + schema + adapter
├── Tool: site-content_generate
├── Orchestration: SiteContentOperations
└── Schemas: GenerateOptionsSchema / GenerateResultSchema

site-builder plugin (slimmed down)
├── Routes & building (unchanged)
│   ├── RouteRegistry
│   ├── SiteBuilder
│   └── getContentForSection() — queries site-content entities (unchanged)
│
├── Exposes route definitions to site-content plugin via messaging
│   └── Publishes routes on "site-builder:routes:list" message
│
└── Other (unchanged)
    ├── SiteInfoService, UISlotRegistry, layouts
    └── SiteBuildJobHandler, NavigationDataSource
```

## How the Coupling Breaks

**Problem**: `SiteContentOperations` calls `routeRegistry.list()` to know what sections exist.

**Solution**: Site-builder publishes its route definitions via messaging. Site-content plugin queries them.

```typescript
// In site-builder — expose routes via messaging
context.messaging.subscribe("site-builder:routes:list", async () => {
  return { success: true, data: routeRegistry.list() };
});

// In site-content — query routes when generating
const response = await context.messaging.send("site-builder:routes:list", {});
const routes = response.data;
```

This is the standard cross-plugin communication pattern already used elsewhere in the codebase.

**Build-time consumption is already decoupled**: `SiteBuilder.getContentForSection()` just calls `context.templates.resolve()` with `savedContent: { entityType: "site-content", entityId }`. It doesn't import anything from the content plugin — it only needs to know the entity type name and ID convention.

## Step 0: Move route types to `@brains/plugins`

**Move**: `plugins/site-builder/src/types/routes.ts` → `shell/plugins/src/types/routes.ts`

This file contains `RouteDefinitionSchema`, `SectionDefinitionSchema`, `NavigationMetadataSchema`, and the message payload schemas. These are already used by external plugins (`plugins/decks` imports `RouteDefinition` from `@brains/site-builder-plugin`).

After the move:

- `@brains/plugins` exports route types
- `@brains/site-builder-plugin` re-exports them for backward compatibility
- `plugins/decks`, `plugins/blog`, and the new `site-content` plugin all import from `@brains/plugins`
- All internal site-builder imports update to `@brains/plugins`

## Step 1: Create `plugins/site-content/` package

```
plugins/site-content/
├── package.json          # depends on @brains/plugins, @brains/utils
├── tsconfig.json
├── src/
│   ├── index.ts          # Plugin export
│   ├── plugin.ts         # ServicePlugin implementation
│   ├── schemas/
│   │   └── site-content.ts   # Entity schema (moved from site-builder/src/types.ts)
│   ├── adapters/
│   │   └── site-content-adapter.ts  # Moved from site-builder
│   ├── tools/
│   │   └── index.ts      # generate tool (was site-builder_generate)
│   └── lib/
│       ├── site-content-operations.ts  # Moved from site-builder
│       └── site-content-service.ts     # Moved from site-builder
├── test/
│   ├── adapters/
│   │   └── site-content-adapter.test.ts  # Moved from site-builder
│   └── fixtures/
│       └── site-entities.ts  # createMockSiteContent (moved)
```

**What moves**:

- `plugins/site-builder/src/types.ts` → `plugins/site-content/src/schemas/site-content.ts` (entity schema only)
- `plugins/site-builder/src/entities/site-content-adapter.ts` → `plugins/site-content/src/adapters/`
- `plugins/site-builder/src/lib/site-content-service.ts` → `plugins/site-content/src/lib/`
- `plugins/site-builder/src/lib/site-content-operations.ts` → `plugins/site-content/src/lib/`
- `plugins/site-builder/src/types/content-schemas.ts` → `plugins/site-content/src/schemas/generate-options.ts`
- Generate tool from `plugins/site-builder/src/tools/index.ts` → `plugins/site-content/src/tools/`
- `plugins/site-builder/test/entities/site-content-adapter.test.ts` → `plugins/site-content/test/`
- `plugins/site-builder/test/fixtures/site-entities.ts` → `createMockSiteContent` moves

## Step 2: Refactor SiteContentOperations to use messaging instead of RouteRegistry

**Before** (imports RouteRegistry directly):

```typescript
export class SiteContentOperations {
  constructor(
    private readonly context: ServicePluginContext,
    private readonly routeRegistry: RouteRegistry,
  ) {}

  async generate(options) {
    const routes = this.routeRegistry.list();
    // ...
  }
}
```

**After** (queries routes via messaging):

```typescript
export class SiteContentOperations {
  constructor(private readonly context: ServicePluginContext) {}

  async generate(options) {
    const response = await this.context.messaging.send(
      "site-builder:routes:list",
      {},
    );
    const routes = response.data as RouteDefinition[];
    // ...
  }
}
```

Route/section types (`RouteDefinition`, `SectionDefinition`, schemas, and navigation types) move to `@brains/plugins` since they're a cross-cutting concern — already imported by `plugins/decks` from `@brains/site-builder-plugin`.

## Step 3: Add route messaging to site-builder

**File**: `plugins/site-builder/src/plugin.ts`

In `onRegister()`, add:

```typescript
context.messaging.subscribe("site-builder:routes:list", async () => {
  return { success: true, data: this.routeRegistry.list() };
});
```

Remove:

- Entity registration for `site-content` (moved to new plugin)
- `SiteContentService` instantiation
- Generate tool
- `import { siteContentAdapter }` and `import { siteContentSchema }`

## Step 4: Register new plugin in app configs

**Files**: `apps/*/brain.config.ts`

```typescript
import { siteContentPlugin } from "@brains/site-content";

// In plugins array:
siteContentPlugin(),
siteBuilderPlugin({ routes, /* ... */ }),
```

The new plugin needs no special config — it discovers routes via messaging.

## Step 5: Update ContentGenerationJobHandler

**File**: `shell/content-service/src/handlers/contentGenerationJobHandler.ts`

No changes needed — it already creates entities generically with `entityService.createEntity()` using whatever `entityType` the job specifies. It doesn't import site-content types.

## Files Modified

| File                                             | Action                                                    |
| ------------------------------------------------ | --------------------------------------------------------- |
| `shell/plugins/src/types/routes.ts`              | **New** — route types moved from site-builder             |
| `shell/plugins/src/index.ts`                     | Export route types                                        |
| `plugins/site-content/`                          | **New plugin** — entity, adapter, tools, orchestration    |
| `plugins/site-builder/src/types/routes.ts`       | **Delete** — moved to @brains/plugins                     |
| `plugins/site-builder/src/plugin.ts`             | Remove content generation, add route messaging            |
| `plugins/site-builder/src/tools/index.ts`        | Remove generate tool                                      |
| `plugins/site-builder/src/types.ts`              | Remove site-content schema                                |
| `plugins/site-builder/src/lib/site-content-*.ts` | **Delete** — moved to site-content plugin                 |
| `plugins/site-builder/src/entities/`             | **Delete** — moved to site-content plugin                 |
| `plugins/site-builder/src/index.ts`              | Update re-exports (remove content, keep route re-exports) |
| `plugins/decks/src/routes.ts`                    | Import RouteDefinition from `@brains/plugins`             |
| `plugins/blog/src/routes/`                       | Import from `@brains/plugins` if applicable               |
| `apps/*/brain.config.ts`                         | Add `siteContentPlugin()`                                 |
| `turbo.json` / root `package.json`               | Register new package                                      |

## What Stays in Site-Builder

- `RouteRegistry`, `SiteBuilder`, `SiteBuildJobHandler`
- `SiteInfoService`, `UISlotRegistry`, layouts
- `NavigationDataSource`, `SiteInfoDataSource`
- `getContentForSection()` — still queries `site-content` entities by type+id (no import needed)
- Route/section type definitions (exported for site-content to use)

## Testing Strategy

### Tests that MOVE to `plugins/site-content/test/`

| Current location                                                  | What it tests                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `plugins/site-builder/test/entities/site-content-adapter.test.ts` | Adapter serialization (toMarkdown, fromMarkdown, extractMetadata)              |
| `plugins/site-builder/src/lib/site-content-service.test.ts`       | SiteContentService (generateContent, metadata handling)                        |
| `plugins/site-builder/src/lib/site-content-operations.test.ts`    | SiteContentOperations (job enqueueing, route/section filtering, force/dry-run) |
| `plugins/site-builder/test/fixtures/site-entities.ts`             | `createMockSiteContent()` factory — moves with the adapter tests               |

### Tests that STAY in site-builder (no changes)

- `test/unit/site-builder-data-query.test.ts` — queries `site-content` entities by type+id, generic
- `test/unit/preact-builder.test.ts` — renders content, doesn't generate it
- `test/handlers/siteBuildJobHandler.test.ts` — build pipeline, not content generation
- `test/unit/route-registry.test.ts` — route management
- `test/unit/content-resolution.test.ts` — content resolution
- All other site-builder tests (UI slots, theming, hydration, navigation)

### Tests that STAY in site-builder (need updates)

- `test/unit/plugin.test.ts` — currently tests that the generate tool is registered. After extraction, the generate tool moves out. Update to verify generate tool is no longer present, or remove that assertion.

### Tests that STAY in shell (no changes)

- `shell/content-service/test/resolve-content.test.ts` — generic content resolution, uses `site-content` as example entity type but doesn't import site-content types
- `shell/content-service/test/content-generator.test.ts` — generic content generation, no site-content references

### NEW tests needed in `plugins/site-content/`

1. **Route messaging integration test** — verify that `SiteContentOperations` correctly queries `site-builder:routes:list` and handles the response. Mock the messaging layer to return route definitions.
2. **Generate tool test** — the tool moves from site-builder to site-content. Needs its own test using `createServicePluginHarness()` with mocked messaging.
3. **Plugin registration test** — verify the site-content plugin registers the entity type and tools correctly.

### Existing `site-content-operations.test.ts` changes

Currently `SiteContentOperations` takes a `RouteRegistry` in its constructor. After the refactor it queries routes via messaging. The tests need to:

- Remove `RouteRegistry` mocking
- Mock `context.messaging.send("site-builder:routes:list")` to return route fixtures
- Same assertions, different setup

## Verification

```bash
bun run typecheck
bun test plugins/site-content/
bun test plugins/site-builder/
bun test shell/content-service/
bun run test  # full suite
```

Functional test: the `site-content_generate` tool should queue jobs, and site-builder should still find saved content during builds.
