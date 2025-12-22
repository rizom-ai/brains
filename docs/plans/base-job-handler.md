# BaseJobHandler Implementation Plan

## Overview

Create an abstract `BaseJobHandler` class to eliminate ~1000 lines of boilerplate across 11 job handlers.

---

## BaseJobHandler Design

**Location:** `shell/job-queue/src/base-job-handler.ts`

```typescript
export abstract class BaseJobHandler<TJobType, TInput, TOutput>
  implements JobHandler<TJobType, TInput, TOutput>
{
  protected readonly logger: Logger;
  protected readonly schema: ZodSchema<TInput>;
  protected readonly jobTypeName: string;

  constructor(
    logger: Logger,
    config: { schema: ZodSchema<TInput>; jobTypeName: string },
  ) {
    this.logger = logger;
    this.schema = config.schema;
    this.jobTypeName = config.jobTypeName;
  }

  // Default implementation - can be overridden
  validateAndParse(data: unknown): TInput | null {
    /* Zod parsing with logging */
  }

  // Default implementation - can be overridden
  async onError(error, data, jobId, progressReporter): Promise<void> {
    /* standard logging */
  }

  // Abstract - must implement
  abstract process(data, jobId, progressReporter): Promise<TOutput>;

  // Helper methods
  protected async reportProgress(reporter, step): Promise<void> {
    /* ... */
  }
  protected summarizeDataForLog(data): Record<string, unknown> {
    /* override for custom logging */
  }
}
```

---

## Migration Plan

### Phase 1: Create BaseJobHandler

- Create `shell/job-queue/src/base-job-handler.ts`
- Export from `shell/job-queue/src/index.ts`
- Run typecheck and tests

### Phase 2: Migrate Simple Handlers (4 files)

| Handler                   | File                                                               |
| ------------------------- | ------------------------------------------------------------------ |
| BlogGenerationJobHandler  | `plugins/blog/src/handlers/blogGenerationJobHandler.ts`            |
| DeckGenerationJobHandler  | `plugins/decks/src/handlers/deckGenerationJobHandler.ts`           |
| NoteGenerationJobHandler  | `plugins/note/src/handlers/noteGenerationJobHandler.ts`            |
| DirectoryDeleteJobHandler | `plugins/directory-sync/src/handlers/directoryDeleteJobHandler.ts` |

### Phase 3: Migrate Medium-Complexity Handlers (4 files)

| Handler                   | File                                                               | Notes                     |
| ------------------------- | ------------------------------------------------------------------ | ------------------------- |
| DirectorySyncJobHandler   | `plugins/directory-sync/src/handlers/directorySyncJobHandler.ts`   | Extra constructor param   |
| DirectoryImportJobHandler | `plugins/directory-sync/src/handlers/directoryImportJobHandler.ts` | Override validateAndParse |
| DirectoryExportJobHandler | `plugins/directory-sync/src/handlers/directoryExportJobHandler.ts` | Override validateAndParse |
| SiteBuildJobHandler       | `plugins/site-builder/src/handlers/siteBuildJobHandler.ts`         | Many constructor params   |

### Phase 4: Evaluate Singleton Handlers (2 files)

| Handler                     | File                                                                | Notes                  |
| --------------------------- | ------------------------------------------------------------------- | ---------------------- |
| EmbeddingJobHandler         | `shell/entity-service/src/handlers/embeddingJobHandler.ts`          | Keep singleton pattern |
| ContentGenerationJobHandler | `shell/content-service/src/handlers/contentGenerationJobHandler.ts` | Keep singleton pattern |

These use Component Interface Standardization pattern - evaluate if BaseJobHandler works with it.

---

## Example Migration

**Before:**

```typescript
export class BlogGenerationJobHandler implements JobHandler<...> {
  constructor(private logger: Logger, private context: ServicePluginContext) {}

  validateAndParse(data: unknown): BlogGenerationJobData | null {
    try {
      return blogGenerationJobSchema.parse(data);
    } catch (error) {
      this.logger.error("Invalid blog generation job data", { data, error });
      return null;
    }
  }

  async onError(error, data, jobId): Promise<void> {
    this.logger.error("Blog generation job error handler triggered", { ... });
  }

  async process(...): Promise<BlogGenerationResult> { /* ... */ }
}
```

**After:**

```typescript
export class BlogGenerationJobHandler extends BaseJobHandler<...> {
  constructor(logger: Logger, private context: ServicePluginContext) {
    super(logger, { schema: blogGenerationJobSchema, jobTypeName: "blog-generation" });
  }

  async process(...): Promise<BlogGenerationResult> { /* ... */ }

  // Optional: customize logging
  protected override summarizeDataForLog(data) {
    return { hasPrompt: !!data.prompt, title: data.title };
  }
}
```

---

## Files to Modify

**New:**

- `shell/job-queue/src/base-job-handler.ts`

**Update exports:**

- `shell/job-queue/src/index.ts`

**Migrate (8 handlers):**

- `plugins/blog/src/handlers/blogGenerationJobHandler.ts`
- `plugins/decks/src/handlers/deckGenerationJobHandler.ts`
- `plugins/note/src/handlers/noteGenerationJobHandler.ts`
- `plugins/directory-sync/src/handlers/directoryDeleteJobHandler.ts`
- `plugins/directory-sync/src/handlers/directorySyncJobHandler.ts`
- `plugins/directory-sync/src/handlers/directoryImportJobHandler.ts`
- `plugins/directory-sync/src/handlers/directoryExportJobHandler.ts`
- `plugins/site-builder/src/handlers/siteBuildJobHandler.ts`

**Evaluate (2 handlers with singleton):**

- `shell/entity-service/src/handlers/embeddingJobHandler.ts`
- `shell/content-service/src/handlers/contentGenerationJobHandler.ts`
