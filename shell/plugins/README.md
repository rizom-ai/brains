# @brains/plugins

Base classes and utilities for Personal Brain plugin development.

## Overview

This package provides the foundation for building plugins that extend Brain applications. It includes base classes for different plugin types, typed contexts, and standardized interfaces.

## Installation

```bash
npm install @brains/plugins
```

All plugin dependencies are re-exported from this package, so you typically only need this single import.

## Plugin Types

### CorePlugin

Base class for plugins that provide tools and resources:

```typescript
import { CorePlugin, createTool } from "@brains/plugins";
import { z } from "@brains/utils";

export class MyPlugin extends CorePlugin {
  constructor() {
    super("my-plugin", packageJson);
  }

  async getTools() {
    return [
      createTool(
        this.id,
        "greet",
        "Greet a user by name",
        { name: z.string().describe("Name to greet") },
        async (input) => {
          const { name } = z.object({ name: z.string() }).parse(input);
          return { message: `Hello, ${name}!` };
        },
      ),
    ];
  }
}
```

### ServicePlugin

Extended base class for plugins that need entity registration, job handling, and AI generation:

```typescript
import { ServicePlugin, createTool } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";

export class MyServicePlugin extends ServicePlugin {
  constructor(config?: MyConfig) {
    super("my-service", packageJson, config, configSchema);
  }

  protected async onRegister(context: ServicePluginContext) {
    // Register entity types
    context.registerEntityType("mytype", schema, adapter);

    // Register templates for content generation
    context.registerTemplates({ "my-template": template });

    // Register job handlers
    context.registerJobHandler("process", async (job) => {
      // Handle background job
    });
  }
}
```

### InterfacePlugin

Base class for plugins that provide user interfaces (CLI, web, chat):

```typescript
import { InterfacePlugin } from "@brains/plugins";
import type { InterfacePluginContext } from "@brains/plugins";

export class MyInterface extends InterfacePlugin {
  protected async onRegister(context: InterfacePluginContext) {
    // Register daemon for the interface
    context.registerDaemon("server", {
      start: async () => {
        /* Start server */
      },
      stop: async () => {
        /* Cleanup */
      },
    });
  }
}
```

## Creating Tools

Use the `createTool` helper for consistent tool creation:

```typescript
import { createTool } from "@brains/plugins";
import { z } from "@brains/utils";

const myTool = createTool(
  "my-plugin", // Plugin ID
  "action", // Tool name (becomes "my-plugin_action")
  "Description of tool", // Description shown to users/AI
  {
    // Input schema (Zod shape)
    query: z.string().describe("Search query"),
    limit: z.number().optional().describe("Max results"),
  },
  async (input, context) => {
    // Handler implementation
    return { status: "success", data: result };
  },
  { visibility: "public" }, // Optional: "anchor" (default) or "public"
);
```

### Tool Visibility

- `anchor` (default): Only available to the brain owner
- `public`: Available to all users

## Plugin Contexts

### CorePluginContext

Available to all plugins:

```typescript
interface CorePluginContext {
  pluginId: string;
  logger: Logger;
  entityService: ICoreEntityService; // Read-only entity access

  // Brain identity and owner profile
  getIdentity(): IdentityBody;
  getProfile(): ProfileBody;

  // Inter-plugin messaging
  sendMessage(channel, payload): Promise<Response>;
  subscribe(channel, handler): () => void;

  // Template operations
  formatContent(template, data): string;
  parseContent(template, content): T;
  registerTemplates(templates): void;

  // Conversations (read-only)
  getConversation(id): Promise<Conversation | null>;
  searchConversations(query): Promise<Conversation[]>;
  getMessages(conversationId, options?): Promise<Message[]>;

  // Job monitoring (read-only)
  getActiveJobs(types?): Promise<JobInfo[]>;
  getBatchStatus(batchId): Promise<BatchJobStatus | null>;
}
```

### ServicePluginContext

Extends CorePluginContext with write operations:

