# Publishing Pipeline Abstraction Plan

## Goal

Create a comprehensive publishing infrastructure that can be shared across plugins (blog, decks, social-media, future plugins). Enable scheduled/queued publishing for all content types.

## Key Decisions

1. **New package**: `@brains/publish-pipeline` (not adding to existing package)
2. **Status states**: `draft`, `queued`, `published`, `failed` (use "queued" not "pending")
3. **QueueManager**: Class instance, not utility functions
4. **Two publish paths**:
   - Queue path: draft → queued → published/failed (via scheduler)
   - Direct path: draft → published (immediate, bypass queue)
5. **Scheduler**: Always on - `queued` status means "will auto-publish"
6. **Retries**: Uniform across all publishers (internal and external)
7. **Migration**: Build full infrastructure first, then migrate all plugins
8. **Blog/Decks**: Get full queue tools + scheduler (not just publish factory)
9. **Storage**: Keep `queueOrder`/`retryCount` in frontmatter for simplicity

## Current State Analysis

### Blog/Decks Publishing (Synchronous)

- **Location**: `plugins/blog/src/tools/publish.ts`, `plugins/decks/src/tools/publish.ts`
- **Pattern**: Direct entity update - sets `status: "published"` and `publishedAt`
- No queue, no scheduling, no external API calls

### Social-Media Publishing (Asynchronous + Retries)

- **GenerationJobHandler**: Creates posts (draft or queued)
- **PublishCheckerJobHandler**: Self-re-enqueueing daemon polling for queued posts
- **PublishJobHandler**: Publishes to external platform with retry logic
- **Queue tools**: add, remove, reorder, list

### Common Patterns Identified

1. **Status Machine**: `draft → queued → published | failed`
2. **Queue Management**: position ordering, add/remove operations
3. **Publish Action**: update status + timestamp (+ optional external call)
4. **Scheduled Publishing**: daemon pattern for automated publishing

## Architecture: `@brains/publish-pipeline` Package

### New Package Location

`packages/publish-pipeline/`

### Core Components

#### 1. Status Machine

```typescript
// Status types shared across publishable entities
type PublishStatus = "draft" | "queued" | "published" | "failed";

// Zod schemas for status fields
const publishStatusSchema = z.enum(["draft", "queued", "published", "failed"]);
const publishableMetadataSchema = z.object({
  status: publishStatusSchema.default("draft"),
  queueOrder: z.number().optional(),
  publishedAt: z.string().datetime().optional(),
  retryCount: z.number().default(0),
  lastError: z.string().optional(),
});
```

#### 2. Publish Provider Interface

```typescript
interface PublishProvider<TResult = { id: string }> {
  name: string;
  publish(content: string, metadata: Record<string, unknown>): Promise<TResult>;
  validateCredentials?(): Promise<boolean>;
}

// Internal provider (just updates entity)
class InternalPublishProvider implements PublishProvider {
  async publish(content, metadata) {
    return { id: "internal" }; // No external call needed
  }
}
```

#### 3. Queue Manager

```typescript
class QueueManager<T extends Entity> {
  constructor(
    private context: ServicePluginContext,
    private entityType: string,
    private adapter: EntityAdapter<T>,
  );

  async add(entityId: string): Promise<{ position: number }>;
  async remove(entityId: string): Promise<void>;
  async reorder(entityId: string, newPosition: number): Promise<void>;
  async list(): Promise<Array<{ entity: T; position: number }>>;
  async getNext(): Promise<T | null>;
}
```

#### 4. Publish Tool Factory

```typescript
interface CreatePublishToolConfig<T extends Entity> {
  entityType: string;
  displayName: string;
  frontmatterSchema: ZodSchema;
  adapter: EntityAdapter<T>;
  provider?: PublishProvider; // Optional for external publishing
  getMetadataUpdates?: (fm: unknown) => Partial<T["metadata"]>;
}

function createPublishTool<T extends Entity>(
  context: ServicePluginContext,
  pluginId: string,
  config: CreatePublishToolConfig<T>,
): PluginTool;
```

#### 5. Queue Tool Factory

```typescript
function createQueueTool<T extends Entity>(
  context: ServicePluginContext,
  pluginId: string,
  queueManager: QueueManager<T>,
): PluginTool;
```

