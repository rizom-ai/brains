# Interface Development Guidelines

Guidelines for developing InterfacePlugin and MessageInterfacePlugin types.

Interfaces are user-facing entry points that expose the system to users via CLI, chat bots, APIs, or web servers.

## Interface Type Selection

```typescript
// InterfacePlugin - For web servers, APIs (no chat interaction)
export class WebInterface extends InterfacePlugin {
  // Provides: HTTP endpoints, daemons
}

// MessageInterfacePlugin - For chat/command interfaces
export class ChatInterface extends MessageInterfacePlugin {
  // Provides: message handling, conversation management, daemons
}
```

**Choose MessageInterfacePlugin when:**

- Users interact via text messages (CLI, Matrix, Discord)
- You need conversation management
- You want agent-based query processing

**Choose InterfacePlugin when:**

- Users interact via HTTP/API (webserver, MCP server)
- No conversational context needed

## File Structure

```
interfaces/my-interface/
├── src/
│   ├── index.ts           # Main interface export
│   ├── interface.ts       # Interface implementation
│   ├── config.ts          # Zod config schema
│   └── lib/               # Internal utilities
├── test/
│   └── interface.test.ts
└── package.json
```

## MessageInterfacePlugin Implementation

```typescript
import {
  MessageInterfacePlugin,
  type InterfacePluginContext,
} from "@brains/plugins";
import { createId } from "@brains/utils";

export class MyInterface extends MessageInterfacePlugin<MyConfig> {
  constructor(config?: MyConfig) {
    super("my-interface", packageJson, config, myConfigSchema);
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    // Setup happens here - daemon is registered automatically via createDaemon()
  }

  protected override createDaemon(): Daemon | undefined {
    return {
      start: this.startDaemon.bind(this),
      stop: this.stopDaemon.bind(this),
      healthCheck: async () => ({ status: "healthy", details: {} }),
    };
  }

  private async startDaemon(): Promise<void> {
    // Start listening for user input
  }

  private async stopDaemon(): Promise<void> {
    // Clean up resources
  }

  async processInput(input: string): Promise<void> {
    // Start conversation if needed
    const conversationId = await this.context.conversations.start(
      createId(),
      "my-interface",
      this.getChannelId(),
      { userId: this.getUserId() },
    );

    // Execute through agent service
    const result = await this.context.agentService.processQuery(
      input,
      conversationId,
      {
        interfaceType: "my-interface",
        userId: this.getUserId(),
      },
    );

    // Add assistant response to conversation
    await this.context.conversations.addMessage(
      conversationId,
      "assistant",
      result.content,
    );

    // Display result to user
    await this.displayResult(result);
  }
}
```

## Conversation Management

**ALWAYS track conversations properly:**

```typescript
// Start conversation with proper metadata
const conversationId = await context.conversations.start(
  createId(), // Unique conversation ID
  interfaceType, // Your interface type (e.g., "cli", "matrix")
  channelId, // Channel identifier
  {
    userId: userId,
    channelName: channelName,
  },
);

// Add messages to conversation
await context.conversations.addMessage(conversationId, "user", userInput);
await context.conversations.addMessage(conversationId, "assistant", response);

// Read conversation history
const conversation = await context.conversations.get(conversationId);
const messages = await context.conversations.getMessages(conversationId);
```

## Daemon Pattern

Interfaces run as long-lived processes (daemons):

```typescript
protected override createDaemon(): Daemon | undefined {
  return {
    start: async () => {
      // Initialize connections, start listening
      this.server = createServer();
      await this.server.listen(this.config.port);
    },
    stop: async () => {
      // Clean up, close connections
      await this.server?.close();
    },
    healthCheck: async () => ({
      status: this.server?.listening ? "healthy" : "unhealthy",
      details: { port: this.config.port },
    }),
  };
}
```

## Agent Integration

Interfaces relay user input to the agent service:

```typescript
// Process user query through agent
const result = await this.context.agentService.processQuery(
  userInput,
  conversationId,
  {
    interfaceType: this.id,
    userId: userId,
    // Additional context as needed
  },
);

// Result contains:
// - content: The agent's response
// - toolCalls: Any tools the agent invoked
// - metadata: Additional response metadata
```

## Permission Checking

Check user permissions before operations:

```typescript
const userLevel = await this.context.permissions.getUserLevel(
  this.id, // Interface type
  userId, // User ID
);

if (userLevel < requiredLevel) {
  return { success: false, error: "Insufficient permissions" };
}
```

## Testing

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { createInterfacePluginHarness } from "@brains/plugins/test";
import { MyInterface } from "../src";

describe("MyInterface", () => {
  let harness: ReturnType<typeof createInterfacePluginHarness>;
  let myInterface: MyInterface;

  beforeEach(async () => {
    harness = createInterfacePluginHarness();
    myInterface = new MyInterface();
    await harness.installPlugin(myInterface);
  });

  it("should start conversation on first input", async () => {
    // Test conversation management
  });

  it("should relay queries to agent service", async () => {
    // Test agent integration
  });
});
```

## Interface Checklist

Before submitting an interface:

- [ ] **Daemon lifecycle**: Proper start/stop/healthCheck implementation
- [ ] **Conversation tracking**: All user interactions tracked
- [ ] **Agent integration**: Queries processed through agentService
- [ ] **Permission checking**: User levels verified for sensitive operations
- [ ] **Error display**: Errors shown to user in appropriate format
- [ ] **Graceful shutdown**: Resources cleaned up on stop

## Reference Implementations

| Interface Type    | Reference               |
| ----------------- | ----------------------- |
| CLI (terminal)    | `interfaces/cli/`       |
| Chat bot (Matrix) | `interfaces/matrix/`    |
| API server (MCP)  | `interfaces/mcp/`       |
| Web server        | `interfaces/webserver/` |
