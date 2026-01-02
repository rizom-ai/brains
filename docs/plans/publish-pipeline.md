# Publishing Pipeline Abstraction Plan

> **Status: COMPLETED** - All phases implemented as of 2026-01-02

## Goal

Create a comprehensive publishing infrastructure that can be shared across plugins (blog, decks, social-media, future plugins). Enable scheduled/queued publishing for all content types.

## Key Decisions

1. **Architecture**: Single plugin (`plugins/publish-pipeline`) handles queue management, scheduling, and provider registry
2. **Integration**: Message-driven - plugins send/receive messages via message bus
3. **Status states**: `draft`, `queued`, `published` (entity status tracked in frontmatter)
4. **Per-type scheduling**: Each entity type can have independent scheduling configuration
5. **Two publish paths**:
   - Queue path: draft → queued → published (via scheduler with `direct=false`)
   - Direct path: draft → published (immediate, bypass queue with `direct=true`, default)
6. **Scheduler**: Managed by publish-pipeline, triggered via messages
7. **Retries**: Uniform across all publishers (internal and external)
8. **Storage**: Queue state managed centrally by publish-pipeline (not in entity frontmatter)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Message Bus                              │
│  publish:register, publish:queue, publish:direct,               │
│  publish:remove, publish:reorder, publish:completed, etc.       │
└─────────────────────────────────────────────────────────────────┘
        ▲                    ▲                    ▲
        │                    │                    │
   ┌────┴────┐          ┌────┴────┐          ┌────┴────┐
   │  blog   │          │  decks  │          │ social  │
   │ plugin  │          │ plugin  │          │  media  │
   └─────────┘          └─────────┘          └─────────┘
        │                    │                    │
        │  registers         │  registers         │  registers
        │  entity type       │  entity type       │  entity type
        ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      publish-service                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Queue Manager│  │   Scheduler  │  │   Provider   │          │
│  │  (per type)  │  │   (single)   │  │   Registry   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## Message Bus Events

### Plugin → Service

| Message            | Payload                              | Description                         |
| ------------------ | ------------------------------------ | ----------------------------------- |
| `publish:register` | `{ entityType, provider?, config? }` | Register entity type for publishing |
| `publish:queue`    | `{ entityType, entityId }`           | Add entity to publish queue         |
| `publish:direct`   | `{ entityType, entityId }`           | Publish immediately (bypass queue)  |
| `publish:remove`   | `{ entityType, entityId }`           | Remove from queue                   |
| `publish:reorder`  | `{ entityType, entityId, position }` | Change queue position               |
| `publish:list`     | `{ entityType }`                     | Request queue contents              |

### Service → Plugin

| Message                 | Payload                                       | Description           |
| ----------------------- | --------------------------------------------- | --------------------- |
| `publish:queued`        | `{ entityType, entityId, position }`          | Entity added to queue |
| `publish:completed`     | `{ entityType, entityId, result }`            | Publish succeeded     |
| `publish:failed`        | `{ entityType, entityId, error, retryCount }` | Publish failed        |
| `publish:list:response` | `{ entityType, queue: [...] }`                | Queue contents        |

## Package Structure

### Plugin: `plugins/publish-pipeline/`

Core logic for queue management, scheduling, and publishing - implemented as a single plugin.

```
plugins/publish-pipeline/
├── src/
│   ├── index.ts
│   ├── plugin.ts                # Main plugin with message handlers
│   ├── queue-manager.ts         # Queue operations per entity type
│   ├── scheduler.ts             # Daemon for scheduled publishing
│   ├── provider-registry.ts     # Manages publish providers
│   ├── retry-tracker.ts         # Retry logic with backoff
│   ├── schemas/
│   │   └── publishable.ts       # Status, queue metadata schemas
│   └── types/
│       ├── provider.ts          # PublishProvider interface
│       ├── messages.ts          # Message payload types
│       └── config.ts            # Registration config types
├── test/
│   ├── queue-manager.test.ts
│   ├── scheduler.test.ts
│   ├── provider-registry.test.ts
│   └── plugin.test.ts
├── package.json
└── tsconfig.json
```

## Core Components

### 1. Publishable Schemas (shared)

