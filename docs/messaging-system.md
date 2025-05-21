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

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Register a handler for a specific message type
   */
  registerHandler(messageType: string, handler: MessageHandler): void {
    if (!this.handlers.has(messageType)) {
      this.handlers.set(messageType, new Set());
    }

    this.handlers.get(messageType)!.add(handler);
    this.logger.info(`Registered handler for message type: ${messageType}`);
  }

  /**
   * Publish a message to all handlers
   */
  async publish(message: Message): Promise<MessageResponse | null> {
    const { type } = message;
    const handlers = this.handlers.get(type) || new Set();

    this.logger.debug(`Publishing message of type: ${type}`);

    // If no handlers, log warning and return null
    if (handlers.size === 0) {
      this.logger.warn(`No handlers found for message type: ${type}`);
      return null;
    }

    // Call handlers in sequence until one returns a response
    for (const handler of handlers) {
      try {
        const response = await handler(message);
        if (response) {
          return response;
        }
      } catch (error) {
        this.logger.error(`Error in message handler for ${type}`, { error });
      }
    }

    return null;
  }

  /**
   * Check if a message type has handlers
   */
  hasHandlers(messageType: string): boolean {
    return (
      this.handlers.has(messageType) && this.handlers.get(messageType)!.size > 0
    );
  }

  /**
   * Unregister a handler for a specific message type
   */
  unregisterHandler(messageType: string, handler: MessageHandler): void {
    if (this.handlers.has(messageType)) {
      this.handlers.get(messageType)!.delete(handler);
      this.logger.info(`Unregistered handler for message type: ${messageType}`);
    }
  }
}
```

### Message Schema

All messages are defined using Zod schemas for validation:

```typescript
import { z } from "zod";

/**
 * Base message schema
 */
export const baseMessageSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  type: z.string(),
  source: z.string().optional(),
  target: z.string().optional(),
});

export type BaseMessage = z.infer<typeof baseMessageSchema>;

/**
 * Message response schema
 */
export const messageResponseSchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  success: z.boolean(),
  data: z.any().optional(),
  error: z
    .object({
      message: z.string(),
      code: z.string().optional(),
    })
    .optional(),
  timestamp: z.string().datetime(),
});

export type MessageResponse = z.infer<typeof messageResponseSchema>;

/**
 * Message handler type
 */
export type MessageHandler = (
  message: BaseMessage,
) => Promise<MessageResponse | null>;
```

### Context-Specific Message Schemas

Each context defines its own message schemas that extend the base:

```typescript
/**
 * Note message schemas
 */
export const createNoteMessageSchema = baseMessageSchema.extend({
  type: z.literal("note.create"),
  payload: z.object({
    title: z.string(),
    content: z.string(),
    tags: z.array(z.string()).optional(),
  }),
});

export type CreateNoteMessage = z.infer<typeof createNoteMessageSchema>;

export const getNoteMessageSchema = baseMessageSchema.extend({
  type: z.literal("note.get"),
  payload: z.object({
    id: z.string().uuid(),
  }),
});

export type GetNoteMessage = z.infer<typeof getNoteMessageSchema>;

// More message schemas...
```

### Message Factory

A factory helps create properly typed messages:

```typescript
/**
 * Factory for creating messages with proper types
 */
export class MessageFactory {
  /**
   * Create a note creation message
   */
  static createNoteMessage(
    title: string,
    content: string,
    tags?: string[],
  ): CreateNoteMessage {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: "note.create",
      payload: {
        title,
        content,
        tags,
      },
    };
  }

  /**
   * Create a note retrieval message
   */
  static getNoteMessage(id: string): GetNoteMessage {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: "note.get",
      payload: {
        id,
      },
    };
  }

  // More factory methods...
}
```

## Integration with Plugin System

Plugins register message handlers during initialization:

```typescript
// In note-context/src/index.ts
const noteContext: ContextPlugin = {
  id: "note-context",
  version: "1.0.0",
  dependencies: ["core"],

  register(context: PluginContext): PluginLifecycle {
    const { messageBus, logger } = context;

    // Register message handlers
    messageBus.registerHandler("note.create", async (message) => {
      logger.info("Handling note.create message");
      const parsed = createNoteMessageSchema.parse(message);

      // Create note using entity service
      const entityService =
        context.registry.resolve<EntityService>("entityService");
      const note = {
        id: crypto.randomUUID(),
        entityType: "note",
        title: parsed.payload.title,
        content: parsed.payload.content,
        tags: parsed.payload.tags || [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),

        toMarkdown() {
          return this.content;
        },
      };

      const savedNote = await entityService.saveEntity(note);

      // Return response
      return {
        id: crypto.randomUUID(),
        requestId: message.id,
        success: true,
        data: savedNote,
        timestamp: new Date().toISOString(),
      };
    });

    // Register more handlers...

    return {
      // Lifecycle hooks...
    };
  },
};
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

## Cross-Context Communication

Contexts communicate with each other through messages:

```typescript
// ProfileContext using NoteContext
async function saveProfileWithNotes(
  profile: Profile,
  notes: string[],
): Promise<Profile> {
  // Save profile
  const savedProfile = await entityService.saveEntity(profile);

  // Create notes linked to the profile
  for (const noteText of notes) {
    const createNoteMessage = MessageFactory.createNoteMessage(
      `Note for ${profile.name}`,
      noteText,
      ["profile", profile.id],
    );

    await messageBus.publish(createNoteMessage);
  }

  return savedProfile;
}
```

## Error Handling

Messages include standard error handling patterns:

```typescript
// Error response creation
function createErrorResponse(
  requestId: string,
  code: string,
  message: string,
): MessageResponse {
  return {
    id: crypto.randomUUID(),
    requestId,
    success: false,
    error: {
      code,
      message,
    },
    timestamp: new Date().toISOString(),
  };
}

// Handler with error handling
messageBus.registerHandler("note.get", async (message) => {
  try {
    const parsed = getNoteMessageSchema.parse(message);
    const entityService = registry.resolve<EntityService>("entityService");

    const note = await entityService.getEntity(parsed.payload.id);

    if (!note) {
      return createErrorResponse(
        message.id,
        "NOTE_NOT_FOUND",
        "Note not found",
      );
    }

    return {
      id: crypto.randomUUID(),
      requestId: message.id,
      success: true,
      data: note,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return createErrorResponse(
      message.id,
      "INVALID_MESSAGE",
      `Invalid message format: ${error.message}`,
    );
  }
});
```

## Testing

Messages and handlers are easy to test:

```typescript
// Testing a message handler
describe("Note message handlers", () => {
  let messageBus: MessageBus;
  let entityService: EntityService;

  beforeEach(() => {
    const logger = createMockLogger();
    messageBus = new MessageBus(logger);
    entityService = createMockEntityService();

    // Register handler
    messageBus.registerHandler("note.create", createNoteHandler(entityService));
  });

  test("should create a note", async () => {
    // Create test message
    const message = MessageFactory.createNoteMessage(
      "Test Note",
      "This is a test note",
      ["test"],
    );

    // Publish message
    const response = await messageBus.publish(message);

    // Verify response
    expect(response).toBeDefined();
    expect(response?.success).toBe(true);
    expect(response?.data).toHaveProperty("id");
    expect(response?.data.title).toBe("Test Note");

    // Verify entity service was called
    expect(entityService.saveEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "note",
        title: "Test Note",
        content: "This is a test note",
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
