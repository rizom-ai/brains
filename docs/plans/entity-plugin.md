# Plan: EntityPlugin — Third Plugin Type

## Context

After moving create/generate tools to `system_create`, most content plugins now register an entity type, an adapter, maybe a generation handler, and return zero tools. They use ServicePlugin but don't need its full power (tools, job queue access, complex context). A simpler base class captures this pattern.

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
- `getTools()` returns `[]` — EntityPlugins don't expose tools

## EntityPluginContext (subset of ServicePluginContext)

Only what entity management needs:

- `entityService` — read/write entities
- `logger` — logging
- `messaging` — subscribe/send events
- `ai` — AI generation (for handlers)
- `jobs` — enqueue/register handlers
- `templates` — register templates
- `identity` — brain character + profile access
- `entities` — register entity types

Does NOT include:

- `views` — no route management
- `eval` — no eval handlers (move to separate concern)
- MCP tool/resource registration — EntityPlugins don't expose tools

## Which plugins become EntityPlugin

| Plugin       | Currently               | Becomes             | Why                                        |
| ------------ | ----------------------- | ------------------- | ------------------------------------------ |
| blog         | ServicePlugin (0 tools) | EntityPlugin        | Entity + handler + templates + datasources |
| decks        | ServicePlugin (0 tools) | EntityPlugin        | Entity + handler + templates               |
| note         | ServicePlugin (0 tools) | EntityPlugin        | Entity + handler                           |
| link         | ServicePlugin (0 tools) | EntityPlugin        | Entity + handler                           |
| portfolio    | ServicePlugin (0 tools) | EntityPlugin        | Entity + handler + datasources             |
| social-media | ServicePlugin (0 tools) | EntityPlugin        | Entity + handler + templates + datasources |
| wishlist     | ServicePlugin (0 tools) | EntityPlugin        | Entity + handler                           |
| topics       | ServicePlugin (0 tools) | EntityPlugin        | Entity + handler                           |
| summary      | ServicePlugin (1 tool)  | Stays ServicePlugin | Has summary_get tool                       |
| products     | ServicePlugin           | EntityPlugin        | Entity only (no handler)                   |

## Which plugins stay ServicePlugin

| Plugin           | Why                                                         |
| ---------------- | ----------------------------------------------------------- |
| system           | Core tools (search, list, get, create, update, delete)      |
| content-pipeline | Orchestration tools (publish, queue)                        |
| newsletter       | Subscriber tools (subscribe, unsubscribe, list_subscribers) |
| directory-sync   | Infrastructure tools (sync, git_sync, git_status)           |
| site-builder     | Build tools + complex config                                |
| image            | Image tools (upload, generate, set-cover)                   |

## Which plugins stay CorePlugin

| Plugin    | Why                                |
| --------- | ---------------------------------- |
| dashboard | Widget registration, no entities   |
| analytics | Query tool + head script injection |

## Directory structure

Entity plugins move to their own workspace: `entities/`

```
entities/           # Content type definitions
  blog/
  decks/
  note/
  link/
  portfolio/
  social-media/
  wishlist/
  topics/
  summary/
  products/

plugins/            # Things that provide tools
  system/
  content-pipeline/
  newsletter/
  directory-sync/
  site-builder/
  image/
  analytics/
  dashboard/
  obsidian-vault/
```

Root `package.json` workspaces adds `"entities/*"`.

## Steps

### Step 1: Create EntityPlugin base class

- `shell/plugins/src/entity/entity-plugin.ts`
- Extends BasePlugin with entity-specific lifecycle
- Auto-registers entity type, adapter, handler, templates, datasources
- Returns empty tools array

### Step 2: Create EntityPluginContext

- Subset of ServicePluginContext
- Contains only what entity management needs

### Step 3: Add `entities/*` workspace

- Update root `package.json` workspaces
- Update turborepo config if needed

### Step 4: Migrate blog plugin (reference implementation)

- Move `plugins/blog/` → `entities/blog/`
- Change `extends ServicePlugin` to `extends EntityPlugin`
- Remove manual `onRegister` boilerplate
- Declare entity type, schema, adapter as class properties
- Override `createGenerationHandler` for blog generation
- Update all imports across the codebase

### Step 5: Migrate remaining plugins

- Move + convert: decks, note, link, portfolio, social-media, wishlist, topics, products, summary
- One commit per plugin
- Update brain model imports (`brains/rover/src/index.ts`, etc.)

### Step 6: Update test harness

- Add `createEntityPluginHarness` or update existing harness to detect EntityPlugin

### Step 7: Update docs

- `docs/architecture/package-structure.md` — add entities section
- `docs/codebase-map.html` — add entities group
- `CLAUDE.md` — update plugin patterns

## Verification

1. `bun test` — all tests pass
2. `bun run typecheck` / `bun run lint`
3. Each migrated plugin still registers entities, handlers, templates, datasources
4. `system_create` still routes to correct handlers
5. Site builds still work (templates + datasources still registered)
