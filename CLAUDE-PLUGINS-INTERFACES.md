# CLAUDE-PLUGINS-INTERFACES.md - Guidelines for Plugin and Interface Development

## Your Role as a Plugin/Interface Developer

As Claude, when developing plugins or interfaces for the Personal Brain project, you must follow these specialized guidelines to ensure consistent, high-quality, and maintainable extensions to the system.

## Core Development Principles

### 1. Tool-First Architecture

- **EVERY feature MUST be exposed as an MCP tool**
- Commands are auto-generated from tools for message interfaces
- Never create command-only functionality
- Tools define the contract, interfaces consume them

### 2. Entity-Driven Design

- Plugins that manage data MUST define entity types
- Use Zod schemas for all entity definitions
- Implement proper EntityAdapter for markdown serialization
- Register entities during plugin initialization

### 3. Test-First Implementation

- Write tests using the provided harnesses BEFORE implementation
- Never access private members in tests
- Use `createCorePluginHarness()` for CorePlugin testing
- Use `createInterfacePluginHarness()` for InterfacePlugin testing

## Plugin Development Guidelines

### Plugin Type Selection

Choose the correct plugin type based on functionality:

```typescript
// CorePlugin - For features that provide tools/resources
export class MyFeaturePlugin extends CorePlugin {
  // Provides: tools, resources, handlers, jobs
}

// ServicePlugin - For shared services used by other plugins
export class SharedServicePlugin extends ServicePlugin {
  // Provides: services accessible by other plugins
}

// InterfacePlugin - For user interfaces without messaging
export class WebInterfacePlugin extends InterfacePlugin {
  // Provides: daemons, web servers, APIs
}

// MessageInterfacePlugin - For chat/command interfaces
export class ChatInterfacePlugin extends MessageInterfacePlugin {
  // Provides: message handling, command execution
}
```

### CorePlugin Implementation Pattern

**ALWAYS follow this structure:**

```typescript
import {
  CorePlugin,
  type CorePluginContext,
  type PluginCapabilities,
} from "@brains/plugins";
import { z } from "zod";

// 1. Define configuration schema
const configSchema = z.object({
  enableFeatureX: z.boolean().default(true),
  maxRetries: z.number().default(3),
});

type PluginConfig = z.infer<typeof configSchema>;

// 2. Define tool input schemas
const myToolSchema = z.object({
  input: z.string(),
  options: z
    .object({
      format: z.enum(["json", "text"]).default("text"),
    })
    .optional(),
});

// 3. Implement plugin class
export class MyPlugin extends ServicePlugin<PluginConfig> {
  constructor(config?: Partial<PluginConfig>) {
    super("my-plugin", packageJson, config, configSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Register entity type if plugin manages entities
    context.entities.register("my-type", myEntitySchema, new MyEntityAdapter());

    // Subscribe to relevant events
    context.messaging.subscribe(
      "entity:created",
      this.handleEntityCreated.bind(this),
    );
  }

  protected override async getTools(): Promise<PluginTool[]> {
    return [
      {
        name: `${this.id}:my_tool`,
        description: "Clear, concise description of what this tool does",
        inputSchema: myToolSchema,
        handler: this.handleMyTool.bind(this),
      },
    ];
  }

  private async handleMyTool(
    input: unknown,
  ): Promise<{ success: boolean; data?: unknown }> {
    const params = myToolSchema.parse(input);
    // Implementation
    return { success: true, data: result };
  }

  private async handleEntityCreated(payload: unknown): Promise<void> {
    // Event handler implementation
  }
}
```

### Entity Definition Pattern

**When plugin manages data:**

