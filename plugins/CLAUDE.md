# Plugin Development Guidelines

Guidelines for developing EntityPlugin, ServicePlugin, and InterfacePlugin types.

> **Quick Reference**: See [docs/plugin-quick-reference.md](../docs/plugin-quick-reference.md) for a condensed cheat sheet.

## Plugin Type Selection

```typescript
// EntityPlugin — content type definitions (most common)
export class BlogPlugin extends EntityPlugin<BlogPost> {
  // Defines: entity type, schema, adapter, generation handler, derive()
  // No tools — entity CRUD goes through system_create/update/delete
}

// ServicePlugin — tools + external service integrations
export class DirectorySyncPlugin extends ServicePlugin {
  // Provides: tools, job handlers, API routes
  // Does NOT define entity types
}

// InterfacePlugin — transport layers (MCP, Discord, Webserver)
export class MCPInterface extends InterfacePlugin {
  // Provides: daemons, transport management, permissions
}
```

### Decision tree

1. **Does it define an entity type?** → `EntityPlugin` (in `entities/`)
2. **Does it provide tools or integrate with external services?** → `ServicePlugin` (in `plugins/`)
3. **Does it provide a user-facing transport?** → `InterfacePlugin` (in `interfaces/`)

## File Structure

### EntityPlugin (in `entities/`)

```
entities/blog/
├── src/
│   ├── index.ts           # Public exports
│   ├── plugin.ts          # EntityPlugin implementation
│   ├── schemas/           # Entity schema + frontmatter
│   ├── adapters/          # Markdown serialization
│   ├── handlers/          # Generation job handler
│   ├── datasources/       # Site builder data sources
│   ├── templates/         # AI generation + site templates
│   └── lib/               # Business logic
├── test/
│   └── plugin.test.ts
└── package.json
```

### ServicePlugin (in `plugins/`)

```
plugins/directory-sync/
├── src/
│   ├── index.ts
│   ├── plugin.ts          # ServicePlugin implementation
│   ├── tools/index.ts     # Tool definitions
│   ├── handlers/          # Job handlers
│   └── lib/               # Business logic
├── test/
└── package.json
```

## EntityPlugin Implementation

The most common plugin type. Defines an entity type with schema, adapter, and optional generation/derivation.

```typescript
import type {
  Plugin,
  EntityPluginContext,
  EntityTypeConfig,
  JobHandler,
  Template,
  DataSource,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";

export class BlogPlugin extends EntityPlugin<BlogPost, BlogConfig> {
  readonly entityType = "post";
  readonly schema = blogPostSchema;
  readonly adapter = blogPostAdapter;

  constructor(config: Partial<BlogConfig> = {}) {
    super("blog", packageJson, config, blogConfigSchema);
  }

  // Optional: entity type config (search weight, embeddable, etc.)
  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return { weight: 2.0 };
  }

  // Optional: AI generation handler (registered as {entityType}:generation)
  protected override createGenerationHandler(
    context: EntityPluginContext,
  ): JobHandler | null {
    return new BlogGenerationJobHandler(this.logger, context);
  }

  // Optional: AI templates for generation
  protected override getTemplates(): Record<string, Template> {
    return { generation: blogGenerationTemplate };
  }

  // Optional: data sources for site building
  protected override getDataSources(): DataSource[] {
    return [new BlogDataSource(this.logger)];
  }

  // Optional: additional registration (event subscriptions, eval handlers)
  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    // Subscribe to events, register eval handlers, etc.
  }
}
```

### What the base class handles automatically

- `context.entities.register(entityType, schema, adapter)` — no manual call needed
- `context.jobs.registerHandler("{entityType}:generation", handler)` — if createGenerationHandler returns a handler
- Template registration — if getTemplates returns templates
- DataSource registration — if getDataSources returns sources
- Extract handler registration — if derive() is overridden
- `getTools()` returns `[]` — EntityPlugins don't expose tools

### derive() — Event-driven entity derivation

For entities that are automatically maintained from other entities (topics from posts, series from posts, etc.):

