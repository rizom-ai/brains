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
    handler: MessageHandler<T, R>
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
    sender?: string
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
      error: response?.error?.message ?? `No handler found for message type: ${type}`,
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
// In note-plugin/src/index.ts
const notePlugin: Plugin = {
  id: "note-plugin",
  version: "1.0.0",
  dependencies: ["core"],

  async register(context: PluginContext): Promise<PluginCapabilities> {
    const { messageBus, logger } = context;

    // Subscribe to message handlers
    messageBus.subscribe("note:create", async (message) => {
      logger.info("Handling note:create message");
      const { title, content, tags } = message.payload;

      // Create note using entity service
      const entityService = context.registry.get<EntityService>("entityService");
      const note = createNote({
        title,
        content,
        tags: tags || [],
      });

      const savedNote = await entityService.saveEntity(note);

      // Return response
      return {
        success: true,
        data: savedNote,
      };
    });

    // Subscribe to more message types...
    messageBus.subscribe("note:get", async (message) => {
      const { id } = message.payload;
      const entityService = context.registry.get<EntityService>("entityService");
      const note = await entityService.getEntity(id);
      
      if (!note) {
        return {
          success: false,
          error: "Note not found",
        };
      }
      
      return {
        success: true,
        data: note,
      };
    });

    return {
      tools: [...],
      resources: [...],
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
// ProfilePlugin using NotePlugin via messages
async function saveProfileWithNotes(
  messageBus: MessageBus,
  profile: Profile,
  notes: string[],
): Promise<Profile> {
  // Save profile
  const savedProfile = await entityService.saveEntity(profile);

  // Create notes linked to the profile
  for (const noteText of notes) {
    const response = await messageBus.send(
      "note:create",
      {
        title: `Note for ${profile.name}`,
        content: noteText,
        tags: ["profile", profile.id],
      },
      "profile-plugin"
    );

    if (!response.success) {
      logger.warn("Failed to create note", { error: response.error });
    }
  }

  return savedProfile;
}
```

## Error Handling

Messages include standard error handling patterns:

```typescript
// Handler with error handling
messageBus.subscribe("note:get", async (message) => {
  try {
    const { id } = message.payload;
    const entityService = registry.get<EntityService>("entityService");

    const note = await entityService.getEntity(id);

    if (!note) {
      return {
        success: false,
        error: "Note not found",
      };
    }

    return {
      success: true,
      data: note,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Using the message bus with error handling
const response = await messageBus.send("note:get", { id: "123" });

if (response.success) {
  console.log("Note found:", response.data);
} else {
  console.error("Error:", response.error);
}
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
    messageBus = MessageBus.createFresh(logger);
    entityService = createMockEntityService();

    // Subscribe handler
    messageBus.subscribe("note:create", async (message) => {
      const note = createNote(message.payload);
      const savedNote = await entityService.saveEntity(note);
      return { success: true, data: savedNote };
    });
  });

  test("should create a note", async () => {
    // Send message
    const response = await messageBus.send(
      "note:create",
      {
        title: "Test Note",
        content: "This is a test note",
        tags: ["test"],
      },
      "test"
    );

    // Verify response
    expect(response.success).toBe(true);
    expect(response.data).toHaveProperty("id");
    expect(response.data.title).toBe("Test Note");

    // Verify entity service was called
    expect(entityService.saveEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "note",
        title: "Test Note",
        content: "This is a test note",
      }),
    );
  });

  test("should handle missing handler", async () => {
    const response = await messageBus.send("unknown:message", {});
    
    expect(response.success).toBe(false);
    expect(response.error).toContain("No handler found");
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
