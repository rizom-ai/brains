# Plan: Plugin Hierarchy Simplification ✅ Complete

## Goal

Collapse the four-level plugin hierarchy into three sibling types. Keep the "ServicePlugin" name — it fits the mixed bag of non-entity, non-interface plugins better than "IntegrationPlugin". Design contexts from actual usage, not theory.

```
Current:                          Target:
BasePlugin                        BasePlugin (abstract)
  ├── CorePlugin                    ├── EntityPlugin
  │   └── ServicePlugin             ├── ServicePlugin
  ├── EntityPlugin                  └── InterfacePlugin
  └── InterfacePlugin
```

## Current State

### What's done (Phases 1–6b)

- All entity types live in `entities/` as EntityPlugins (14 total)
- System tools are framework code in `shell/core/src/system/`
- Types renamed: `Tool`, `Resource`, `ResourceTemplate`, `Prompt`, `JobsNamespace`
- `createTool` + `findEntityByIdentifier` in canonical packages (`@brains/mcp-service`, `@brains/entity-service`)
- Duplicate job helpers and re-export shims deleted

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
| `EntityPluginContext`    | EntityPlugin                          | entities (register + write), ai (generate + image), templates (resolve), jobs (write), prompts (resolve)                  |
| `InterfacePluginContext` | InterfacePlugin                       | mcpTransport, agentService, permissions, daemons, jobs (write), conversations (write), tools, apiRoutes                   |

### Problem

`CorePluginContext` is the shared base, but it includes AI and templates — capabilities most plugin types don't need. `ServicePlugin extends CorePlugin` creates an unnecessary inheritance level. The context hierarchy should match the plugin hierarchy: three siblings with a shared base, each adding only what it actually uses.

## Usage Audit

Capability usage was audited across all plugins to drive the design. Key findings:

### ServicePlugins (10 plugins + 2 CorePlugins → 12 total)

| Capability                           | Users | Details                                                                                                         |
| ------------------------------------ | ----- | --------------------------------------------------------------------------------------------------------------- |
| `messaging`                          | 8     | directory-sync, site-builder, content-pipeline, buttondown, dashboard, obsidian-vault, analytics, mcp-bridge(0) |
| `entityService`                      | 8     | all except ranger, analytics, mcp-bridge                                                                        |
| `entities`                           | 6     | directory-sync, site-builder, dashboard, obsidian-vault, personal, professional                                 |
| `templates` (register/format)        | 6     | directory-sync, site-builder, dashboard, personal, professional, ranger                                         |
| `templates.resolve`                  | 1     | site-builder                                                                                                    |
| `templates.getCapabilities`          | 1     | site-content                                                                                                    |
| `jobs`                               | 4     | directory-sync, site-builder, content-pipeline, site-content                                                    |
| `views`                              | 1     | site-builder                                                                                                    |
| **`ai`**                             | **0** | —                                                                                                               |
| **`mcp.prompts.register`**           | **0** | —                                                                                                               |
| **`mcp.resources.registerTemplate`** | **0** | —                                                                                                               |
| **`plugins.getPackageName`**         | **0** | —                                                                                                               |

### EntityPlugins (14 total)

| Capability             | Users | Details                                                                   |
| ---------------------- | ----- | ------------------------------------------------------------------------- |
| `ai.generate`          | 10    | all except products, prompt                                               |
| `ai.generateObject`    | 1     | social-media                                                              |
| `entityService`        | 10    | all except products, prompt, note                                         |
| `messaging`            | 8     | blog, decks, newsletter, portfolio, social-media, series, summary, topics |
| `eval.registerHandler` | 8     | blog, decks, link, newsletter, note, portfolio, social-media, topics      |
| `entities`             | 3     | blog (registerDataSource), products (register), series (update)           |
| `jobs`                 | 3     | newsletter, social-media, topics                                          |
| `identity.getProfile`  | 1     | blog                                                                      |
| **`templates`**        | **0** | —                                                                         |
| **`prompts.resolve`**  | **0** | (plumbing added, no callers yet)                                          |
| **`views`**            | **0** | —                                                                         |

## Design

### Three sibling contexts (usage-driven)

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
- `prompts` (resolve — prompt entity resolution for AI prompts)

**`ServicePluginContext`** = `BasePluginContext` + :

- `entityService` (full `IEntityService` with write)
- `entities` (register, getAdapter, extendFrontmatterSchema, update, registerDataSource)
- `templates` (register, format, parse, resolve, getCapabilities)
- `views` (get, list, hasRenderer, getRenderer, validate)
- `prompts` (resolve — prompt entity resolution)

**`InterfacePluginContext`** = `BasePluginContext` + :

- `mcpTransport`, `agentService`
- `permissions` (getUserLevel)
- `daemons` (register)
- `conversations` (extended: start, addMessage)
- `tools` (listForPermissionLevel)
- `apiRoutes` (getRoutes, getMessageBus)

### Key decisions

