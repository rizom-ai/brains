# Plan: Plugin Simplification — Two Types, One Context

## Context

The plugin system currently has four classes (BasePlugin, CorePlugin, ServicePlugin, EntityPlugin) and three context types (CorePluginContext, ServicePluginContext, EntityPluginContext). This is too much surface area for what boils down to two concerns:

1. **Does it define an entity type?** → EntityPlugin
2. **Does it provide tools / integrate with external services?** → IntegrationPlugin
3. **Does it provide a transport layer?** → InterfacePlugin (unchanged)

ServicePlugin was the original "do everything" class. CorePlugin was "read-only tools." EntityPlugin was added for "entity only, no tools." In practice, every plugin is either defining content types or providing integrations — these don't overlap.

Plugins that currently mix both (newsletter = entity + Buttondown tools) should be split into separate plugins.

## Design

### Three plugin types, sibling classes

```
BasePlugin (abstract)
  ├── IntegrationPlugin  → tools + external service connections
  ├── EntityPlugin       → content types + derive()
  └── InterfacePlugin    → transports + daemons
```

`BasePlugin` handles: id, config, logger, lifecycle hooks (onRegister, onShutdown), templates, datasources, instructions.

`IntegrationPlugin` adds: `getTools()`, `getResources()`.

`EntityPlugin` adds: `entityType`, `schema`, `adapter`, `createGenerationHandler()`, optional `derive()`, auto-registration.

`InterfacePlugin` adds: daemons, transport management, permissions. Currently extends CorePlugin — reparented to extend BasePlugin directly.

All three are siblings. No inheritance between them. No empty method overrides.

### One context type

`PluginContext` replaces all three context types. Both Plugin and EntityPlugin receive the same context. The constraint is at the class level, not the context level.

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
  readonly ai: IAINamespace;
  readonly jobs: IJobsNamespace;
  readonly templates: ITemplatesNamespace;
  readonly messaging: IMessagingNamespace;
  readonly conversations: IConversationsNamespace;
  readonly eval: IEvalNamespace;

  // Infrastructure
  readonly logger: Logger;
  readonly dataDir: string;

  // MCP registration (used by Plugin, not EntityPlugin)
  readonly resources: IResourcesNamespace;
  readonly prompts: IPromptsNamespace;
}
```

EntityPlugin ignores `resources` and `prompts` — the class simply doesn't call them. Plugin uses them to register MCP resources and prompts.

### Derived entities via derive()

Some entity types are automatically maintained in response to events — not created by users. `derive()` is an optional method on EntityPlugin for this pattern.

```typescript
export class TopicPlugin extends EntityPlugin<Topic> {
  readonly entityType = "topic";
  readonly schema = topicSchema;
  readonly adapter = topicAdapter;

  protected override async onRegister(context: PluginContext): Promise<void> {
    // Wire up derivation events — plugin decides what to listen to
    context.messaging.subscribe("entity:created", (msg) => {
      if (["post", "link"].includes(msg.payload.entityType)) {
        this.derive(msg.payload.entity, "created", context);
      }
    });
  }