```typescript
// Status types shared across publishable entities
export type PublishStatus = "draft" | "queued" | "published" | "failed";

export const publishStatusSchema = z.enum([
  "draft",
  "queued",
  "published",
  "failed",
]);

// Fields plugins should include in their entity metadata
export const publishableMetadataSchema = z.object({
  status: publishStatusSchema.default("draft"),
  queueOrder: z.number().optional(),
  publishedAt: z.string().datetime().optional(),
  retryCount: z.number().default(0),
  lastError: z.string().optional(),
});
```

### 2. Publish Provider Interface (shared)

```typescript
export interface PublishResult {
  id: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface PublishProvider {
  name: string;
  publish(
    content: string,
    metadata: Record<string, unknown>,
  ): Promise<PublishResult>;
  validateCredentials?(): Promise<boolean>;
}

// Default provider for internal publishing (blog, decks)
export class InternalPublishProvider implements PublishProvider {
  name = "internal";
  async publish(): Promise<PublishResult> {
    return { id: "internal" };
  }
}
```

### 3. Queue Manager (service)

```typescript
class QueueManager {
  private queues: Map<string, EntityQueue> = new Map();

  async add(
    entityType: string,
    entityId: string,
  ): Promise<{ position: number }>;
  async remove(entityType: string, entityId: string): Promise<void>;
  async reorder(
    entityType: string,
    entityId: string,
    position: number,
  ): Promise<void>;
  async list(entityType: string): Promise<QueueEntry[]>;
  async getNext(entityType: string): Promise<QueueEntry | null>;
  async getNextAcrossTypes(): Promise<QueueEntry | null>; // For single scheduler
}
```

### 4. Scheduler (service)

```typescript
class PublishScheduler {
  constructor(
    private queueManager: QueueManager,
    private providerRegistry: ProviderRegistry,
    private messageBus: MessageBus,
    private config: SchedulerConfig,
  );

  async start(): Promise<void>;
  async stop(): Promise<void>;

  // Called on interval - processes next item from any queue
  private async tick(): Promise<void> {
    const next = await this.queueManager.getNextAcrossTypes();
    if (next) {
      await this.publishEntity(next);
    }
    this.scheduleNextTick();
  }
}
```

### 5. Provider Registry (service)

```typescript
class ProviderRegistry {
  private providers: Map<string, PublishProvider> = new Map();
  private defaultProvider = new InternalPublishProvider();

  register(entityType: string, provider: PublishProvider): void;
  get(entityType: string): PublishProvider;
}
```

## Plugin Integration

### Registration (plugin init)

```typescript
// In social-media plugin
async init(context: ServicePluginContext) {
  // Register with publish service
  context.messageBus.publish("publish:register", {
    entityType: "social-post",
    provider: new LinkedInProvider(config),
    config: {
      maxRetries: 3,
      retryBackoffMs: 5000,
    },
  });

  // Subscribe to results
  context.messageBus.subscribe("publish:completed", this.handlePublishComplete);
  context.messageBus.subscribe("publish:failed", this.handlePublishFailed);
}
```

### Queue Tool (plugin)

```typescript
// Simple tool that sends message to service
export function createQueueTool(pluginId: string): PluginTool {
  return {
    name: `${pluginId}_queue`,
    handler: async (input, context) => {
      const { action, entityId, position } = input;

      switch (action) {
        case "add":
          context.messageBus.publish("publish:queue", { entityType, entityId });
          break;
        case "remove":
          context.messageBus.publish("publish:remove", {
            entityType,
            entityId,
          });
          break;
        case "reorder":
          context.messageBus.publish("publish:reorder", {
            entityType,
            entityId,
            position,
          });
          break;
      }
    },
  };
}
```

### Direct Publish Tool (plugin)

```typescript
// Bypass queue, publish immediately
export function createPublishTool(pluginId: string): PluginTool {
  return {
    name: `${pluginId}_publish`,
    handler: async (input, context) => {
      context.messageBus.publish("publish:direct", { entityType, entityId });
    },
  };
}
```

## Implementation Plan

### Phase 1: Core Plugin ✅ COMPLETED

1. ✅ Created `plugins/publish-pipeline/` with package.json, tsconfig
2. ✅ Implemented publishable schemas
3. ✅ Implemented provider interface + InternalPublishProvider
4. ✅ Implemented message payload types
5. ✅ Wrote tests for schemas
6. ✅ Exported everything from index.ts

### Phase 2: Service Components ✅ COMPLETED