- **Keep "ServicePlugin" name** — the current ServicePlugins are site-builders, content processors, dashboards, and external connectors. "Integration" implies only external systems; "Service" fits the actual mix. Keeping the name also avoids ~130 files of mechanical import churn.
- **No AI on ServicePluginContext** — zero ServicePlugins use AI today. If a future ServicePlugin needs AI, add it then (one interface change, one factory change). Don't pre-wire unused capabilities.
- **No templates on EntityPluginContext** — zero entity plugins use any templates method. Entity plugins generate content via `context.ai.generate()`, not through the template system.
- **`prompts.resolve` on both Entity and Service** — prompt entity resolution is available to both, since both deal with content. Entity plugins will use it when migrating hardcoded prompts to prompt entities (Phase 2 of prompts-as-entities plan).
- **`mcp` namespace dropped from ServicePluginContext** — `mcp.resources.registerTemplate` and `mcp.prompts.register` have zero users. Can be re-added when a plugin actually needs MCP protocol registration.
- **`plugins.getPackageName` dropped** — zero users. Can be re-added if needed.
- **Jobs unified on base** — every context gets full `JobsNamespace` (monitoring + write). This is a least-privilege tradeoff for simplicity — scoping is handled by factory functions.
- **`BasePluginContext` has no AI, no templates** — these move to the sibling contexts that actually use them.

## Steps

### Phase 7: Three sibling contexts

#### 7a. Extract `BasePluginContext`

1. Create `shell/plugins/src/base/context.ts` with `BasePluginContext` interface + `createBasePluginContext()` factory
2. Move shared namespace interfaces (`IMessagingNamespace`, `IIdentityNamespace`, `IConversationsNamespace`, `IEvalNamespace`) to base
3. `BasePluginContext.jobs` is `JobsNamespace` (unified — monitoring + scoped write)

#### 7b. Refactor `EntityPluginContext`

1. Change `EntityPluginContext extends BasePluginContext` (was `CorePluginContext`)
2. Keep: `entities`, `ai` (full), `prompts` (resolve)
3. Remove: `templates` (no entity plugin uses it)
4. Factory calls `createBasePluginContext()` then adds entity-specific namespaces

#### 7c. Refactor `ServicePluginContext`

1. Change `ServicePluginContext extends BasePluginContext` (was `CorePluginContext`)
2. Keep: `entities`, `templates` (full), `views`, `prompts` (resolve)
3. Remove: `plugins.getPackageName`, `mcp` namespace (zero users)
4. Factory calls `createBasePluginContext()` then adds service-specific namespaces

#### 7d. Refactor `InterfacePluginContext`

1. Change `InterfacePluginContext extends BasePluginContext` (was `CorePluginContext`)
2. Keep all interface-specific namespaces
3. Factory calls `createBasePluginContext()` then adds interface-specific namespaces

#### 7e. Delete `CorePluginContext`

1. Delete `CorePluginContext`, `createCorePluginContext()` from `shell/plugins/src/core/context.ts`
2. Update `shell/plugins/src/index.ts` exports
3. Update ~20 files importing `CorePluginContext` → `BasePluginContext`

#### 7f. Tests

1. Verify all 14 entity plugins get `EntityPluginContext` with AI, no templates
2. Verify all ServicePlugins get `ServicePluginContext` with templates + views, no AI
3. Verify all InterfacePlugins get `InterfacePluginContext` with transport + daemons
4. All existing tests pass
5. `bun run typecheck` clean

### Phase 8: Merge CorePlugin into ServicePlugin

1. Migrate `AnalyticsPlugin` to extend `ServicePlugin` (currently `CorePlugin`)
2. Migrate `MCPBridgePlugin` to extend `ServicePlugin` (currently `CorePlugin`)
3. Update example plugin: `ExampleCorePlugin` → extend `ServicePlugin`
4. Delete `CorePlugin` class (`shell/plugins/src/core/core-plugin.ts`)
5. Update `shell/plugins/src/index.ts` exports
6. Tests — only ~6 files import `CorePlugin`

### Phase 9: Cleanup

1. Delete `shell/plugins/src/core/context.ts` (if not already deleted in 7e)
2. Clean up `BasePlugin` — remove methods that should be on sibling classes only
3. Update test harness (`shell/plugins/src/test/harness.ts`)
4. Update example plugins in `plugins/examples/`
5. Update docs: `plugins/CLAUDE.md`, `.claude/rules/plugin-patterns.md`, `shell/plugins/README.md`
6. Tests

## Files affected (estimated)

| Phase | Files | Nature                                         |
| ----- | ----- | ---------------------------------------------- |
| 7a    | ~5    | New base context + move namespace interfaces   |
| 7b    | ~3    | Refactor entity context, remove templates      |
| 7c    | ~3    | Refactor service context, remove mcp + plugins |
| 7d    | ~3    | Refactor interface context                     |
| 7e    | ~20   | Delete CorePluginContext, update imports       |
| 7f    | ~10   | Test updates                                   |
| 8     | ~6    | Merge CorePlugin into ServicePlugin            |
| 9     | ~10   | Delete old code, update examples + docs        |

## Verification

1. `bun test` — all tests pass
2. `bun run typecheck` clean
3. Only three plugin classes: `EntityPlugin`, `ServicePlugin`, `InterfacePlugin`
4. Three matching context types: `EntityPluginContext`, `ServicePluginContext`, `InterfacePluginContext`
5. No AI on `ServicePluginContext` or `BasePluginContext`
6. No templates on `EntityPluginContext`
7. All entity plugins have AI + prompts.resolve
8. All service plugins have templates + views, no mcp
9. All interfaces work unchanged
10. No `CorePlugin`, `CorePluginContext` references remain