  // Called by event subscriptions (automatic) and system_extract (manual)
  protected async derive(
    source: unknown,
    event: string,
    context: PluginContext,
  ): Promise<void> {
    // Extract topics from source content, create/merge topic entities
  }
}
```

No magic auto-wiring. No `derivedFrom` config. The plugin subscribes to whatever events it needs in `onRegister()` and calls `derive()` itself. The method exists for:

- **Convention**: signals this is a derived entity
- **Testability**: call `derive()` directly in tests without firing events
- **Manual trigger**: `system_extract` calls `derive()` for batch reprocessing

#### Derived entity plugins

| Plugin       | Subscribes to                                                        | What derive() does                                     |
| ------------ | -------------------------------------------------------------------- | ------------------------------------------------------ |
| topics       | `entity:created`, `entity:updated` for posts/links                   | Extract topics, create/merge topic entities            |
| series       | `entity:created`, `entity:updated`, `entity:deleted` for posts/decks | Group by `seriesName`, auto-create/delete series       |
| summary      | `conversation:completed`                                             | Regenerate summary from conversation history           |
| link         | `conversation:message`                                               | Detect URLs in messages, auto-capture as link entities |
| social-media | `entity:created` for posts                                           | Auto-generate social posts from new blog content       |

Some plugins have both `derive()` (event-driven) and `createGenerationHandler()` (user-triggered):

- **Link**: derive() auto-captures URLs from conversations + generation handler for explicit "capture this URL"
- **Summary**: derive() auto-regenerates on conversation completion + generation handler for "summarize my conversations"
- **Social-media**: derive() auto-generates social posts from new content + generation handler for explicit "create a post about X"

### system_extract tool

One tool in the system plugin for manual/batch derivation:

```
system_extract { entityType: "topic" }                          → extract all
system_extract { entityType: "topic", source: "post-123" }      → extract from one
system_extract { entityType: "series" }                          → resync all series
system_extract { entityType: "summary" }                         → regenerate summary
```

Routes to the EntityPlugin's `derive()` method. Same routing pattern as `system_create` → `{entityType}:generation`.

### IntegrationPlugin replaces CorePlugin + ServicePlugin

| Current         | Becomes           | Why                                                   |
| --------------- | ----------------- | ----------------------------------------------------- |
| CorePlugin      | IntegrationPlugin | Has tools, no entities                                |
| ServicePlugin   | IntegrationPlugin | Has tools, no entities (after entity split)           |
| EntityPlugin    | EntityPlugin      | Has entities, no tools                                |
| InterfacePlugin | InterfacePlugin   | Transports — reparented from CorePlugin to BasePlugin |

### What gets split

Only newsletter needs splitting — topics, summary, and series are pure EntityPlugins with derive().

| Current plugin | Entity part → EntityPlugin               | Integration part → IntegrationPlugin |
| -------------- | ---------------------------------------- | ------------------------------------ |
| newsletter     | Newsletter entity + generation + publish | Buttondown subscriber tools          |

### Migration map

| Plugin           | Currently          | Becomes                                   | Notes                                            |
| ---------------- | ------------------ | ----------------------------------------- | ------------------------------------------------ |
| blog             | EntityPlugin       | EntityPlugin                              | Already migrated, series extracted to own plugin |
| decks            | EntityPlugin       | EntityPlugin                              | Already migrated                                 |
| note             | EntityPlugin       | EntityPlugin                              | Already migrated                                 |
| link             | EntityPlugin       | EntityPlugin                              | Already migrated                                 |
| portfolio        | EntityPlugin       | EntityPlugin                              | Already migrated                                 |
| social-media     | ServicePlugin      | EntityPlugin                              | Zero tools, just subscriptions                   |
| wishlist         | EntityPlugin       | EntityPlugin                              | Already migrated                                 |
| products         | EntityPlugin       | EntityPlugin                              | Already migrated                                 |
| series           | Part of blog       | EntityPlugin (new, with derive())         | Extracted from blog                              |
| topics           | ServicePlugin      | EntityPlugin (with derive())              | batch-extract tool → system_extract              |
| summary          | ServicePlugin      | EntityPlugin (with derive() + generation) | summary_get tool → system_extract                |
| newsletter       | ServicePlugin      | EntityPlugin                              | Buttondown tools extracted                       |
| buttondown       | Part of newsletter | IntegrationPlugin (new)                   | Subscriber tools only                            |
| system           | ServicePlugin      | IntegrationPlugin                         | Tools only, no entities                          |
| content-pipeline | ServicePlugin      | IntegrationPlugin                         | Orchestration tools                              |
| directory-sync   | ServicePlugin      | IntegrationPlugin                         | Git/filesystem tools                             |
| site-builder     | ServicePlugin      | IntegrationPlugin                         | Build tools                                      |
| image            | ServicePlugin      | IntegrationPlugin                         | Image tools                                      |
| dashboard        | CorePlugin         | IntegrationPlugin                         | Widget tools                                     |
| analytics        | CorePlugin         | IntegrationPlugin                         | Query tool + scripts                             |
| mcp              | InterfacePlugin    | InterfacePlugin                           | Reparented from CorePlugin to BasePlugin         |
| discord          | InterfacePlugin    | InterfacePlugin                           | Reparented                                       |
| matrix           | InterfacePlugin    | InterfacePlugin                           | Reparented                                       |
| webserver        | InterfacePlugin    | InterfacePlugin                           | Reparented                                       |
| a2a              | InterfacePlugin    | InterfacePlugin                           | Reparented                                       |

### What gets deleted

- `CorePlugin` class
- `ServicePlugin` class
- `CorePluginContext` type
- `ServicePluginContext` type
- `EntityPluginContext` type
- `createCorePluginContext()` function
- `createServicePluginContext()` function
- `createEntityPluginContext()` function
- `topics_batch-extract` tool (replaced by `system_extract`)
- `summary_get` tool (replaced by `system_extract`)
- `blog_enhance-series` tool (already removed — `series:generation` handler)

### What gets added

- `PluginContext` — single unified context type
- `createPluginContext()` — single context factory
- `IntegrationPlugin` class — replaces CorePlugin + ServicePlugin
- `derive()` optional method on EntityPlugin
- `system_extract` tool in system plugin
- `plugins/series/` — new EntityPlugin with derive()
- `plugins/buttondown/` — new Plugin with subscriber tools

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

## Steps

### Phase 1: derive() + system_extract

Foundation for derived entities.

1. Add optional `derive()` method to EntityPlugin
2. Add `system_extract` tool to system plugin
3. Route to EntityPlugin's derive() via `{entityType}:extract` handler convention
4. Tests

### Phase 2: Extract series from blog

Validates derive() with the simplest case.

1. Create `plugins/series/` EntityPlugin with derive()
2. Move series schema, adapter, datasource, templates, routes from blog
3. Series subscribes to entity events in onRegister(), calls derive()
4. Blog becomes single-entity EntityPlugin (post only)
5. Update brain model registrations
6. Tests

### Phase 3: Migrate topics + summary

Convert to EntityPlugin with derive().

1. Topics: remove batch-extract tool, add derive(), subscribe to entity events
2. Summary: remove summary_get tool, add derive(), subscribe to conversation events
3. Both keep generation handlers for system_create
4. Tests

### Phase 4: Split newsletter

Validates the entity/integration split.

1. Extract Buttondown subscriber tools into `plugins/buttondown/`
2. Strip newsletter to entity + generation + publish (EntityPlugin)
3. Update brain models to register both
4. Tests

### Phase 5: Unified context

1. Create `PluginContext` type combining all namespaces
2. Create `createPluginContext()` factory
3. Update EntityPlugin and all subclasses to use `PluginContext`
4. Tests

### Phase 6: IntegrationPlugin class + final migrations

1. Create `IntegrationPlugin` class extending BasePlugin with `getTools()`, `getResources()`
2. Move `setupMessageHandlers()` from BasePlugin to IntegrationPlugin
3. Migrate system, content-pipeline, directory-sync, site-builder, image, dashboard, analytics, buttondown from ServicePlugin/CorePlugin to IntegrationPlugin
4. Reparent InterfacePlugin from CorePlugin to BasePlugin
5. Migrate social-media to EntityPlugin
6. Delete CorePlugin and ServicePlugin classes
7. Tests

### Phase 7: Cleanup

1. Delete old context types and factories
2. Update docs, CLAUDE.md, plugin-patterns.md
3. Update test harness — one `createPluginHarness()` with `getContext()`

## Verification

1. `bun test` — all tests pass
2. `bun run typecheck` / `bun run lint`
3. Each plugin registers correctly with the new types
4. `system_create` still routes to correct generation handlers
5. `system_extract` routes to correct derive() methods
6. Site builds still work
7. Newsletter subscriber tools work (now in buttondown plugin)
8. Series auto-derive from posts via derive()
9. Topics extract via derive() on entity changes
10. Summary regenerates via derive() on conversation changes
11. Only three plugin classes remain: IntegrationPlugin, EntityPlugin, InterfacePlugin
12. InterfacePlugin extends BasePlugin directly (not CorePlugin)
13. All interfaces (MCP, Discord, Matrix, Webserver, A2A) work after reparenting