#### 6. Publish Scheduler (Daemon Base)

```typescript
abstract class PublishScheduler<T extends Entity> extends BaseJobHandler {
  constructor(
    logger: Logger,
    protected context: ServicePluginContext,
    protected queueManager: QueueManager<T>,
    protected config: { interval: number; enabled: boolean },
  );

  // Template method - subclasses implement actual publishing
  protected abstract publishEntity(entity: T): Promise<PublishResult>;

  async process(): Promise<SchedulerResult> {
    const next = await this.queueManager.getNext();
    if (next) await this.publishEntity(next);
    await this.scheduleNext();
    return { success: true };
  }
}
```

#### 7. Retry Utilities

```typescript
interface RetryConfig {
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  onRetry?: (attempt: number, error: Error) => void,
): Promise<T>;

// For job handlers - tracks retry state in entity
class RetryTracker {
  shouldRetry(entity: Entity, config: RetryConfig): boolean;
  recordFailure(entity: Entity, error: Error): Entity;
  recordSuccess(entity: Entity): Entity;
}
```

## Package Structure

```
packages/publish-pipeline/
├── src/
│   ├── index.ts
│   ├── schemas/
│   │   └── publishable.ts          # Status, queue schemas
│   ├── queue/
│   │   ├── queue-manager.ts        # Queue operations
│   │   └── queue-tool.ts           # Tool factory
│   ├── publish/
│   │   ├── provider.ts             # Provider interface
│   │   ├── internal-provider.ts    # Default (no external API)
│   │   └── publish-tool.ts         # Tool factory
│   ├── scheduler/
│   │   └── publish-scheduler.ts    # Daemon base class
│   └── retry/
│       └── retry-utils.ts          # Retry helpers
└── test/
    ├── queue-manager.test.ts
    ├── publish-tool.test.ts
    └── retry-utils.test.ts
```

## Implementation Plan

### Phase 1: Build Complete Package

1. Create `packages/publish-pipeline/` with package.json, tsconfig
2. Implement schemas (publishable status, queue metadata)
3. Implement `QueueManager` class
4. Implement `createQueueTool` factory
5. Implement `PublishProvider` interface + `InternalPublishProvider`
6. Implement `createPublishTool` factory
7. Implement `PublishScheduler` base class
8. Implement retry utilities
9. Write tests for all components
10. Export everything from index.ts

### Phase 2: Migrate All Plugins

1. **social-media**: Refactor to use package
   - queue.ts → use `createQueueTool`
   - publishHandler.ts → use retry utilities
   - publishCheckerHandler.ts → extend `PublishScheduler`
2. **blog**: Add queue + scheduler
   - publish.ts → use `createPublishTool`
   - Add queue tool using `createQueueTool`
   - Add scheduler extending `PublishScheduler`
3. **decks**: Add queue + scheduler
   - publish.ts → use `createPublishTool`
   - Add queue tool using `createQueueTool`
   - Add scheduler extending `PublishScheduler`

### Phase 3: Cleanup

1. Remove duplicated code from plugins
2. Update turbo.json build order
3. Run all tests, fix any issues

## Files to Create

- `packages/publish-pipeline/package.json`
- `packages/publish-pipeline/tsconfig.json`
- `packages/publish-pipeline/src/index.ts`
- `packages/publish-pipeline/src/schemas/publishable.ts`
- `packages/publish-pipeline/src/queue/queue-manager.ts`
- `packages/publish-pipeline/src/queue/queue-tool.ts`
- `packages/publish-pipeline/src/publish/provider.ts`
- `packages/publish-pipeline/src/publish/internal-provider.ts`
- `packages/publish-pipeline/src/publish/publish-tool.ts`
- `packages/publish-pipeline/src/scheduler/publish-scheduler.ts`
- `packages/publish-pipeline/src/retry/retry-utils.ts`

## Files to Modify

- `plugins/blog/src/tools/publish.ts` - Use factory
- `plugins/decks/src/tools/publish.ts` - Use factory
- `plugins/social-media/src/tools/queue.ts` - Use factory
- `plugins/social-media/src/handlers/publishCheckerHandler.ts` - Extend base
- `plugins/social-media/src/handlers/publishHandler.ts` - Use retry utils
- `turbo.json` - Add new package to build order
