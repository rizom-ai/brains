# Messaging System

The messaging system is a core component of the Personal Brain shell, providing a standardized way for components to communicate with each other.

## Design Goals

1. **Schema Validation**: All messages have a defined schema and are validated
2. **Type Safety**: TypeScript typing for all messages and handlers
3. **Decoupling**: Loose coupling between message producers and consumers
4. **Testability**: Easy to mock and test message flows
5. **Discoverability**: Clear registration of message handlers

## Key Components

### Message Bus

The MessageBus is the central hub for all communication:

```typescript
/**
 * Message bus for handling messages between components
 */
export class MessageBus {
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private logger: Logger;

  /**
   * Subscribe to messages of a specific type
   */
  subscribe<T = unknown, R = unknown>(
    type: string,
    handler: MessageHandler<T, R>,
  ): () => void {
    // Register the handler
    this.addHandler(type, handler);

    // Return unsubscribe function
    return () => this.removeHandler(type, handler);
  }

  /**
   * Send a message and get response
   */
  async send<T = unknown, R = unknown>(
    type: string,
    payload: T,
    sender?: string,
  ): Promise<{ success: boolean; data?: R; error?: string }> {
    const message = {
      id: generateId(),
      type,
      timestamp: new Date().toISOString(),
      source: sender,
      payload,
    };

    const response = await this.processMessage(message);

    if (response?.success) {
      return {
        success: true,
        data: response.data as R,
      };
    }

    return {
      success: false,
      error:
        response?.error?.message ??
        `No handler found for message type: ${type}`,
    };
  }

  /**
   * Check if a message type has handlers
   */
  hasHandlers(messageType: string): boolean {
    return (
      this.handlers.has(messageType) && this.handlers.get(messageType)!.size > 0
    );
  }
}
```

### Message Types

Messages in the system use simple event-based patterns:

```typescript
/**
 * Message handler type
 */
export type MessageHandler<T = unknown> = (payload: T) => Promise<void> | void;

/**
 * Async message handler for background processing
 */
export type AsyncMessageHandler<T = unknown> = (payload: T) => Promise<void>;

/**
 * Message subscription
 */
export interface MessageSubscription {
  unsubscribe: () => void;
}
```

### Plugin Message Events

Plugins emit and subscribe to events through the message bus:

```typescript
/**
 * Common message events
 */
// Entity events
export const ENTITY_CREATED = "entity:created";
export const ENTITY_UPDATED = "entity:updated";
export const ENTITY_DELETED = "entity:deleted";

// Job events
export const JOB_STARTED = "job:started";
export const JOB_COMPLETED = "job:completed";
export const JOB_FAILED = "job:failed";
export const JOB_PROGRESS = "job:progress";

// Summary plugin events
export const SUMMARY_DIGEST_REQUESTED = "summary:digest:requested";
export const SUMMARY_CREATED = "summary:created";

// Link plugin events
export const LINK_CAPTURE_REQUESTED = "link:capture:requested";
export const LINK_CAPTURED = "link:captured";

// Topic plugin events
export const TOPICS_EXTRACTION_REQUESTED = "topics:extraction:requested";
export const TOPICS_EXTRACTED = "topics:extracted";
```

### Event Payloads

Events carry typed payloads for data:

```typescript
/**
 * Entity event payloads
 */
export interface EntityCreatedPayload {
  entityId: string;
  entityType: string;
  title: string;
}

export interface EntityUpdatedPayload {
  entityId: string;
  entityType: string;
  changes: Record<string, unknown>;
}

export interface EntityDeletedPayload {
  entityId: string;
  entityType: string;
}

/**
 * Job event payloads
 */
export interface JobStartedPayload {
  jobId: string;
  type: string;
  description?: string;
}

export interface JobProgressPayload {
  jobId: string;
  progress: number;
  status: string;
}

export interface JobCompletedPayload {
  jobId: string;
  result?: unknown;
}

export interface JobFailedPayload {
  jobId: string;
  error: string;
}
```

## Integration with Plugin System

Plugins register message handlers during initialization:

```typescript
// In SummaryPlugin
export class SummaryPlugin extends CorePlugin {
  async register(context: CorePluginContext): Promise<PluginCapabilities> {
    const { messageBus, logger, jobQueue } = context;

    // Subscribe to digest request events
    const unsubscribe = messageBus.subscribe<DigestRequestPayload>(
      SUMMARY_DIGEST_REQUESTED,
      async (payload) => {
        logger.info("Handling digest request", payload);

        // Queue the digest job
        const jobId = await jobQueue.addJob({
          type: "summary:digest",
          data: {
            conversationId: payload.conversationId,
            period: payload.period,
          },
        });

        // Emit job started event
        await messageBus.publish(JOB_STARTED, {
          jobId,
          type: "summary:digest",
          description: `Generating ${payload.period} digest`,
        });
      }
    );

    // Subscribe to job completion events
    messageBus.subscribe<JobCompletedPayload>(
      JOB_COMPLETED,
      async (payload) => {
        if (payload.jobId.startsWith("summary:")) {
          // Emit summary created event
          await messageBus.publish(SUMMARY_CREATED, {
            entityId: payload.result.entityId,
            summaryType: payload.result.summaryType,
          });
        }
      }
    );

    return {
      tools: [...],
      resources: [...],
      handlers: [...],
    };
  }
}
```

