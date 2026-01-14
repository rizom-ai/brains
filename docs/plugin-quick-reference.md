# Plugin Development Quick Reference

A condensed guide for rapidly developing plugins. Detailed guidelines are auto-loaded from `plugins/CLAUDE.md` and `interfaces/CLAUDE.md` when working in those directories.

## Decision Tree: Which Plugin Type?

```
Need to manage entities/data?
├─ Yes → ServicePlugin (most common)
└─ No
    ├─ Read-only operations? → CorePlugin
    └─ User-facing interface? → InterfacePlugin or MessageInterfacePlugin
```

## Standard File Structure

```
plugins/my-plugin/
├── src/
│   ├── index.ts           # Export plugin class
│   ├── plugin.ts          # Main plugin implementation
│   ├── config.ts          # Zod config schema
│   ├── schemas/           # Entity schemas (frontmatter, metadata, entity)
│   ├── adapters/          # Entity adapters (markdown ↔ entity)
│   ├── tools/index.ts     # All tools in one file
│   ├── handlers/          # Job handlers for async operations
│   └── lib/               # Business logic
├── test/
│   ├── plugin.test.ts
│   └── tools.test.ts
└── package.json
```

## Essential Imports

```typescript
// Plugin framework
import { ServicePlugin, createTool, BaseJobHandler } from "@brains/plugins";
import type {
  ServicePluginContext,
  ToolContext,
  PluginTool,
} from "@brains/plugins";

// Utilities
import { z, PROGRESS_STEPS, JobResult, slugify } from "@brains/utils";
import type { Logger, ProgressReporter } from "@brains/utils";

// Testing
import { createServicePluginHarness } from "@brains/plugins/test";
```

---

## Key Patterns

### 1. Schema Derivation (Frontmatter → Metadata)

Keep metadata in sync with frontmatter using `.pick()`:

```typescript
// Step 1: Define complete frontmatter schema (stored in markdown)
export const myFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().optional(), // Auto-generated if not provided
  status: z.enum(["draft", "published"]),
  description: z.string(),
  tags: z.array(z.string()).optional(),
});

// Step 2: Derive metadata using .pick() - only fields needed for DB queries
export const myMetadataSchema = myFrontmatterSchema
  .pick({
    title: true,
    status: true,
  })
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

---

### 2. Async Job Pattern (Tools Queue Jobs)

For operations taking >1 second, queue a job and return immediately:

```typescript
// In tool handler:
async (input: unknown, toolContext: ToolContext) => {
  const { topic, year } = inputSchema.parse(input);

  const jobId = await context.jobs.enqueue(
    "my-job-type", // Job type (matches handler)
    { topic, year }, // Job data
    toolContext, // Tool context (for permissions)
    {
      source: `${pluginId}_create`,
      metadata: { operationType: "content_operations" },
    },
  );

  return {
    success: true,
    data: { jobId },
    message: `Job queued (jobId: ${jobId})`,
  };
};
```

---

### 3. BaseJobHandler Extension

All job handlers should extend `BaseJobHandler`:

```typescript
import { BaseJobHandler } from "@brains/plugins";
import { PROGRESS_STEPS, JobResult } from "@brains/utils";

const myJobSchema = z.object({
  topic: z.string(),
  year: z.number(),
});
type MyJobData = z.infer<typeof myJobSchema>;

interface MyJobResult {
  success: boolean;
  entityId?: string;
  error?: string;
}

export class MyJobHandler extends BaseJobHandler<
  "my-job",
  MyJobData,
  MyJobResult
> {
  constructor(
    logger: Logger,
    private context: ServicePluginContext,
  ) {
    super(logger, {
      schema: myJobSchema,
      jobTypeName: "my-job",
    });
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

      return { success: true, entityId: "new-entity-id" };
    } catch (error) {
      return JobResult.failure(error);
    }
  }

  // Optional: customize what gets logged (hide sensitive data)
  protected override summarizeDataForLog(
    data: MyJobData,
  ): Record<string, unknown> {
    return { topic: data.topic, year: data.year };
  }
}
```

---

### 4. PROGRESS_STEPS Constants

Standard progress percentages for job handlers:

```typescript
import { PROGRESS_STEPS } from "@brains/utils";

// Available steps:
PROGRESS_STEPS.START; // 0
PROGRESS_STEPS.INIT; // 10
PROGRESS_STEPS.FETCH; // 20
PROGRESS_STEPS.PROCESS; // 40
PROGRESS_STEPS.GENERATE; // 50
PROGRESS_STEPS.EXTRACT; // 60
PROGRESS_STEPS.SAVE; // 80
PROGRESS_STEPS.COMPLETE; // 100

// Usage:
await this.reportProgress(progressReporter, {
  progress: PROGRESS_STEPS.FETCH,
  message: "Fetching data",
});
```

---

### 5. JobResult Utility

Helper for consistent job results:

```typescript
import { JobResult } from "@brains/utils";

// Success - spreads data into result
return JobResult.success({ entityId: "abc", title: "My Title" });
// Returns: { success: true, entityId: "abc", title: "My Title" }

// Failure - extracts error message
return JobResult.failure(error);
// Returns: { success: false, error: "Error message" }
```

---

### 6. Tool Definition

Use `createTool` for all plugin tools:

```typescript
import { createTool } from "@brains/plugins";

export function createMyTools(
  pluginId: string,
  context: ServicePluginContext,
): PluginTool[] {
  return [
    createTool(
      pluginId,
      "create", // Tool name becomes: my-plugin_create
      "Create a new entity from a topic",
      {
        topic: z.string().describe("Topic to create entity about"),
        year: z.number().describe("Year for the entity"),
      },
      async (input: unknown, toolContext: ToolContext) => {
        try {
          const { topic, year } = inputSchema.parse(input);
          // ... implementation
          return { success: true, data: { entityId }, message: "Created" };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    ),
  ];
}
```

---

### 7. Testing with Service Plugin Harness

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { createServicePluginHarness } from "@brains/plugins/test";
import { MyPlugin } from "../src/plugin";

describe("MyPlugin", () => {
  let harness: ReturnType<typeof createServicePluginHarness>;

  beforeEach(async () => {
    harness = createServicePluginHarness({ dataDir: "/tmp/test" });
    await harness.installPlugin(
      new MyPlugin({
        /* config */
      }),
    );
  });

  it("should create entity via tool", async () => {
    const result = await harness.executeTool("my-plugin_create", {
      topic: "Test Topic",
      year: 2024,
    });

    expect(result.success).toBe(true);
  });
});
```

---

## Reference Implementations

| Pattern           | Reference File                                         |
| ----------------- | ------------------------------------------------------ |
| Complete plugin   | `plugins/link/src/`                                    |
| Job handler       | `plugins/link/src/handlers/capture-handler.ts`         |
| Schema derivation | `plugins/blog/src/schemas/blog-post.ts`                |
| Async tools       | `plugins/image/src/tools/index.ts`                     |
| Entity adapter    | `plugins/blog/src/adapters/blog-post-adapter.ts`       |
| Mock context      | `shared/test-utils/src/mock-service-plugin-context.ts` |

---

## Common Mistakes

| Mistake                                    | Fix                                             |
| ------------------------------------------ | ----------------------------------------------- |
| Hardcoded progress numbers                 | Use `PROGRESS_STEPS.X` constants                |
| Duplicating frontmatter fields in metadata | Use `.pick()` to derive metadata                |
| Blocking tools on long operations          | Queue job, return `{ jobId }`                   |
| Manual error message extraction            | Use `JobResult.failure(error)`                  |
| Not registering job handlers               | Call `context.jobs.register()` in `onInstall()` |
