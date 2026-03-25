# Plan: Plugin Hierarchy Simplification

## Context

After entity consolidation (see entity-consolidation plan), the plugin system still has four classes (BasePlugin, CorePlugin, ServicePlugin, EntityPlugin) and three context types. The remaining ServicePlugins and CorePlugins are all pure integration plugins — tools and external service connections, no entity types. This plan collapses the hierarchy to three sibling classes with a unified context.

**Depends on**: entity-consolidation plan being complete (all entity-managing plugins already migrated to EntityPlugin).

## Design

### Three plugin types, sibling classes

```
BasePlugin (abstract)
  ├── IntegrationPlugin  → tools + external service connections
  ├── EntityPlugin       → content types + derive()
  └── InterfacePlugin    → transports + daemons
```

All three are siblings. No inheritance between them. No empty method overrides.

### BasePlugin changes

`BasePlugin` keeps:

- `id`, `version`, `config`, `logger`
- `onRegister(context)`, `onShutdown()`
- `getInstructions()`
- `getTemplates()` — both types can provide templates
- `getDataSources()` — both types can provide datasources

`BasePlugin` loses:

- `getTools()` — moves to IntegrationPlugin only
- `getResources()` — moves to IntegrationPlugin only
- `setupMessageHandlers()` — moves to IntegrationPlugin only

Note: EntityPlugin already doesn't use `setupMessageHandlers()` for anything meaningful (no tools/resources). InterfacePlugin also calls it but no concrete interface has tools — removing it is safe.

### IntegrationPlugin

Replaces both CorePlugin and ServicePlugin. Provides tools and external service connections.

```typescript
export abstract class IntegrationPlugin<TConfig = unknown> extends BasePlugin<
  TConfig,
  PluginContext
> {
  public readonly type = "integration" as const;

  protected abstract getTools(): Promise<PluginTool[]>;
  protected getResources(): Promise<PluginResource[]> {
    return [];
  }

  override async register(shell: IShell): Promise<PluginCapabilities> {
    const context = createPluginContext(shell, this.id);
    this.context = context;
    this.setupMessageHandlers(context);
    await this.onRegister(context);
    return {
      tools: await this.getTools(),
      resources: await this.getResources(),
      ...((await this.getInstructions()) && {
        instructions: await this.getInstructions(),
      }),
    };
  }
}
```

### Two context types (not one)

`PluginContext` replaces CorePluginContext, ServicePluginContext, and EntityPluginContext. Used by both EntityPlugin and IntegrationPlugin.

`InterfacePluginContext` stays separate — interfaces have fundamentally different needs (daemons, transports, permissions, MCP transport, agent service, conversation write access).

```typescript
interface PluginContext {
  // Identity
  readonly identity: IIdentityNamespace;
  readonly domain: string | undefined;
  readonly siteUrl: string | undefined;
  readonly previewUrl: string | undefined;

  // Services
  readonly entityService: IEntityService;
  readonly entities: IEntitiesNamespace;
  readonly jobs: IJobsNamespace;
  readonly templates: ITemplatesNamespace;
  readonly messaging: IMessagingNamespace;
  readonly conversations: IConversationsNamespace;
  readonly eval: IEvalNamespace;

  // Infrastructure
  readonly logger: Logger;
  readonly dataDir: string;

  // Views (used by site-builder)
  readonly views: IViewsNamespace;

  // MCP registration (used by IntegrationPlugin, not EntityPlugin)
  readonly resources: IResourcesNamespace;
  readonly prompts: IPromptsNamespace;
}
```

No `ai` namespace — AI is not a universal plugin need. Plugins that need AI (system for `query()`, image for `generateImage()`) obtain it as a stored dependency during `onRegister()`.

### What gets split

Newsletter is the only plugin that mixes entity management with integration tools.

| Current plugin | Entity part → EntityPlugin               | Integration part → IntegrationPlugin     |
| -------------- | ---------------------------------------- | ---------------------------------------- |
| newsletter     | Newsletter entity + generation + publish | Buttondown subscriber tools + API routes |

Newsletter's `getApiRoutes()` (subscribe endpoint) moves to the buttondown IntegrationPlugin.

### Migration map