1. ✅ Implemented QueueManager
2. ✅ Implemented ProviderRegistry
3. ✅ Implemented Scheduler
4. ✅ Implemented RetryTracker
5. ✅ Implemented message handlers (register, queue, direct, execute, report)
6. ✅ Implemented PublishPipelinePlugin (main entry)
7. ✅ Wrote tests for all components

### Phase 3: Migrate Plugins ✅ COMPLETED

1. **social-media**: ✅ Refactored to use service
   - ✅ Removed PublishCheckerJobHandler (scheduler now in publish-pipeline)
   - ✅ Removed old PublishJobHandler (replaced by PublishExecuteHandler)
   - ✅ Added PublishExecuteHandler for message-driven publishing
   - ✅ Registered LinkedInProvider with publish-pipeline
   - ✅ Updated queue tool to send messages
2. **blog**: ✅ Added queue + publish support
   - ✅ Registered entity type with publish-pipeline (internal provider)
   - ✅ Added queue tool (list, remove, reorder)
   - ✅ Updated publish tool with `direct` flag (default: true)
   - ✅ Subscribed to publish:execute messages
3. **decks**: ✅ Added queue + publish support
   - ✅ Same pattern as blog

### Phase 4: Cleanup ✅ COMPLETED

1. ✅ Removed obsolete handlers from social-media
2. ✅ All tests passing (1831 tests)
3. ✅ TypeScript compiles without errors
4. ✅ Documentation updated

## Files Created

### Publish Pipeline Plugin

- `plugins/publish-pipeline/package.json`
- `plugins/publish-pipeline/tsconfig.json`
- `plugins/publish-pipeline/src/index.ts`
- `plugins/publish-pipeline/src/plugin.ts`
- `plugins/publish-pipeline/src/queue-manager.ts`
- `plugins/publish-pipeline/src/scheduler.ts`
- `plugins/publish-pipeline/src/provider-registry.ts`
- `plugins/publish-pipeline/src/retry-tracker.ts`
- `plugins/publish-pipeline/src/schemas/publishable.ts`
- `plugins/publish-pipeline/src/types/provider.ts`
- `plugins/publish-pipeline/src/types/messages.ts`
- `plugins/publish-pipeline/src/types/config.ts`
- `plugins/publish-pipeline/test/*.test.ts`

### Plugin Tools

- `plugins/blog/src/tools/queue.ts` - Queue management tool
- `plugins/decks/src/tools/queue.ts` - Queue management tool
- `plugins/social-media/src/handlers/publishExecuteHandler.ts` - Message-driven publish

### Tests

- `plugins/social-media/test/tools/queue-messages.test.ts`
- `plugins/social-media/test/plugin-registration.test.ts`
- `plugins/social-media/test/plugin-execute.test.ts`
- `plugins/blog/test/plugin-registration.test.ts`
- `plugins/blog/test/queue-tool.test.ts`
- `plugins/decks/test/publish-tool.test.ts`
- `plugins/decks/test/queue-tool.test.ts`
- `plugins/decks/test/plugin-registration.test.ts`

## Files Modified

- `plugins/blog/src/plugin.ts` - Register with publish-pipeline, subscribe to execute
- `plugins/blog/src/tools/publish.ts` - Added `direct` flag
- `plugins/blog/src/tools/index.ts` - Export queue tool
- `plugins/blog/src/schemas/blog-post.ts` - Added `queued` status
- `plugins/decks/src/plugin.ts` - Register with publish-pipeline, subscribe to execute
- `plugins/decks/src/tools/publish.ts` - Added `direct` flag
- `plugins/decks/src/tools/index.ts` - Export queue tool
- `plugins/decks/src/schemas/deck.ts` - Added `queued` status
- `plugins/social-media/src/plugin.ts` - Refactored to use publish-pipeline messages
- `plugins/social-media/src/tools/queue.ts` - Send messages instead of direct calls
- `plugins/social-media/src/handlers/index.ts` - Removed old handlers

## Files Removed

- `plugins/social-media/src/handlers/publishCheckerHandler.ts` - Replaced by publish-pipeline scheduler
- `plugins/social-media/src/handlers/publishHandler.ts` - Replaced by publishExecuteHandler
- `plugins/social-media/test/handlers/publishCheckerHandler.test.ts`
- `plugins/social-media/test/handlers/publishHandler.test.ts`
