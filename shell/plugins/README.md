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
import { CorePlugin, createTypedTool, toolSuccess } from "@brains/plugins";
import { z } from "@brains/utils";

const greetSchema = z.object({
  name: z.string().describe("Name to greet"),
});

export class MyPlugin extends CorePlugin {
  constructor() {
    super("my-plugin", packageJson);
  }

  async getTools() {
    return [
      createTypedTool(
        this.id,
        "greet",
        "Greet a user by name",
        greetSchema,
        async (input) => {
          // input is typed as { name: string }
          return toolSuccess({ message: `Hello, ${input.name}!` });
        },
      ),
    ];
  }
}
```

### ServicePlugin

Extended base class for plugins that need entity registration, job handling, and AI generation:

```typescript
import { ServicePlugin, createTypedTool } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";

export class MyServicePlugin extends ServicePlugin {
  constructor(config?: MyConfig) {
    super("my-service", packageJson, config, configSchema);
  }

  protected async onRegister(context: ServicePluginContext) {
    // Register entity types
    context.entities.register("mytype", schema, adapter);

    // Register templates for content generation
    context.templates.register({ "my-template": template });

    // Register job handlers
    context.jobs.registerHandler("process", async (job) => {
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
    context.daemons.register("server", {
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

Use the `createTypedTool` helper for consistent tool creation with auto-validation:

```typescript
import { createTypedTool, toolSuccess } from "@brains/plugins";
import { z } from "@brains/utils";

const actionSchema = z.object({
  query: z.string().describe("Search query"),
  limit: z.number().optional().describe("Max results"),
});

const myTool = createTypedTool(
  "my-plugin", // Plugin ID
  "action", // Tool name (becomes "my-plugin_action")
  "Description of tool", // Description shown to users/AI
  actionSchema, // Zod schema (input is auto-validated and typed)
  async (input, context) => {
    // input is typed as { query: string; limit?: number }
    return toolSuccess(result);
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
  identity: {
    get(): IdentityBody;
    getProfile(): ProfileBody;
    getAppInfo(): Promise<AppInfo>;
  };

  // Inter-plugin messaging
  messaging: {
    send(channel, payload): Promise<Response>;
    subscribe(channel, handler): () => void;
  };

  // Template operations
  templates: {
    register(templates): void;
    format(template, data): string;
    parse(template, content): T;
  };

  // Conversations (read-only)
  conversations: {
    get(id): Promise<Conversation | null>;
    search(query): Promise<Conversation[]>;
    getMessages(conversationId, options?): Promise<Message[]>;
  };

  // AI operations
  ai: {
    query(prompt, context?): Promise<DefaultQueryResponse>;
  };

  // Job monitoring (read-only)
  jobs: {
    getActive(types?): Promise<JobInfo[]>;
    getActiveBatches(): Promise<Batch[]>;
    getBatchStatus(batchId): Promise<BatchJobStatus | null>;
    getStatus(jobId): Promise<JobInfo | null>;
  };
}
```

### ServicePluginContext

Extends CorePluginContext with write operations:

```typescript
interface ServicePluginContext extends CorePluginContext {
  entityService: IEntityService; // Full entity service

  // Entity management
  entities: {
    register(type, schema, adapter, config?): void;
    getAdapter(type): EntityAdapter | undefined;
    update(entity): Promise<{ entityId; jobId }>;
    registerDataSource(dataSource): void;
  };

  // Job queue (extends core jobs)
  jobs: CorePluginContext["jobs"] & {
    enqueue(type, data, toolContext, options?): Promise<string>;
    enqueueBatch(operations, options?): Promise<string>;
    registerHandler(type, handler): void;
  };

  // AI operations (extends core ai)
  ai: CorePluginContext["ai"] & {
    generate<T>(config): Promise<T>;
    generateImage(prompt, options?): Promise<ImageGenerationResult>;
    canGenerateImages(): boolean;
  };

  // Templates (extends core templates)
  templates: CorePluginContext["templates"] & {
    resolve<T>(templateName, options?): Promise<T | null>;
    getCapabilities(templateName): TemplateCapabilities | null;
  };

  // View templates
  views: {
    get(name): ViewTemplate | undefined;
    list(): ViewTemplate[];
    hasRenderer(templateName): boolean;
    getRenderer(templateName): WebRenderer | undefined;
    validate(templateName, content): boolean;
  };

  // Plugin metadata
  plugins: {
    getPackageName(pluginId): string | undefined;
  };

  // Evaluation
  eval: {
    registerHandler(handlerId, handler): void;
  };
}
```

### InterfacePluginContext

Extends CorePluginContext with interface-specific operations:

```typescript
interface InterfacePluginContext extends CorePluginContext {
  mcpTransport: IMCPTransport;
  agentService: IAgentService;

  // Permission checking
  permissions: {
    getUserLevel(interfaceType, userId): UserPermissionLevel;
  };

  // Daemon management
  daemons: {
    register(name, daemon): void;
  };

  // Job queue (extends core jobs)
  jobs: CorePluginContext["jobs"] & {
    enqueue(type, data, toolContext, options?): Promise<string>;
    enqueueBatch(operations, options?): Promise<string>;
    registerHandler(type, handler): void;
  };

  // Conversations (extends core with write operations)
  conversations: CorePluginContext["conversations"] & {
    start(id, interfaceType, channelId, metadata): Promise<string>;
    addMessage(conversationId, role, content, metadata?): Promise<void>;
  };
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

1. **Use `createTypedTool` helper** - Ensures consistent naming, auto-validation, and typed input
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

- `createTypedTool(pluginId, name, description, schema, handler, options?)` - Create a tool with auto-validation
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