## Message Validation

Messages are validated against their schema before processing:

```typescript
/**
 * Validate a message against its schema
 */
export function validateMessage<T extends z.ZodType>(
  message: unknown,
  schema: T,
): z.infer<T> {
  try {
    return schema.parse(message);
  } catch (error) {
    throw new Error(`Invalid message: ${error.message}`);
  }
}
```

## Cross-Plugin Communication

Plugins communicate with each other through events:

```typescript
// LinkPlugin triggering summary generation
export class LinkPlugin extends CorePlugin {
  async captureLink(url: string): Promise<LinkEntity> {
    const { messageBus, entityService } = this.context;

    // Capture and save link
    const linkEntity = await this.processUrl(url);
    const saved = await entityService.createEntity(linkEntity);

    // Emit link captured event
    await messageBus.publish(LINK_CAPTURED, {
      entityId: saved.entityId,
      url: linkEntity.url,
      title: linkEntity.title,
    });

    // Request summary generation
    await messageBus.publish(SUMMARY_DIGEST_REQUESTED, {
      conversationId: this.conversationId,
      entityIds: [saved.entityId],
      period: "custom",
    });

    return linkEntity;
  }
}

// TopicsPlugin listening to link events
export class TopicsPlugin extends CorePlugin {
  async register(context: CorePluginContext): Promise<PluginCapabilities> {
    const { messageBus } = context;

    // Listen for new links to extract topics
    messageBus.subscribe(LINK_CAPTURED, async (payload) => {
      await this.extractTopicsFromEntity(payload.entityId);
    });

    return { ... };
  }
}
```

## Error Handling

Event handlers should handle errors gracefully:

```typescript
// Handler with error handling
messageBus.subscribe<EntityCreatedPayload>(ENTITY_CREATED, async (payload) => {
  try {
    // Process the entity creation
    await processNewEntity(payload);

    logger.info("Entity processed successfully", {
      entityId: payload.entityId,
      entityType: payload.entityType,
    });
  } catch (error) {
    logger.error("Failed to process entity", {
      error: error instanceof Error ? error.message : "Unknown error",
      entityId: payload.entityId,
    });

    // Optionally emit failure event
    await messageBus.publish(JOB_FAILED, {
      jobId: `process-${payload.entityId}`,
      error: error.message,
    });
  }
});

// Publishing events with error handling
try {
  await messageBus.publish(LINK_CAPTURE_REQUESTED, {
    url: "https://example.com",
    conversationId: "conv-123",
  });
} catch (error) {
  logger.error("Failed to publish event", { error });
}
```

## Testing

Messages and handlers are easy to test:

```typescript
// Testing event handlers in a plugin
import { describe, it, expect, beforeEach } from "bun:test";
import { createCorePluginHarness } from "@brains/plugins/test";
import { SummaryPlugin } from "../src";

describe("SummaryPlugin message handlers", () => {
  let harness: ReturnType<typeof createCorePluginHarness>;
  let plugin: SummaryPlugin;

  beforeEach(async () => {
    harness = createCorePluginHarness();
    plugin = new SummaryPlugin();
    await harness.installPlugin(plugin);
  });

  it("should handle digest request event", async () => {
    const messageBus = harness.getShell().getMessageBus();
    const jobQueue = harness.getShell().getJobQueue();

    // Mock job queue
    const addJobSpy = vi.spyOn(jobQueue, "addJob");

    // Publish event
    await messageBus.publish(SUMMARY_DIGEST_REQUESTED, {
      conversationId: "conv-123",
      period: "daily",
    });

    // Verify job was queued
    expect(addJobSpy).toHaveBeenCalledWith({
      type: "summary:digest",
      data: {
        conversationId: "conv-123",
        period: "daily",
      },
    });
  });

  it("should emit entity created event after summary creation", async () => {
    const messageBus = harness.getShell().getMessageBus();

    // Subscribe to entity created events
    const entityCreatedHandler = vi.fn();
    messageBus.subscribe(ENTITY_CREATED, entityCreatedHandler);

    // Trigger summary creation
    await plugin.createDailySummary("conv-123");

    // Verify event was emitted
    expect(entityCreatedHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "summary",
        entityId: expect.any(String),
      }),
    );
  });
});
```

## Benefits

1. **Consistency**: All inter-component communication follows the same pattern
2. **Type Safety**: Message schemas ensure type safety
3. **Validation**: All messages are validated before processing
4. **Decoupling**: Components don't need direct references to each other
5. **Testability**: Easy to mock and test message flows
6. **Extensibility**: New message types can be added without modifying existing code
