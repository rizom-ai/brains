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

| Plugin       | Entity type  | Has tools?            | Has API routes?      |
| ------------ | ------------ | --------------------- | -------------------- |
| newsletter   | `newsletter` | Yes (subscriber mgmt) | Yes (subscribe POST) |
| site-builder | `site-info`  | No                    | No                   |

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

Site-info entity type extracted from site-builder. Site-builder keeps its infrastructure role (build tools, route management) but depends on the entity package.

### Unified PluginContext

`PluginContext` replaces CorePluginContext, ServicePluginContext, and EntityPluginContext. Used by both EntityPlugin and IntegrationPlugin. InterfacePluginContext stays separate.

No `ai` namespace on the unified context. Plugins that need AI obtain it during `onRegister()` as a stored dependency.

### IntegrationPlugin

Replaces both CorePlugin and ServicePlugin for plugins that provide tools and infrastructure.

## Steps

### Phase 5: Split newsletter + extract site-info

Complete entity consolidation — all entity types in `entities/`.

1. **Newsletter split**: extract buttondown subscriber tools + API routes into `plugins/buttondown/` (ServicePlugin for now). Move entity part (schema, adapter, datasource, templates, generation handler, publish pipeline) to `entities/newsletter/` (EntityPlugin).
2. **Site-info**: extract entity type from site-builder into `entities/site-info/` (EntityPlugin). Site-builder imports from the entity package.
3. Update brain model registrations
4. Tests

Note: site-content stays as a ServicePlugin — it's orchestration infrastructure, not a natural entity type. To be revisited separately.

### Phase 6: Unified PluginContext

1. Create `PluginContext` type — replaces all three existing context types
2. Create `createPluginContext()` factory
3. Update EntityPlugin to use `PluginContext`
4. Verify all entity plugins still work
5. Tests

### Phase 7: IntegrationPlugin class

1. Create `IntegrationPlugin` class extending BasePlugin
2. Migrate system (store AI dependency in onRegister)
3. Migrate content-pipeline, directory-sync, site-builder, obsidian-vault, dashboard, analytics, buttondown
4. Tests

### Phase 8: Cleanup

1. Delete CorePlugin, ServicePlugin classes
2. Delete old context types and factories
3. Remove `setupMessageHandlers()`, `getTools()`, `getResources()` from BasePlugin
4. Update example plugins, docs, test harness
5. Tests

## Verification

1. `bun test` — all tests pass
2. `bun run typecheck` / `bun run lint`
3. All entity types registered as EntityPlugins in `entities/`
4. `system_create` routes to correct generation handlers
5. `system_extract` routes to correct derive() methods
6. Newsletter subscriber tools work (in buttondown plugin)
7. Newsletter API routes work (in buttondown plugin)
8. Site builds still work (site-builder imports site-info entity)
9. System plugin's ai.query() works (stored dependency)
10. Only three plugin classes: IntegrationPlugin, EntityPlugin, InterfacePlugin
11. All interfaces work unchanged
