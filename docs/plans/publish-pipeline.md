# Publishing Pipeline Abstraction Plan

## Goal

Create a comprehensive publishing infrastructure that can be shared across plugins (blog, decks, social-media, future plugins). Enable scheduled/queued publishing for all content types.

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

## Migration Plan

### Phase 1: Create Package Infrastructure

1. Create `packages/publish-pipeline/` with package.json, tsconfig
2. Implement schemas (publishable status, queue metadata)
3. Write tests for schemas

### Phase 2: Queue Management

1. Implement `QueueManager` class
2. Implement `createQueueTool` factory
3. Write tests
4. Refactor social-media queue.ts to use factory

### Phase 3: Publish Tool Factory

1. Implement `PublishProvider` interface
2. Implement `InternalPublishProvider`
3. Implement `createPublishTool` factory
4. Write tests
5. Refactor blog/decks publish.ts to use factory

### Phase 4: Scheduler Infrastructure

1. Implement `PublishScheduler` base class
2. Implement retry utilities
3. Write tests
4. Refactor social-media PublishCheckerJobHandler to extend base

### Phase 5: Enable Queue for Blog/Decks

1. Add queue tool to blog plugin
2. Add queue tool to decks plugin
3. (Optional) Add publish scheduler to blog/decks

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
