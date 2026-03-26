# Plan: Entity Consolidation + Plugin Hierarchy Simplification

## Context

The plugin system has grown organically. Entity types are scattered across ServicePlugins, the class hierarchy has four levels, and context types are duplicated. This plan consolidates all entity types into EntityPlugins, then simplifies the plugin hierarchy to three sibling classes.

Two previously separate plans merged into one ordered pipeline:

1. **Entity consolidation** — move all entity types into `entities/` as EntityPlugins
2. **Plugin hierarchy simplification** — collapse CorePlugin + ServicePlugin into IntegrationPlugin, unify contexts

## Current State (after Phases 1–4)

### Completed

- ✅ `derive()`, `deriveAll()`, `hasDeriveHandler()` on EntityPlugin
- ✅ `system_extract` tool + `{entityType}:extract` handler auto-registration
- ✅ `system_set-cover` tool in system plugin
- ✅ Series extracted from blog → `entities/series/` (cross-content, with derive)
- ✅ Topics migrated → `entities/topics/` (with derive + deriveAll)
- ✅ Summary migrated → `entities/summary/` (with derive)
- ✅ Social-media migrated → `entities/social-media/` (with derive)
- ✅ Image migrated → `entities/image/` (entity reg removed from shell)
- ✅ Removed: `topics_batch-extract`, `summary_get`, `image_upload`, `image_generate`, `image_set-cover`

### Remaining entity types in ServicePlugins

| Plugin       | Entity type    | Has tools?            | Has API routes?      |
| ------------ | -------------- | --------------------- | -------------------- |
| newsletter   | `newsletter`   | Yes (subscriber mgmt) | Yes (subscribe POST) |
| site-builder | `site-info`    | No                    | No                   |
| site-content | `site-content` | Yes (generate)        | No                   |

## Design

### Three plugin types (target state)

```
BasePlugin (abstract)
  ├── IntegrationPlugin  → tools + external service connections
  ├── EntityPlugin       → content types + derive()
  └── InterfacePlugin    → transports + daemons
```

### Newsletter split

Newsletter is the only plugin that mixes entity management with integration tools.

| Entity part → `entities/newsletter/`   | Integration part → `plugins/buttondown/`                    |
| -------------------------------------- | ----------------------------------------------------------- |
| Schema, adapter, datasource, templates | Subscriber tools (subscribe, unsubscribe, list_subscribers) |
| Generation handler, publish pipeline   | API routes (subscribe POST endpoint)                        |
| `generate:execute` subscription        | ButtondownClient                                            |

### Site-info extraction

Site-info entity type extracted from site-builder into `entities/site-info/`.

**What moves:**

- Schema (`siteInfoSchema`, `siteInfoBodySchema`, `siteInfoCTASchema`)
- Adapter (`SiteInfoAdapter`)
- Service (`SiteInfoService`)
- Helpers (`fetchSiteInfo`)
- Types (`SiteInfo`, `SiteInfoBody`, `SiteInfoCTA`)
- Datasource (`SiteInfoDataSource`) — refactored to remove site-builder dependencies

**Datasource refactor:** Currently the datasource takes `RouteRegistry` and `profileService` as constructor args. Refactored to use only the `BaseDataSourceContext` passed to `fetch()`:

- Site-info entity: `context.entityService.getEntity("site-info", "site-info")`
- Profile (socialLinks): `context.entityService.getEntity("anchor-profile", "anchor-profile")`
- Navigation: message bus `site-builder:navigation:list`
- Constructor takes only `logger`

**Site-builder changes:**

- Removes entity registration, schema, adapter, service, datasource
- Imports `@brains/site-info` for types
- Exposes `site-builder:navigation:list` message handler (already has `site-builder:routes:list`)

**Layout/site changes:**

- Import `SiteInfo`, `SiteInfoCTA`, `fetchSiteInfo` from `@brains/site-info` instead of `@brains/site-builder-plugin`

### Entity schema consolidation (deferred)

Several entity type definitions are split across packages. Consolidate so each entity type has one canonical package:

- **Image**: schema + adapter in `shared/image/`, plugin in `entities/image/`. Move schema into `entities/image/`, consumers import from `@brains/image-plugin`.
- **Brain-character**: schema + adapter + service in `shell/identity-service/`. Move to `entities/brain-character/` (no plugin class — shell registers directly). Shell imports from the entity package.
- **Anchor-profile**: schema + adapter + service in `shell/identity-service/`. Move to `entities/anchor-profile/` (no plugin class). Shell imports from the entity package.

