# Plan: Plugin Hierarchy Simplification

## Goal

Collapse the four-level plugin hierarchy into three sibling types with clean context separation.

```
Current:                          Target:
BasePlugin                        BasePlugin (abstract)
  ├── CorePlugin                    ├── EntityPlugin
  │   └── ServicePlugin             ├── IntegrationPlugin
  ├── EntityPlugin                   └── InterfacePlugin
  └── InterfacePlugin
```

## Current State

### What's done (Phases 1–6b)

- All entity types live in `entities/` as EntityPlugins (14 total)
- System tools are framework code in `shell/core/src/system/`
- Types renamed: `Tool`, `Resource`, `ResourceTemplate`, `Prompt`, `JobsNamespace`
- `createTool` + `findEntityByIdentifier` in canonical packages (`@brains/mcp-service`, `@brains/entity-service`)
- Duplicate job helpers deleted

### Current plugin classes

| Class                    | Extends           | Used by                                                                                                                                                                                                                    |
| ------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CorePlugin`             | `BasePlugin`      | `AnalyticsPlugin`, `MCPBridgePlugin`                                                                                                                                                                                       |
| `ServicePlugin`          | `CorePlugin`      | `DirectorySyncPlugin`, `SiteBuilderPlugin`, `ContentPipelinePlugin`, `ButtondownPlugin`, `DashboardPlugin`, `ObsidianVaultPlugin`, `SiteContentPlugin`, `ProfessionalSitePlugin`, `PersonalSitePlugin`, `RangerSitePlugin` |
| `EntityPlugin`           | `BasePlugin`      | 14 entity plugins in `entities/`                                                                                                                                                                                           |
| `InterfacePlugin`        | `BasePlugin`      | `MCPInterface`, `WebserverInterface`, `A2AInterface`                                                                                                                                                                       |
| `MessageInterfacePlugin` | `InterfacePlugin` | `CLIInterface`, `MatrixInterface`, `DiscordInterface`                                                                                                                                                                      |

### Current context types

| Context                  | Used by                               | Unique capabilities                                                                                                       |
| ------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `CorePluginContext`      | Base for Service + Entity + Interface | entityService (read), jobs (monitor), messaging, identity, conversations, eval, logger, dataDir, domain, ai, templates    |
| `ServicePluginContext`   | ServicePlugin                         | entities (register + write), ai (generate + image), templates (resolve), jobs (write), views, plugins, resources, prompts |
| `EntityPluginContext`    | EntityPlugin                          | entities (register + write), ai (generate + image), templates (resolve), jobs (write)                                     |
| `InterfacePluginContext` | InterfacePlugin                       | mcpTransport, agentService, permissions, daemons, jobs (write), conversations (write), tools, apiRoutes                   |

### Problem

`CorePluginContext` is the shared base, but it includes AI and templates — capabilities that IntegrationPlugins don't need. `ServicePluginContext extends CorePluginContext` creates an inheritance chain where IntegrationPlugin inherits AI just because the base has it. The context hierarchy should match the plugin hierarchy: three siblings with a shared base, each adding only what it needs.

## Design

### Three sibling contexts

**`BasePluginContext`** — shared by all plugin types:

- `pluginId`, `logger`, `dataDir`, `domain`, `siteUrl`, `previewUrl`, `appInfo`
- `entityService` (read-only `ICoreEntityService`)
- `identity` (`get`, `getProfile`, `getAppInfo`)
- `messaging` (`send`, `subscribe`)
- `jobs` (`JobsNamespace` — monitoring + scoped write)
- `conversations` (read-only: `get`, `search`, `getMessages`)
- `eval` (`registerHandler`)

**`EntityPluginContext`** = `BasePluginContext` + :

- `entityService` (full `IEntityService` with write)
- `entities` (register, getAdapter, extendFrontmatterSchema, update, registerDataSource)
- `ai` (query, generate, generateObject, generateImage, canGenerateImages)
- `templates` (register, format, parse, resolve, getCapabilities)

**`IntegrationPluginContext`** = `BasePluginContext` + :

- `entityService` (full `IEntityService` with write)
- `entities` (register, getAdapter, extendFrontmatterSchema, update, registerDataSource)
- `views` (get, list, hasRenderer, getRenderer, validate)
- `resources` (registerTemplate)
- `prompts` (register)
- `plugins` (getPackageName)
- `templates` (register, format, parse — base only, no resolve/getCapabilities)

**`InterfacePluginContext`** = `BasePluginContext` + :

- `mcpTransport`, `agentService`
- `permissions` (getUserLevel)
- `daemons` (register)
- `conversations` (extended: start, addMessage)
- `tools` (listForPermissionLevel)
- `apiRoutes` (getRoutes, getMessageBus)

### Key decisions

- **No AI on IntegrationPluginContext** — integration plugins are infrastructure connectors, not content generators
- **Both Entity and Integration get `entities` namespace** — both can register entity types and write entities
- **`BasePluginContext` has no AI** — AI moves from base to EntityPluginContext only
- **`templates` split** — EntityPluginContext gets full templates (resolve, getCapabilities); IntegrationPluginContext gets base only (register, format, parse)
- **Jobs always unified** — every context gets full `JobsNamespace` (monitoring + write), scoped by factory

## Steps

### Phase 7: Three sibling contexts

#### 7a. Extract `BasePluginContext`

1. Create `shell/plugins/src/base/context.ts` with `BasePluginContext` interface + `createBasePluginContext()` factory
2. Move shared namespace interfaces (`IMessagingNamespace`, `IIdentityNamespace`, `IConversationsNamespace`, `IEvalNamespace`) to base
3. `BasePluginContext.jobs` is `JobsNamespace` (unified — monitoring + scoped write)

#### 7b. Refactor `EntityPluginContext`

1. Change `EntityPluginContext extends BasePluginContext` (was `CorePluginContext`)
2. Keep: `entities`, `ai` (full), `templates` (full with resolve/getCapabilities)
3. Factory calls `createBasePluginContext()` then adds entity-specific namespaces

#### 7c. Create `IntegrationPluginContext`

1. New interface in `shell/plugins/src/integration/context.ts`
2. `IntegrationPluginContext extends BasePluginContext`
3. Adds: `entities`, `views`, `resources`, `prompts`, `plugins`, `templates` (base only)
4. Factory: `createIntegrationPluginContext()`

#### 7d. Refactor `InterfacePluginContext`

1. Change `InterfacePluginContext extends BasePluginContext` (was `CorePluginContext`)
2. Keep all interface-specific namespaces
3. Factory calls `createBasePluginContext()` then adds interface-specific namespaces

#### 7e. Delete old contexts

1. Delete `CorePluginContext`, `createCorePluginContext()` from `shell/plugins/src/core/context.ts`
2. Delete `ServicePluginContext`, `createServicePluginContext()` from `shell/plugins/src/service/context.ts`
3. Update `shell/plugins/src/index.ts` exports
4. Update all consumers importing `CorePluginContext` or `ServicePluginContext`

#### 7f. Tests

1. Verify all 14 entity plugins get `EntityPluginContext` with AI + full templates
2. Verify all ServicePlugins get `IntegrationPluginContext` with views but no AI
3. Verify all InterfacePlugins get `InterfacePluginContext` with transport + daemons
4. All existing tests pass
5. `bun run typecheck` clean

### Phase 8: IntegrationPlugin class

1. Create `IntegrationPlugin` class in `shell/plugins/src/integration/integration-plugin.ts`
2. Extends `BasePlugin<TConfig, IntegrationPluginContext>`
3. Migrate ServicePlugins: `DirectorySyncPlugin`, `SiteBuilderPlugin`, `ContentPipelinePlugin`, `ButtondownPlugin`, `DashboardPlugin`, `ObsidianVaultPlugin`, `SiteContentPlugin`
4. Migrate layout plugins: `ProfessionalSitePlugin`, `PersonalSitePlugin`, `RangerSitePlugin`
5. Migrate CorePlugins: `AnalyticsPlugin`
6. Migrate `MCPBridgePlugin` (currently extends CorePlugin)
7. Tests

### Phase 9: Cleanup

1. Delete `CorePlugin` class (`shell/plugins/src/core/core-plugin.ts`)
2. Delete `ServicePlugin` class (`shell/plugins/src/service/service-plugin.ts`)
3. Clean up `BasePlugin` — remove `setupMessageHandlers()`, `getTools()`, `getResources()` if no longer needed
4. Delete `shell/plugins/src/core/context.ts` (if not already deleted)
5. Delete `shell/plugins/src/service/context.ts` (if not already deleted)
6. Update example plugins in `plugins/examples/`
7. Update test harness (`shell/plugins/src/test/harness.ts`)
8. Delete `shell/plugins/src/utils/tool-helpers.ts` re-export file (consumers import from `@brains/mcp-service` or `@brains/plugins`)
9. Tests

## Files affected (estimated)

| Phase | Files | Nature                                            |
| ----- | ----- | ------------------------------------------------- |
| 7a    | ~5    | New base context + move namespace interfaces      |
| 7b    | ~3    | Refactor entity context                           |
| 7c    | ~3    | New integration context                           |
| 7d    | ~3    | Refactor interface context                        |
| 7e    | ~130  | Delete old types, update all imports (mechanical) |
| 7f    | ~10   | Test updates                                      |
| 8     | ~15   | Class migration (mechanical)                      |
| 9     | ~10   | Delete old code, update examples                  |

## Verification

1. `bun test` — all tests pass
2. `bun run typecheck` clean
3. Only three plugin classes: `EntityPlugin`, `IntegrationPlugin`, `InterfacePlugin`
4. Three matching context types: `EntityPluginContext`, `IntegrationPluginContext`, `InterfacePluginContext`
5. No AI on `IntegrationPluginContext` or `BasePluginContext`
6. All entity plugins have AI + full templates
7. All interfaces work unchanged
8. No `CorePlugin`, `ServicePlugin`, `CorePluginContext`, `ServicePluginContext` references remain