```typescript
export class SeriesPlugin extends EntityPlugin<Series> {
  readonly entityType = "series";

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    // Wire up event subscriptions
    context.messaging.subscribe("entity:created", async (msg) => {
      if (msg.payload.entityType === "series") return { success: true };
      if (msg.payload.entity) {
        await this.derive(msg.payload.entity, "created", context);
      }
      return { success: true };
    });
  }

  // Called by event subscriptions + system_extract for batch reprocessing
  public override async derive(
    source: BaseEntity,
    event: DeriveEvent,
    context: EntityPluginContext,
  ): Promise<void> {
    // Create/update/delete derived entities based on source
  }

  // Called by system_extract when no source specified (batch mode)
  public override async deriveAll(context: EntityPluginContext): Promise<void> {
    // Full resync of all derived entities
  }
}
```

## ServicePlugin Implementation

For plugins that provide tools and integrate with external services.

```typescript
import {
  ServicePlugin,
  type ServicePluginContext,
  type Tool,
} from "@brains/plugins";

export class DirectorySyncPlugin extends ServicePlugin<DirectorySyncConfig> {
  constructor(config: Partial<DirectorySyncConfig> = {}) {
    super("directory-sync", packageJson, config, configSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Initialize services, subscribe to events, register job handlers
  }

  protected override async getTools(): Promise<Tool[]> {
    return createDirectorySyncTools(
      this.directorySync,
      this.getContext(),
      this.id,
    );
  }
}
```

## Entity Definition Pattern

```typescript
// 1. Define frontmatter schema (stored in markdown)
export const myFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  status: z.enum(["draft", "published"]),
});

// 2. Derive metadata using .pick() — only fields needed for DB queries
export const myMetadataSchema = myFrontmatterSchema
  .pick({ title: true, status: true })
  .extend({ slug: z.string() });

// 3. Entity schema extends BaseEntity
export const myEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("my-type"),
  metadata: myMetadataSchema,
});

// 4. Adapter extends BaseEntityAdapter
export class MyAdapter extends BaseEntityAdapter<MyEntity, MyMetadata> {
  constructor() {
    super({
      entityType: "my-type",
      schema: myEntitySchema,
      frontmatterSchema: myFrontmatterSchema,
    });
  }
  public toMarkdown(entity: MyEntity): string {
    /* ... */
  }
  public fromMarkdown(markdown: string): Partial<MyEntity> {
    /* ... */
  }
}
```

## Testing

Use the unified `createPluginHarness`:

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { MyPlugin } from "../src";

describe("MyPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test" });
    await harness.installPlugin(new MyPlugin());
  });

  it("should register entity type", () => {
    expect(harness.getEntityService().getEntityTypes()).toContain("my-type");
  });

  it("should execute tool", async () => {
    const result = await harness.executeTool("my-plugin_do-thing", {
      input: "test",
    });
    expect(result.success).toBe(true);
  });
});
```

## Import Rules

**Everything through `@brains/plugins`** — never import from shell packages directly:

```typescript
// CORRECT
import type {
  EntityPluginContext,
  JobHandler,
  BaseEntity,
} from "@brains/plugins";
import { EntityPlugin, BaseJobHandler } from "@brains/plugins";

// WRONG — don't import from shell packages
import type { JobHandler } from "@brains/job-queue";
import type { BaseEntity } from "@brains/entity-service";
```

## Reference Implementations

| Pattern               | Reference                                         |
| --------------------- | ------------------------------------------------- |
| EntityPlugin          | `entities/blog/src/plugin.ts`                     |
| EntityPlugin + derive | `entities/series/src/plugin.ts`                   |
| ServicePlugin         | `plugins/directory-sync/src/plugin.ts`            |
| MCP Bridge            | `plugins/notion/src/plugin.ts`                    |
| Job handler           | `entities/link/src/handlers/capture-handler.ts`   |
| Schema derivation     | `entities/blog/src/schemas/blog-post.ts`          |
| Entity adapter        | `entities/blog/src/adapters/blog-post-adapter.ts` |
