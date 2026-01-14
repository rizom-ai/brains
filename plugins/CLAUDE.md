# Plugin Development Guidelines

Guidelines for developing CorePlugin and ServicePlugin types.

> **Quick Reference**: See [docs/plugin-quick-reference.md](../docs/plugin-quick-reference.md) for a condensed cheat sheet.

## Plugin Type Selection

```typescript
// CorePlugin - For features that provide tools/resources (read-only)
export class MyFeaturePlugin extends CorePlugin {
  // Provides: tools, resources, handlers
}

// ServicePlugin - For plugins that manage entities (read/write)
export class DataPlugin extends ServicePlugin {
  // Provides: entities, tools, job handlers
}
```

## File Structure

```
plugins/my-plugin/
├── src/
│   ├── index.ts           # Main plugin export
│   ├── plugin.ts          # Plugin implementation
│   ├── config.ts          # Zod config schema
│   ├── schemas/           # Entity schemas
│   ├── adapters/          # Entity adapters
│   ├── tools/index.ts     # All tools
│   ├── handlers/          # Job handlers
│   └── lib/               # Business logic
├── test/
│   ├── plugin.test.ts
│   └── tools.test.ts
└── package.json
```

## ServicePlugin Implementation

```typescript
import {
  ServicePlugin,
  type ServicePluginContext,
  type PluginTool,
} from "@brains/plugins";
import { z } from "@brains/utils";

const configSchema = z.object({
  enableFeatureX: z.boolean().default(true),
});
type PluginConfig = z.infer<typeof configSchema>;

export class MyPlugin extends ServicePlugin<PluginConfig> {
  constructor(config?: Partial<PluginConfig>) {
    super("my-plugin", packageJson, config, configSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Register entity type
    context.entities.register("my-type", myEntitySchema, new MyEntityAdapter());

    // Subscribe to events
    context.messaging.subscribe(
      "entity:created",
      this.handleEntityCreated.bind(this),
    );
  }

  protected override async onInstall(
    context: ServicePluginContext,
  ): Promise<void> {
    // Register job handlers
    context.jobs.registerHandler(
      "my-job",
      new MyJobHandler(context.logger, context),
    );
  }

  protected override async getTools(
    context: ServicePluginContext,
  ): Promise<PluginTool[]> {
    return createMyTools(this.id, context);
  }
}
```

## Entity Definition Pattern

```typescript
// 1. Define entity schema
export const myEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("my-type"),
  metadata: myMetadataSchema,
});

// 2. Create factory function
export function createMyEntity(input: Partial<MyEntity>): MyEntity {
  const now = new Date().toISOString();
  return myEntitySchema.parse({
    id: input.id ?? slugify(input.metadata?.title ?? "untitled"),
    entityType: "my-type",
    created: now,
    updated: now,
    ...input,
  });
}

// 3. Implement adapter
export class MyEntityAdapter implements EntityAdapter<MyEntity> {
  entityType = "my-type";
  schema = myEntitySchema;

  toMarkdown(entity: MyEntity): string {
    const frontmatter = matter.stringify("", entity.frontmatter);
    return `${frontmatter}${entity.body}`;
  }

  fromMarkdown(markdown: string): Partial<MyEntity> {
    const { data, content } = matter(markdown);
    return { frontmatter: data, body: content.trim() };
  }
}
```

## Schema Derivation Pattern

Keep metadata in sync with frontmatter using `.pick()`:

```typescript
// Step 1: Define complete frontmatter schema (stored in markdown)
export const myFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  status: z.enum(["draft", "published"]),
  description: z.string(),
});

// Step 2: Derive metadata using .pick() - only fields needed for DB queries
export const myMetadataSchema = myFrontmatterSchema
  .pick({ title: true, status: true })
  .extend({
    slug: z.string(), // Required in metadata (auto-generated)
  });

// Step 3: Entity schema extends BaseEntity
export const myEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("my-type"),
  metadata: myMetadataSchema,
});
```

**Why**: Using `.pick()` prevents metadata from drifting out of sync with frontmatter.

## Job Handler Pattern

For async operations, extend BaseJobHandler:

```typescript
import { BaseJobHandler } from "@brains/plugins";
import { PROGRESS_STEPS, JobResult } from "@brains/utils";

const myJobSchema = z.object({
  topic: z.string(),
  year: z.number(),
});
type MyJobData = z.infer<typeof myJobSchema>;

export class MyJobHandler extends BaseJobHandler<
  "my-job",
  MyJobData,
  MyJobResult
> {
  constructor(
    logger: Logger,
    private context: ServicePluginContext,
  ) {
    super(logger, { schema: myJobSchema, jobTypeName: "my-job" });
  }

  async process(
    data: MyJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<MyJobResult> {
    try {
      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.START,
        message: "Starting job",
      });

      // ... do work ...

      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.COMPLETE,
        message: "Job complete",
      });

      return { success: true, entityId: "new-id" };
    } catch (error) {
      return JobResult.failure(error);
    }
  }
}
```

**Standard utilities:**

- `PROGRESS_STEPS`: START(0), INIT(10), FETCH(20), PROCESS(40), GENERATE(50), EXTRACT(60), SAVE(80), COMPLETE(100)
- `JobResult.success(data)`: Returns `{ success: true, ...data }`
- `JobResult.failure(error)`: Returns `{ success: false, error: string }`

## Async Job Pattern (Tools Queue Jobs)

For operations >1 second, queue a job and return immediately:

```typescript
// In tool handler:
const jobId = await context.jobs.enqueue(
  "my-job-type", // Job type (matches handler)
  { topic, year }, // Job data
  toolContext, // Tool context (for permissions)
  { source: `${pluginId}_create` },
);

return {
  success: true,
  data: { jobId },
  message: `Job queued (jobId: ${jobId})`,
};
```

## Messaging

Use messaging for cross-plugin communication:

```typescript
// Define event constants
export const MY_EVENT = "my-plugin:event";

// Send messages
await context.messaging.send(MY_EVENT, {
  entityId: entity.id,
  action: "processed",
});

// Subscribe to events
context.messaging.subscribe(OTHER_EVENT, async (payload) => {
  await this.processEvent(payload);
  return { success: true };
});
```

## Testing

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { createServicePluginHarness } from "@brains/plugins/test";
import { MyPlugin } from "../src";

describe("MyPlugin", () => {
  let harness: ReturnType<typeof createServicePluginHarness>;

  beforeEach(async () => {
    harness = createServicePluginHarness({ dataDir: "/tmp/test" });
    await harness.installPlugin(new MyPlugin());
  });

  it("should execute tool successfully", async () => {
    const result = await harness.executeTool("my-plugin_create", {
      topic: "test",
    });
    expect(result.success).toBe(true);
  });
});
```

## Reference Implementations

| Pattern           | Reference File                                   |
| ----------------- | ------------------------------------------------ |
| Complete plugin   | `plugins/link/src/`                              |
| Job handler       | `plugins/link/src/handlers/capture-handler.ts`   |
| Schema derivation | `plugins/blog/src/schemas/blog-post.ts`          |
| Entity adapter    | `plugins/blog/src/adapters/blog-post-adapter.ts` |