```typescript
// 1. Define entity schema
export const myEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("my-type"),
  customField: z.string(),
  metadata: z.record(z.unknown()).default({}),
});

export type MyEntity = z.infer<typeof myEntitySchema>;

// 2. Create factory function
export function createMyEntity(input: Partial<MyEntity>): MyEntity {
  const now = new Date().toISOString();
  return myEntitySchema.parse({
    id: input.id ?? nanoid(12),
    entityType: "my-type",
    created: now,
    updated: now,
    ...input,
  });
}

// 3. Implement adapter
export class MyEntityAdapter implements EntityAdapter<MyEntity> {
  entityType = "my-type";
  schema = myEntitySchema;

  toMarkdown(entity: MyEntity): string {
    const frontmatter = matter.stringify("", {
      customField: entity.customField,
      metadata: entity.metadata,
    });
    return `${frontmatter}${entity.content}`;
  }

  fromMarkdown(markdown: string): Partial<MyEntity> {
    const { data, content } = matter(markdown);
    return {
      content: content.trim(),
      customField: data.customField as string,
      metadata: (data.metadata as Record<string, unknown>) || {},
    };
  }
}
```

### Messaging Namespace

**Use messaging for cross-plugin communication:**

```typescript
// Define event constants
export const MY_EVENT = "my-plugin:event";

// Send messages to other plugins
await context.messaging.send(MY_EVENT, {
  entityId: entity.id,
  action: "processed",
});

// Subscribe to events from other plugins
const unsubscribe = context.messaging.subscribe(
  OTHER_EVENT,
  async (payload) => {
    await this.processEvent(payload);
    return { success: true };
  },
);

// Remember to unsubscribe in shutdown
```

### Error Handling Requirements

**NEVER let errors crash the shell:**

```typescript
async handleTool(input: unknown): Promise<ToolResult> {
  try {
    const params = schema.parse(input);
    const result = await this.process(params);
    return { success: true, data: result };
  } catch (error) {
    this.context.logger.error("Tool execution failed", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
```

## Interface Development Guidelines

### Interface Type Selection

```typescript
// For CLI interfaces
export class CLIInterface extends MessageInterfacePlugin {
  // Uses Ink for React-based terminal UI
}

// For web servers
export class WebInterface extends InterfacePlugin {
  // Provides HTTP endpoints
}

// For chat bots
export class ChatInterface extends MessageInterfacePlugin {
  // Handles messages and commands
}
```

### MessageInterfacePlugin Pattern

**Standard implementation structure:**

```typescript
export class MyInterface extends MessageInterfacePlugin<MyConfig> {
  constructor(config?: MyConfig) {
    super("my-interface", packageJson, config, myConfigSchema);
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    // Register daemon for long-running process via createDaemon()
    // The base class handles registration automatically
  }

  protected override createDaemon(): Daemon | undefined {
    return {
      start: this.startDaemon.bind(this),
      stop: this.stopDaemon.bind(this),
      healthCheck: async () => ({ status: "healthy", ... }),
    };
  }

  async processInput(input: string): Promise<void> {
    // Start conversation if needed using namespace
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

    // Display result
    await this.displayResult(result);
  }
}
```

### Conversation Management

**ALWAYS track conversations properly using the conversations namespace:**

```typescript
// Start conversation with proper metadata
const conversationId = await context.conversations.start(
  createId(), // Unique conversation ID
  interfaceType, // Your interface type (e.g., "cli", "matrix")
  channelId, // Channel identifier
  {
    userId: userId,
    channelName: channelName, // Human-readable channel name
  },
);

// Add messages to conversation
await context.conversations.addMessage(conversationId, "user", userInput);

await context.conversations.addMessage(conversationId, "assistant", response);

// Read conversation history (available in all plugin types)
const conversation = await context.conversations.get(conversationId);
const messages = await context.conversations.getMessages(conversationId);
```

## Testing Requirements

### Plugin Test Structure

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { createCorePluginHarness } from "@brains/plugins/test";
import { MyPlugin } from "../src";