```typescript
interface ServicePluginContext extends CorePluginContext {
  // Entity management
  registerEntityType(type, schema, adapter): void;
  createEntity(entity): Promise<{ entityId; jobId }>;
  updateEntity(entity): Promise<{ entityId; jobId }>;

  // Job queue
  enqueueJob(type, data, toolContext, options?): Promise<string>;
  registerJobHandler(type, handler): void;

  // AI content generation
  generateContent<T>(config): Promise<T>;

  // DataSource registration
  registerDataSource(id, dataSource): void;
}
```

### InterfacePluginContext

Extends CorePluginContext with interface-specific operations:

```typescript
interface InterfacePluginContext extends CorePluginContext {
  // Permission checking
  getUserPermissionLevel(interfaceType, userId): UserPermissionLevel;

  // Daemon management
  registerDaemon(name, daemon): void;

  // Job queue (for spawning background work)
  enqueueJob(type, data, toolContext, options?): Promise<string>;

  // Conversation management (write operations)
  startConversation(id, interfaceType, channelId, metadata): Promise<string>;
  addMessage(conversationId, role, content, metadata?): Promise<void>;

  // Agent service for AI interaction
  agentService: IAgentService;
}
```

## Testing

Test harnesses for each plugin type:

```typescript
import { createCorePluginHarness } from "@brains/plugins/test";

// Create harness
const harness = createCorePluginHarness<MyPlugin>({ dataDir: "/tmp/test" });

// Install plugin
const capabilities = await harness.installPlugin(new MyPlugin());

// Access tools
const tools = capabilities.tools;
const myTool = tools.find((t) => t.name === "my-plugin_action");

// Execute tool
const result = await myTool.handler({ query: "test" }, mockContext);

// Mock message handlers
harness.subscribe("my:event", async (msg) => ({ success: true, data: {} }));

// Get mock shell for direct access
const shell = harness.getShell();
```

Available harnesses:

- `createCorePluginHarness<T>()` - For CorePlugin tests
- `createServicePluginHarness<T>()` - For ServicePlugin tests
- `createInterfacePluginHarness<T>()` - For InterfacePlugin tests

## Configuration

Plugins support typed configuration with Zod validation:

```typescript
import { z } from "@brains/utils";
import { ServicePlugin } from "@brains/plugins";

const configSchema = z.object({
  apiKey: z.string().optional(),
  timeout: z.number().default(5000),
  enabled: z.boolean().default(true),
});

type MyConfig = z.input<typeof configSchema>;

class MyPlugin extends ServicePlugin<z.infer<typeof configSchema>> {
  constructor(config?: MyConfig) {
    super("my-plugin", packageJson, config, configSchema);
  }
}
```

## Best Practices

1. **Use `createTool` helper** - Ensures consistent naming and structure
2. **Use typed schemas** - Define Zod schemas for all inputs/outputs
3. **Handle errors gracefully** - Return error objects, don't throw
4. **Document tools clearly** - Descriptions are shown to AI and users
5. **Keep tools focused** - One tool, one purpose
6. **Use appropriate visibility** - `public` only for safe, read-only tools
7. **Test with harnesses** - Use provided test utilities

## Exports

### Base Classes

- `CorePlugin` - Basic plugin functionality
- `ServicePlugin` - Entity and job management
- `InterfacePlugin` - User interface plugins
- `MessageInterfacePlugin` - Chat/CLI interfaces

### Utilities

- `createTool(pluginId, name, description, schema, handler, options?)` - Create a tool
- `createResource(pluginId, uri, name, description, handler)` - Create a resource
- `createId()` - Generate unique IDs

### Types

- `Plugin`, `PluginTool`, `PluginResource`, `PluginCapabilities`
- `CorePluginContext`, `ServicePluginContext`, `InterfacePluginContext`
- `ToolContext`, `ToolResponse`, `ToolVisibility`

### Re-exports

Dependencies are re-exported for convenience:

- Entity types from `@brains/entity-service`
- Job types from `@brains/job-queue`
- Template types from `@brains/templates`
- Message types from `@brains/messaging-service`

## License

MIT