| Plugin           | Currently       | Becomes           | Notes                                         |
| ---------------- | --------------- | ----------------- | --------------------------------------------- |
| newsletter       | ServicePlugin   | EntityPlugin      | Buttondown tools + API routes extracted       |
| buttondown       | (new)           | IntegrationPlugin | Subscriber tools + API routes from newsletter |
| system           | ServicePlugin   | IntegrationPlugin | Gets AI as stored dependency for query()      |
| content-pipeline | ServicePlugin   | IntegrationPlugin | Orchestration tools                           |
| directory-sync   | ServicePlugin   | IntegrationPlugin | Git/filesystem tools                          |
| site-builder     | ServicePlugin   | IntegrationPlugin | Build tools, uses views namespace             |
| obsidian-vault   | ServicePlugin   | IntegrationPlugin | Sync tools                                    |
| site-content     | ServicePlugin   | IntegrationPlugin | Content tools                                 |
| dashboard        | ServicePlugin   | IntegrationPlugin | Widget tools                                  |
| analytics        | CorePlugin      | IntegrationPlugin | Query tool + scripts                          |
| mcp              | InterfacePlugin | InterfacePlugin   | No change (already extends BasePlugin)        |
| discord          | InterfacePlugin | InterfacePlugin   | No change (already extends BasePlugin)        |
| matrix           | InterfacePlugin | InterfacePlugin   | No change (already extends BasePlugin)        |
| webserver        | InterfacePlugin | InterfacePlugin   | No change (already extends BasePlugin)        |
| a2a              | InterfacePlugin | InterfacePlugin   | No change (already extends BasePlugin)        |
| cli              | InterfacePlugin | InterfacePlugin   | No change (already extends BasePlugin)        |

Note: InterfacePlugin already extends BasePlugin directly — no reparenting needed.

### What gets deleted

- `CorePlugin` class
- `ServicePlugin` class
- `CorePluginContext` type
- `ServicePluginContext` type
- `EntityPluginContext` type
- `createCorePluginContext()` function
- `createServicePluginContext()` function
- `createEntityPluginContext()` function
- Example plugins for CorePlugin and ServicePlugin

### What gets added

- `PluginContext` — unified context type for EntityPlugin + IntegrationPlugin
- `createPluginContext()` — single context factory
- `IntegrationPlugin` class — replaces CorePlugin + ServicePlugin
- `plugins/buttondown/` — IntegrationPlugin with subscriber tools + API routes
- Example plugin for IntegrationPlugin

## Steps

### Phase 1: Split newsletter

Validates the entity/integration split before the structural refactor.

1. Extract Buttondown subscriber tools + API routes into `plugins/buttondown/` (still a ServicePlugin for now)
2. Strip newsletter to entity + generation + publish (still a ServicePlugin for now, migrated to EntityPlugin in Phase 4)
3. Update brain models to register both
4. Tests

### Phase 2: Unified PluginContext

1. Create `PluginContext` type (no `ai` namespace, includes `views`, `resources`, `prompts`)
2. Create `createPluginContext()` factory
3. Update EntityPlugin to use `PluginContext` instead of `EntityPluginContext`
4. Verify all entity plugins still work
5. Tests

### Phase 3: IntegrationPlugin class

1. Create `IntegrationPlugin` class extending BasePlugin with `getTools()`, `getResources()`, `setupMessageHandlers()`
2. Migrate system (store AI dependency in onRegister)
3. Migrate content-pipeline, directory-sync, site-builder, obsidian-vault, site-content, dashboard, analytics, buttondown
4. Migrate newsletter to EntityPlugin
5. Tests

### Phase 4: Cleanup

1. Remove `setupMessageHandlers()` from BasePlugin and from InterfacePlugin's register()
2. Remove `getTools()` and `getResources()` from BasePlugin
3. Delete CorePlugin class
4. Delete ServicePlugin class
5. Delete old context types and factories (CorePluginContext, ServicePluginContext, EntityPluginContext)
6. Update example plugins
7. Update docs, CLAUDE.md, plugin-patterns.md
8. Update test harness — one `createPluginHarness()` with `getContext()`
9. Tests

## Verification

1. `bun test` — all tests pass
2. `bun run typecheck` / `bun run lint`
3. Each plugin registers correctly with the new types
4. `system_create` still routes to correct generation handlers
5. `system_extract` still routes to correct derive() methods
6. Site builds still work (site-builder has views access)
7. Newsletter subscriber tools work (now in buttondown plugin)
8. Newsletter API routes work (now in buttondown plugin)
9. System plugin's ai.query() still works (stored dependency)
10. Only three plugin classes remain: IntegrationPlugin, EntityPlugin, InterfacePlugin
11. InterfacePluginContext unchanged — interfaces still work
12. All interfaces (MCP, Discord, Matrix, Webserver, A2A, CLI) work