describe("MyPlugin", () => {
  let harness: ReturnType<typeof createCorePluginHarness>;
  let plugin: MyPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createCorePluginHarness();
    plugin = new MyPlugin({
      /* config */
    });
    capabilities = await harness.installPlugin(plugin);
  });

  it("should register expected tools", () => {
    expect(capabilities.tools).toHaveLength(1);
    expect(capabilities.tools[0].name).toBe("my_tool");
  });

  it("should execute tool successfully", async () => {
    const result = await harness.executeTool("my_tool", {
      input: "test",
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it("should handle errors gracefully", async () => {
    const result = await harness.executeTool("my_tool", {
      input: "", // Invalid input
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

### Interface Test Structure

```typescript
describe("MyInterface", () => {
  let harness: ReturnType<typeof createInterfacePluginHarness>;
  let interface: MyInterface;

  beforeEach(async () => {
    harness = createInterfacePluginHarness();
    interface = new MyInterface();
    await harness.installPlugin(interface);
  });

  it("should start conversation on first input", async () => {
    const conversationService = harness.getShell().getConversationService();
    const startSpy = vi.spyOn(conversationService, "startConversation");

    await interface.processInput("Hello");

    expect(startSpy).toHaveBeenCalledWith(
      expect.any(String), // interface ID
      expect.any(String), // user ID
      "interface",
      expect.objectContaining({
        channelName: expect.any(String),
      }),
    );
  });
});
```

## Common Patterns and Anti-Patterns

### ✅ DO

1. **Use dependency injection via context**

   ```typescript
   const { entityService, aiService } = this.context;
   ```

2. **Validate all inputs with Zod**

   ```typescript
   const params = inputSchema.parse(input);
   ```

3. **Return consistent result objects**

   ```typescript
   return { success: true, data: result };
   return { success: false, error: "message" };
   ```

4. **Clean up resources in shutdown**

   ```typescript
   async shutdown(): Promise<void> {
     this.subscriptions.forEach(sub => sub.unsubscribe());
   }
   ```

5. **Use test harnesses for testing**
   ```typescript
   const harness = createCorePluginHarness();
   ```

### ❌ DON'T

1. **Access private members in tests**

   ```typescript
   // WRONG
   (plugin as any).privateMethod();

   // RIGHT
   await harness.executeTool("public_tool", {});
   ```

2. **Throw errors that crash the shell**

   ```typescript
   // WRONG
   throw new Error("Fatal error");

   // RIGHT
   return { success: false, error: "Error message" };
   ```

3. **Create commands without tools**

   ```typescript
   // WRONG
   commandRegistry.register({ name: "cmd", handler: ... });

   // RIGHT - Tools auto-generate commands
   return { tools: [{ name: "cmd", ... }] };
   ```

4. **Forget to validate entity types**

   ```typescript
   // WRONG
   const entity = data as MyEntity;

   // RIGHT
   const entity = myEntitySchema.parse(data);
   ```

5. **Use setTimeout/setInterval directly**

   ```typescript
   // WRONG
   setTimeout(() => poll(), 1000);

   // RIGHT - Use daemons for long-running processes
   daemonRegistry.registerDaemon({ start, stop });
   ```

## Architecture Checklist

Before submitting a plugin or interface:

- [ ] **Tool-first**: All functionality exposed as MCP tools
- [ ] **Entity schemas**: Defined with Zod for any managed data
- [ ] **Error handling**: No unhandled errors can crash shell
- [ ] **Test coverage**: Using provided harnesses, no private access
- [ ] **Message bus**: Events published for significant actions
- [ ] **Conversation tracking**: Interfaces maintain conversation state
- [ ] **Cleanup**: Resources released in shutdown method
- [ ] **Documentation**: Clear descriptions for all tools/resources
- [ ] **Type safety**: Full TypeScript typing, no `any` types
- [ ] **Validation**: All inputs validated with Zod schemas

## Quick Reference

### File Structure

```
plugins/my-plugin/
├── src/
│   ├── index.ts           # Main plugin export
│   ├── my-plugin.ts       # Plugin implementation
│   ├── entities/          # Entity definitions (if any)
│   │   └── my-entity.ts
│   ├── adapters/          # Entity adapters (if any)
│   │   └── my-adapter.ts
│   └── lib/              # Internal utilities
├── test/
│   ├── plugin.test.ts    # Plugin tests
│   └── fixtures/         # Test data
├── package.json
└── tsconfig.json
```

### Essential Imports

```typescript
// For plugins
import {
  ServicePlugin,
  CorePlugin,
  type ServicePluginContext,
  type CorePluginContext,
  type PluginTool,
  createTool,
} from "@brains/plugins";
import { z, createId } from "@brains/utils";

// For interfaces
import {
  InterfacePlugin,
  MessageInterfacePlugin,
  type InterfacePluginContext,
} from "@brains/plugins";

// For testing
import { createCorePluginHarness } from "@brains/plugins/test";
import { createServicePluginHarness } from "@brains/plugins/test";
import { createInterfacePluginHarness } from "@brains/plugins/test";
import { describe, it, expect, beforeEach } from "bun:test";
```

### Context Namespaces Available

All context methods are organized into logical namespaces for better discoverability.

**CorePluginContext:**

- `logger` - Logging service
- `entityService` - Read-only entity service
- `identity.*` - Brain identity and profile access
  - `get()` - Get brain identity
  - `getProfile()` - Get owner profile
  - `getAppInfo()` - Get app version info
- `ai.query()` - AI query operations
- `conversations.*` - Read-only conversation access
  - `get(id)` - Get conversation
  - `search(query)` - Search conversations
  - `getMessages(id)` - Get messages
- `templates.*` - Template operations
  - `register(templates)` - Register templates
  - `format(name, data)` - Format content
  - `parse(name, content)` - Parse content
- `messaging.*` - Inter-plugin communication
  - `send(channel, payload)` - Send message
  - `subscribe(channel, handler)` - Subscribe to messages
- `jobs.*` - Job monitoring (read-only)
  - `getActive()` - Get active jobs
  - `getStatus(id)` - Get job status

**ServicePluginContext (extends CorePluginContext):**

- `entityService` - Full entity CRUD service
- `entities.*` - Entity management
  - `register(type, schema, adapter)` - Register entity type
  - `getAdapter(type)` - Get adapter
  - `update(entity)` - Update entity
  - `registerDataSource(ds)` - Register data source
- `ai.*` - Extended AI operations
  - `generate(config)` - Generate content
  - `generateImage(prompt)` - Generate images
- `templates.*` - Extended template operations
  - `resolve(name, options)` - Resolve content
  - `getCapabilities(name)` - Get capabilities
- `jobs.*` - Extended job operations
  - `enqueue(type, data, ctx, opts)` - Enqueue job
  - `registerHandler(type, handler)` - Register handler
- `views.*` - View template access
- `plugins.*` - Plugin metadata
- `eval.*` - Evaluation handlers

**InterfacePluginContext (extends CorePluginContext):**

- `mcpTransport` - MCP transport access
- `agentService` - Agent service for queries
- `permissions.*` - Permission checking
  - `getUserLevel(interface, userId)` - Get user level
- `daemons.*` - Daemon management
  - `register(name, daemon)` - Register daemon
- `jobs.*` - Extended job operations (same as Service)
- `conversations.*` - Extended with write operations
  - `start(id, type, channelId, meta)` - Start conversation
  - `addMessage(convId, role, content)` - Add message

## Getting Help

When implementing plugins or interfaces:

1. **Check existing examples**: Look at `plugins/link`, `plugins/summary`, `interfaces/cli`
2. **Review test files**: Tests often show proper usage patterns
3. **Use TypeScript**: Let the type system guide you
4. **Ask specific questions**: "Should this tool return a string or an object?"
5. **Run tests frequently**: `bun test` after each significant change

Remember: The goal is to create maintainable, testable, and reliable extensions to the Personal Brain system. Follow these patterns consistently, and the codebase will remain clean and extensible.