### Site-content redesign

Site-content becomes an EntityPlugin with derive(). AI generates landing page content from brain data on first build, stores as site-content entities. User edits via CMS persist across rebuilds (protected by `edited` flag). derive() auto-regenerates unedited sections when source content changes.

Key change: `AIContentDataSource` checks for a stored site-content entity before generating fresh. First build persists, subsequent builds read from storage.

| Current                                        | New                                                   |
| ---------------------------------------------- | ----------------------------------------------------- |
| `plugins/site-content/` (ServicePlugin)        | `entities/site-content/` (EntityPlugin with derive()) |
| `SiteContentService` + `SiteContentOperations` | Deleted — logic in derive() + AIContentDataSource     |
| `site-content_generate` tool                   | Deleted — auto-generate on build, derive on changes   |
| No persistence                                 | Stored as entities, editable via CMS                  |
| No `edited` flag                               | `edited: true` protects manual tweaks from derive()   |

### System to framework

System plugin is framework code pretending to be a plugin. Move system tools, resources, prompts, instructions, and dashboard widgets to shell-level registration. No SystemPlugin class. See `docs/plans/system-to-framework.md` for full design.

This unblocks the context refactor: system was the only IntegrationPlugin that needed AI on its context. After extraction, no integration plugin needs `ai`.

### Three sibling contexts

Three context types, each scoped to its plugin type. Not subsets — siblings with a shared base:

**Shared base**: `entityService`, `jobs`, `messaging`, `identity`, `conversations`, `eval`, `logger`, `dataDir`, `domain`

**EntityPluginContext** = base + `entities` + `ai` + `templates`

- Entity plugins are content machines — they need AI (generation handlers) and templates (content formatting)

**IntegrationPluginContext** = base + `views` + `resources` + `prompts` + `plugins`

- Integration plugins are infrastructure connectors — they need MCP registration and view access

**InterfacePluginContext** = base + transport + daemon + agent + conversation write

- Interface plugins are user-facing transports

### IntegrationPlugin

Replaces both CorePlugin and ServicePlugin for plugins that provide tools and infrastructure. Uses `IntegrationPluginContext`.

## Steps

### Phase 5: Split newsletter + extract site-info + redesign site-content

Complete entity consolidation — all entity types in `entities/`.

1. **Newsletter split**: extract buttondown subscriber tools + API routes into `plugins/buttondown/` (ServicePlugin for now). Move entity part to `entities/newsletter/` (EntityPlugin).
2. **Site-info**: extract entity type from site-builder into `entities/site-info/` (EntityPlugin). Refactor datasource to use entityService + message bus instead of RouteRegistry. Update layouts to import from `@brains/site-info`. Add `site-builder:navigation:list` message handler to site-builder.
3. **Site-content redesign**: move to `entities/site-content/` (EntityPlugin with derive()). Add `edited` flag to metadata. Delete SiteContentService, SiteContentOperations, site-content_generate tool. Update AIContentDataSource to check for stored entity before generating.
4. Update brain model registrations
5. Tests

### Phase 6: System to framework

Extract system tools from plugin to shell. See `docs/plans/system-to-framework.md`.

1. Move system tools to `shell/core/src/system-tools.ts` — direct service access, no plugin instance
2. Move resources, prompts, instructions, dashboard widgets to shell
3. Register in shell initialization after plugins
4. Delete `plugins/system/`
5. Remove system from brain model registrations
6. Tests

### Phase 6b: Naming cleanup

Immediately after system-to-framework, before context refactor.

#### Renames in `@brains/mcp-service` (source of truth)

| Old name                     | New name               | Files affected |
| ---------------------------- | ---------------------- | -------------- |
| `PluginTool`                 | `Tool`                 | ~51            |
| `PluginResource`             | `Resource`             | ~15            |
| `PluginResourceTemplate`     | `ResourceTemplate`     | ~9             |
| `PluginPrompt`               | `Prompt`               | ~10            |
| `registerPluginTools`        | `registerTools`        | ~5             |
| `registerPluginResources`    | `registerResources`    | ~3             |
| `registerPluginInstructions` | `registerInstructions` | ~3             |

