# @brains/messaging-service

Event-driven messaging system with pub/sub pattern for Personal Brain applications.

## Overview

This service provides a centralized message bus for inter-component communication using a publish/subscribe pattern. It enables loose coupling between components and supports async event handling.

## Features

- Publish/subscribe messaging pattern
- Typed event system with TypeScript
- Wildcard event subscriptions
- Event filtering and routing
- Memory-efficient event handling
- Support for sync and async handlers

## Installation

```bash
bun add @brains/messaging-service
```

## Usage

```typescript
import { MessageBus } from "@brains/messaging-service";

const messageBus = MessageBus.getInstance();

// Subscribe to events
messageBus.on("entity:created", async (event) => {
  console.log("New entity:", event.entity);
});

// Subscribe with wildcard
messageBus.on("entity:*", async (event) => {
  console.log("Entity event:", event.type);
});

// Publish events
await messageBus.emit("entity:created", {
  entity: {
    id: "123",
    type: "note",
    content: "Hello",
  },
});

// Unsubscribe
const unsubscribe = messageBus.on("test", handler);
unsubscribe(); // Remove subscription
```

## Event Patterns

### Standard Events

Common event patterns used in Brain applications:

```typescript
// Entity events
"entity:created"
"entity:updated"
"entity:deleted"
"entity:searched"

// Job events
"job:started"
"job:progress"
"job:completed"
"job:failed"

// Plugin events
"plugin:registered"
"plugin:error"

// System events
"system:ready"
"system:shutdown"
```

### Custom Events

Define your own event types:

```typescript
interface MyEvent {
  type: string;
  data: {
    value: number;
    message: string;
  };
}

messageBus.on<MyEvent>("my:event", async (event) => {
  console.log(event.data.value); // Typed!
});
```

## Wildcard Subscriptions

Subscribe to multiple events with patterns:

```typescript
// All entity events
messageBus.on("entity:*", handler);

// All events (use sparingly)
messageBus.on("*", handler);

// Specific namespace
messageBus.on("job:*", jobHandler);
```

## Error Handling

```typescript
messageBus.on("entity:created", async (event) => {
  try {
    await processEntity(event.entity);
  } catch (error) {
    // Emit error event
    await messageBus.emit("entity:error", {
      entity: event.entity,
      error: error.message,
    });
  }
});
```

## Message Types

### Base Message

```typescript
interface Message {
  id: string;
  type: string;
  timestamp: Date;
  source?: string;
  metadata?: Record<string, unknown>;
}
```

### Typed Messages

```typescript
interface EntityMessage extends Message {
  type: "entity:created" | "entity:updated" | "entity:deleted";
  entity: BaseEntity;
}

interface JobMessage extends Message {
  type: "job:started" | "job:progress" | "job:completed";
  jobId: string;
  progress?: number;
  result?: unknown;
}
```

## Testing

```typescript
import { MessageBus } from "@brains/messaging-service";

describe("MyComponent", () => {
  let messageBus: MessageBus;
  
  beforeEach(() => {
    messageBus = MessageBus.createFresh();
  });
  
  test("handles events", async () => {
    const handler = jest.fn();
    messageBus.on("test:event", handler);
    
    await messageBus.emit("test:event", { data: "test" });
    
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ data: "test" })
    );
  });
});
```

## Performance

- Events are processed synchronously by default
- Use async handlers for I/O operations
- Avoid blocking operations in handlers
- Consider event batching for high-frequency events

## Best Practices

1. **Use typed events** - Define interfaces for your events
2. **Namespace events** - Use prefixes like `entity:`, `job:`
3. **Handle errors** - Don't let handler errors crash the app
4. **Clean up** - Unsubscribe when components unmount
5. **Document events** - List all events your component emits

## Exports

- `MessageBus` - Main message bus class
- `Message` - Base message interface
- Event type definitions
- Test utilities

## License

MIT