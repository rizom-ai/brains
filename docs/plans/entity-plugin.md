# Plan: EntityPlugin — Third Plugin Type

## Context

After moving create/generate tools to `system_create`, most content plugins now register an entity type, an adapter, maybe a generation handler, and return zero tools. They use ServicePlugin but don't need its full power (tools, MCP registration, views). A simpler base class captures this pattern.

## The three plugin types

| Type          | Purpose                               | Has tools | Has entity type | Context level                      |
| ------------- | ------------------------------------- | --------- | --------------- | ---------------------------------- |
| CorePlugin    | Read-only tools, resources, widgets   | Yes       | No              | CorePluginContext                  |
| EntityPlugin  | Entity type + adapter + handler       | No        | Yes             | EntityPluginContext (new, minimal) |
| ServicePlugin | Full CRUD + tools + complex workflows | Yes       | Yes             | ServicePluginContext               |

## What EntityPlugin looks like

```typescript
export class BlogPlugin extends EntityPlugin<BlogConfig> {
  readonly entityType = "post";
  readonly schema = blogPostSchema;
  readonly frontmatterSchema = blogPostFrontmatterSchema;
  readonly adapter = new BlogPostAdapter();

  // Optional: generation handler (registered as {entityType}:generation)
  protected createGenerationHandler(context: EntityPluginContext): JobHandler {
    return new BlogGenerationJobHandler(this.logger, context);
  }

  // Optional: templates for AI generation
  protected getTemplates(): Record<string, Template> {
    return { generation: blogGenerationTemplate };
  }

  // Optional: datasources for site building
  protected getDataSources(): DataSource[] {
    return [new BlogPostDataSource(this.logger)];
  }

  // Optional: message subscriptions
  protected onRegister(context: EntityPluginContext): void {
    // publish pipeline registration, auto-generate subscriptions, etc.
  }
}
```

## What the base class handles automatically

- `context.entities.register(entityType, schema, adapter)` — no manual call needed
- `context.jobs.registerHandler("{entityType}:generation", handler)` — if `createGenerationHandler` is defined
- Template registration — if `getTemplates` is defined
- DataSource registration — if `getDataSources` is defined
- Eval handler registration — if `createEvalHandler` is defined
- `getTools()` returns `[]` — EntityPlugins don't expose tools

## EntityPluginContext (subset of ServicePluginContext)

What entity management needs:

- `entityService` — read/write entities
- `logger` — logging
- `messaging` — subscribe/send events
- `ai` — AI generation (for handlers)
- `jobs` — enqueue/register handlers
- `templates` — register templates
- `identity` — brain character + profile access
- `entities` — register entity types
- `eval` — register eval handlers
- `conversations` — conversation access (for handlers like link capture)

Does NOT include:

- `views` — no route management
- `plugins` — no plugin introspection
- MCP tool/resource registration — EntityPlugins don't expose tools

The context type is intentionally separate from ServicePluginContext. Even though the diff is small today, it communicates the right constraint to plugin authors and provides a stable contract as the two contexts evolve independently.

## Which plugins become EntityPlugin

| Plugin       | Currently               | Becomes      | Why                                                          |
| ------------ | ----------------------- | ------------ | ------------------------------------------------------------ |
| blog         | ServicePlugin (1 tool)  | EntityPlugin | enhance-series becomes series:generation handler, 0 tools    |
| decks        | ServicePlugin (0 tools) | EntityPlugin | Entity + handler + templates                                 |
| note         | ServicePlugin (0 tools) | EntityPlugin | Entity + handler                                             |
| link         | ServicePlugin (0 tools) | EntityPlugin | Entity + handler (handler uses conversations + createEntity) |
| portfolio    | ServicePlugin (0 tools) | EntityPlugin | Entity + handler + datasources                               |
| social-media | ServicePlugin (0 tools) | EntityPlugin | Entity + handler + templates + datasources                   |
| wishlist     | ServicePlugin (0 tools) | EntityPlugin | Entity + handler                                             |
| products     | ServicePlugin           | EntityPlugin | Entity only (no handler)                                     |

## Which plugins stay ServicePlugin

| Plugin           | Why                                                         |
| ---------------- | ----------------------------------------------------------- |
| system           | Core tools (search, list, get, create, update, delete)      |
| content-pipeline | Orchestration tools (publish, queue)                        |
| newsletter       | Subscriber tools (subscribe, unsubscribe, list_subscribers) |
| directory-sync   | Infrastructure tools (sync, git_sync, git_status)           |
| site-builder     | Build tools + complex config                                |
| image            | Image tools (upload, generate, set-cover)                   |
| topics           | Has topics_batch-extract tool (see open question below)     |
| summary          | Has summary_get tool                                        |

## Open question: derived entity pattern

Topics and summary don't fit cleanly into EntityPlugin or the existing tool model. Their tools don't create _one_ entity from user input — they _derive_ entities from other entities (topics from posts, summaries from content). This "derive entities from other entities" pattern is distinct from creation (system_create), orchestration (pipeline), and building (site-builder). There may be a missing abstraction here. For now, topics and summary stay ServicePlugin. Revisit once EntityPlugin is in place and the pattern becomes clearer.

## Which plugins stay CorePlugin

| Plugin    | Why                                |
| --------- | ---------------------------------- |
| dashboard | Widget registration, no entities   |
| analytics | Query tool + head script injection |

## Blog: enhance-series migration

`blog_enhance-series` generates an AI description for a series entity. This is a generation handler, not a tool:

- Register as `series:generation` handler
- Triggered via `system_create` with `entityType: "series"` and a prompt
- Handler fetches series posts, generates description, updates entity
- Blog plugin drops to 0 tools → becomes EntityPlugin

## Packages stay in plugins/

No directory rename. The base class lives in `shell/plugins/src/entity/` and plugins stay in `plugins/`. The `entities/` workspace directory is deferred — the naming can change later without touching the base class or plugin code.

## Steps

### Step 1: Create EntityPlugin base class

- `shell/plugins/src/entity/entity-plugin.ts`
- Extends BasePlugin with entity-specific lifecycle
- Auto-registers entity type, adapter, handler, templates, datasources, eval handlers
- Returns empty tools array
- Export from `@brains/plugins`

### Step 2: Create EntityPluginContext

- Subset of ServicePluginContext
- Includes: entityService, logger, messaging, ai, jobs, templates, identity, entities, eval, conversations
- Excludes: views, plugins, MCP tool/resource registration

### Step 3: Migrate blog plugin (reference implementation)

- Convert `blog_enhance-series` tool → `series:generation` handler
- Change `extends ServicePlugin` to `extends EntityPlugin`
- Remove manual `onRegister` boilerplate
- Declare entity type, schema, adapter as class properties
- Override `createGenerationHandler` for blog generation
- Update tests

### Step 4: Migrate remaining plugins

- Convert: decks, note, link, portfolio, social-media, wishlist, products
- One commit per plugin
- Update brain model imports (`brains/rover/src/index.ts`, etc.)

### Step 5: Update test harness

- Add `createEntityPluginHarness` or update existing harness to detect EntityPlugin

### Step 6: Update docs

- `docs/architecture-overview.md` — update plugin types table
- `CLAUDE.md` — update plugin patterns

## Verification

1. `bun test` — all tests pass
2. `bun run typecheck` / `bun run lint`
3. Each migrated plugin still registers entities, handlers, templates, datasources
4. `system_create` still routes to correct handlers
5. Site builds still work (templates + datasources still registered)
6. `blog_enhance-series` removed, `series:generation` handler works via `system_create`