No aliases. Rename at source (`shell/mcp-service/src/types.ts`), then update all consumers.

#### Move `createTypedTool` → `createTool`

Currently in `shell/plugins/src/utils/tool-helpers.ts`. Move to `shell/mcp-service/src/tool-helpers.ts` and rename. Update 13 files that import it:

- `shell/core/src/system/tools.ts` (imports from `@brains/plugins`)
- `plugins/buttondown/`, `plugins/content-pipeline/`, `plugins/site-builder/`, `plugins/analytics/`, `plugins/dashboard/`, `plugins/directory-sync/`, `plugins/obsidian-vault/`, `plugins/site-content/`
- `shell/plugins/` re-exports it for backward compat during transition (delete re-export in Phase 9)

#### Import path cleanup

Shell packages (`shell/core`, `shell/plugins`) should import `Tool`, `Resource`, `Prompt`, `createTool` from `@brains/mcp-service` directly — not through `@brains/plugins`.

Plugin/entity packages continue importing from `@brains/plugins` (which re-exports from `@brains/mcp-service`).

#### Remove duplicate job helpers

`IJobsWriteNamespace`, `createEnqueueJobFn`, `createEnqueueBatchFn`, `createRegisterHandlerFn` exist in BOTH:

- `shell/plugins/src/shared/job-helpers.ts` + `shell/plugins/src/core/context.ts` (old)
- `shell/job-queue/src/job-helpers.ts` (new, canonical)

Delete the old copies. Update `shell/plugins/` context files to import from `@brains/job-queue`. 4 files affected:

- `shell/plugins/src/core/context.ts` — delete `IJobsWriteNamespace` definition
- `shell/plugins/src/entity/context.ts` — import from `@brains/job-queue`
- `shell/plugins/src/service/context.ts` — import from `@brains/job-queue`
- `shell/plugins/src/interface/context.ts` — import from `@brains/job-queue`

Then delete `shell/plugins/src/shared/job-helpers.ts`.

#### Steps

1. Remove duplicate job helpers — delete from `@brains/plugins`, import from `@brains/job-queue`
2. Rename types in `shell/mcp-service/src/types.ts`
3. Move + rename `createTypedTool` → `createTool` in `shell/mcp-service/src/tool-helpers.ts`
4. Update `shell/mcp-service/src/index.ts` exports
5. Update `shell/core/` imports to use `@brains/mcp-service`
6. Update `shell/plugins/` — rename internal usages, re-export new names
7. Update all plugin/entity packages — mechanical find-replace
8. Rename `registerPlugin*` methods on `IMCPService` and `IShell`
9. Tests

### Phase 7: Three sibling contexts

1. Define shared base context type (entityService, jobs, messaging, identity, conversations, eval, logger, dataDir, domain)
2. Define `EntityPluginContext` = base + entities + ai + templates
3. Define `IntegrationPluginContext` = base + views + resources + prompts + plugins
4. Create factories: `createEntityPluginContext()`, `createIntegrationPluginContext()`
5. Delete `CorePluginContext`, `ServicePluginContext`, `createCorePluginContext()`, `createServicePluginContext()`
6. Update all consumers
7. Tests

### Phase 8: IntegrationPlugin class

1. Create `IntegrationPlugin` class extending `BasePlugin<TConfig, IntegrationPluginContext>`
2. Migrate content-pipeline, directory-sync, site-builder, obsidian-vault, dashboard, analytics, buttondown
3. Tests

### Phase 9: Cleanup

1. Delete CorePlugin, ServicePlugin classes
2. Remove `setupMessageHandlers()`, `getTools()`, `getResources()` from BasePlugin
3. Update example plugins, docs, test harness
4. Tests

## Verification

1. `bun test` — all tests pass
2. `bun run typecheck` / `bun run lint`
3. All entity types registered as EntityPlugins in `entities/`
4. System tools registered at shell level (no SystemPlugin)
5. `system_create` routes to correct generation handlers
6. `system_extract` routes to correct derive() methods
7. Newsletter subscriber tools work (in buttondown plugin)
8. Newsletter API routes work (in buttondown plugin)
9. Site builds still work
10. Only three plugin classes: IntegrationPlugin, EntityPlugin, InterfacePlugin
11. Three matching context types: IntegrationPluginContext, EntityPluginContext, InterfacePluginContext
12. No AI on IntegrationPluginContext
13. All interfaces work unchanged
