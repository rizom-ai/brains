# Publishing Pipeline Abstraction Plan

## Goal

Create a comprehensive publishing infrastructure that can be shared across plugins (blog, decks, social-media, future plugins). Enable scheduled/queued publishing for all content types.

## Key Decisions

1. **Architecture**: Shell service (`shell/publish-service`) + shared schemas (`shared/publish-pipeline`)
2. **Integration**: Message-driven - plugins send/receive messages via message bus
3. **Status states**: `draft`, `queued`, `published`, `failed` (use "queued" not "pending")
4. **Single scheduler**: One daemon in publish-service manages all entity type queues
5. **Two publish paths**:
   - Queue path: draft → queued → published/failed (via scheduler)
   - Direct path: draft → published (immediate, bypass queue)
6. **Scheduler**: Always on - `queued` status means "will auto-publish"
7. **Retries**: Uniform across all publishers (internal and external)
8. **Storage**: Keep `queueOrder`/`retryCount` in frontmatter for simplicity

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

### Shell Service: `shell/publish-service/`

Core logic for queue management, scheduling, and publishing.

```
shell/publish-service/
├── src/
│   ├── index.ts
│   ├── publish-service.ts       # Main service, message handlers
│   ├── queue-manager.ts         # Queue operations per entity type
│   ├── scheduler.ts             # Single daemon for all queues
│   ├── provider-registry.ts     # Manages publish providers
│   ├── retry-tracker.ts         # Retry logic with backoff
│   └── handlers/
│       ├── register-handler.ts  # Handle publish:register
│       ├── queue-handler.ts     # Handle publish:queue
│       └── publish-handler.ts   # Execute actual publishing
├── test/
│   ├── queue-manager.test.ts
│   ├── scheduler.test.ts
│   └── publish-service.test.ts
├── package.json
└── tsconfig.json
```

### Shared Package: `shared/publish-pipeline/`

Schemas and types shared between service and plugins.

```
shared/publish-pipeline/
├── src/
│   ├── index.ts
│   ├── schemas/
│   │   └── publishable.ts       # Status, queue metadata schemas
│   └── types/
│       ├── provider.ts          # PublishProvider interface
│       ├── messages.ts          # Message payload types
│       └── config.ts            # Registration config types
├── test/
│   └── schemas.test.ts
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

### Phase 1: Shared Package

1. Create `shared/publish-pipeline/` with package.json, tsconfig
2. Implement publishable schemas
3. Implement provider interface + InternalPublishProvider
4. Implement message payload types
5. Write tests for schemas
6. Export everything from index.ts

### Phase 2: Shell Service

1. Create `shell/publish-service/` with package.json, tsconfig
2. Implement QueueManager
3. Implement ProviderRegistry
4. Implement Scheduler
5. Implement RetryTracker
6. Implement message handlers
7. Implement PublishService (main entry)
8. Write tests for all components

### Phase 3: Migrate Plugins

1. **social-media**: Refactor to use service
   - Remove PublishCheckerJobHandler (scheduler now in service)
   - Keep PublishJobHandler but triggered via message
   - Register LinkedInProvider with service
   - Update queue tool to send messages
2. **blog**: Add queue + publish support
   - Register entity type with service (internal provider)
   - Add queue tool
   - Keep existing publish tool (sends publish:direct)
3. **decks**: Add queue + publish support
   - Same as blog

### Phase 4: Cleanup

1. Remove duplicated code from plugins
2. Update turbo.json build order
3. Run all tests, fix any issues
4. Update documentation

## Files to Create

### Shared Package

- `shared/publish-pipeline/package.json`
- `shared/publish-pipeline/tsconfig.json`
- `shared/publish-pipeline/src/index.ts`
- `shared/publish-pipeline/src/schemas/publishable.ts`
- `shared/publish-pipeline/src/types/provider.ts`
- `shared/publish-pipeline/src/types/messages.ts`
- `shared/publish-pipeline/src/types/config.ts`
- `shared/publish-pipeline/test/schemas.test.ts`

### Shell Service

- `shell/publish-service/package.json`
- `shell/publish-service/tsconfig.json`
- `shell/publish-service/src/index.ts`
- `shell/publish-service/src/publish-service.ts`
- `shell/publish-service/src/queue-manager.ts`
- `shell/publish-service/src/scheduler.ts`
- `shell/publish-service/src/provider-registry.ts`
- `shell/publish-service/src/retry-tracker.ts`
- `shell/publish-service/src/handlers/register-handler.ts`
- `shell/publish-service/src/handlers/queue-handler.ts`
- `shell/publish-service/src/handlers/publish-handler.ts`
- `shell/publish-service/test/*.test.ts`

## Files to Modify

- `plugins/blog/src/plugin.ts` - Register with publish service
- `plugins/decks/src/plugin.ts` - Register with publish service
- `plugins/social-media/src/plugin.ts` - Refactor to use service
- `plugins/social-media/src/handlers/` - Remove scheduler, keep provider logic
- `turbo.json` - Add new packages to build order
