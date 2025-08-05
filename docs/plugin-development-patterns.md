# Plugin Development Patterns

This document outlines the standardized patterns for developing plugins in the Personal Brain system.

## Table of Contents

1. [Base Plugin Classes](#base-plugin-classes)
2. [Plugin Configuration](#plugin-configuration)
3. [Plugin Lifecycle](#plugin-lifecycle)
4. [Direct Service Access](#direct-service-access)
5. [Testing Patterns](#testing-patterns)
6. [Common Plugin Patterns](#common-plugin-patterns)
   - [Commands and Tools Organization](#commands-and-tools-organization)
   - [Feature Plugin Pattern](#feature-plugin-pattern)
7. [Migration Guide](#migration-guide)

## Base Plugin Classes

The plugin system provides two base classes that handle common functionality and patterns.

### BasePlugin

The `BasePlugin` class is the foundation for all plugins. It provides:

- Configuration validation
- Logging helpers
- Tool creation utilities
- Lifecycle management

```typescript
import type { Plugin, PluginContext, PluginTool } from "@brains/types";
import { BasePlugin, validatePluginConfig } from "@brains/utils";
import { myPluginConfigSchema, type MyPluginConfig } from "./config";

export class MyPlugin extends BasePlugin<MyPluginConfig> {
  private myService?: MyService;

  constructor(config: unknown) {
    // Validate config first
    const validatedConfig = validatePluginConfig(
      myPluginConfigSchema,
      config,
      "my-plugin",
    );

    super(
      "my-plugin", // plugin ID
      "My Plugin", // display name
      "Plugin description", // description
      validatedConfig, // validated config
    );
  }

  // Lifecycle: Initialize plugin
  protected override async onRegister(context: PluginContext): Promise<void> {
    const { logger, entityService } = context;

    // Initialize services
    this.myService = new MyService({
      apiKey: this.config.apiKey,
      logger: logger.child("MyPlugin"),
    });

    this.info("Plugin initialized successfully");
  }

  // Define plugin tools
  protected override async getTools(): Promise<PluginTool[]> {
    return [
      this.createTool(
        "fetch_data",
        "Fetch data from service",
        {}, // Empty object for no parameters
        async (): Promise<{ data: string }> => {
          if (!this.myService) {
            throw new Error("Service not initialized");
          }
          const data = await this.myService.fetchData();
          return { data };
        },
      ),
    ];
  }

  // Lifecycle: Cleanup
  protected override async onShutdown(): Promise<void> {
    this.myService?.disconnect();
    this.info("Plugin shutdown complete");
  }
}
```

### ContentGeneratingPlugin

The `ContentGeneratingPlugin` extends `BasePlugin` with content generation capabilities:

- Content type registration
- Generated content management
- Automatic tool creation for content generation

```typescript
import type { PluginContext, PluginTool } from "@brains/types";
import { ContentGeneratingPlugin, validatePluginConfig } from "@brains/utils";
import { blogConfigSchema, type BlogConfig } from "./config";
import { BlogPostFormatter } from "./formatters";
import { blogPostSchema } from "./schemas";

export class BlogPlugin extends ContentGeneratingPlugin<BlogConfig> {
  constructor(config: unknown) {
    // Validate config first
    const validatedConfig = validatePluginConfig(
      blogConfigSchema,
      config,
      "blog",
    );

    super(
      "blog",
      "Blog Plugin",
      "Generate and manage blog posts",
      validatedConfig,
    );
  }

  protected override async onRegister(context: PluginContext): Promise<void> {
    const { formatters } = context;

    // Register content types with schemas and formatters
    this.registerContentType("post", {
      contentType: "post",
      schema: blogPostSchema,
      formatter: new BlogPostFormatter(),
    });

    this.registerContentType("outline", {
      contentType: "outline",
      schema: blogOutlineSchema,
      // Formatter is optional
    });

    this.info("Blog plugin initialized with content types");
  }

  protected override async getTools(): Promise<PluginTool[]> {
    // Get content generation tools from parent class
    const contentTools = await super.getTools();

    // Add custom tools specific to this plugin
    const customTools = [
      this.createTool(
        "import_markdown",
        "Import existing markdown files as blog posts",
        toolInput().string("filePath").boolean("publish", false).build(),
        async (input): Promise<{ imported: number }> => {
          // Implementation
          return { imported: 1 };
        },
      ),
    ];

    return [...contentTools, ...customTools];
  }
}
```

The parent class automatically provides tools for generating content based on registered types:

- `blog:generate_post` - Generate content of type "post"
- `blog:generate_outline` - Generate content of type "outline"
- `blog:list_generated` - List all generated content
- `blog:get_generated` - Get specific generated content
- `blog:save_generated` - Save generated content as an entity

## Plugin Configuration

### Configuration Schema Pattern

All plugins must define their configuration using Zod schemas and validate it in the constructor:

```typescript
// config.ts
import { z } from "zod";
import { pluginConfig } from "@brains/utils";

// Define schema using the configuration builder
export const myPluginConfigSchema = pluginConfig()
  .requiredString("apiKey", "API key for the service")
  .optionalString("endpoint", "API endpoint URL")
  .numberWithDefault("timeout", 5000, {
    min: 0,
    max: 30000,
    description: "Request timeout in milliseconds",
  })
  .enum("environment", ["dev", "staging", "prod"] as const, {
    default: "prod",
    description: "Target environment",
  })
  .array("allowedDomains", z.string(), {
    default: [],
    description: "List of allowed domains",
  })
  .boolean("debug", false, "Enable debug logging")
  .describe("Configuration for My Plugin")
  .build();

// Export types
export type MyPluginConfig = z.infer<typeof myPluginConfigSchema>;
export type MyPluginConfigInput = z.input<typeof myPluginConfigSchema>;

// Export config builder function for users
export const myPluginConfig = (): ReturnType<typeof pluginConfig> =>
  pluginConfig()
    .requiredString("apiKey", "API key for the service")
    .optionalString("endpoint", "API endpoint URL")
    .numberWithDefault("timeout", 5000, {
      min: 0,
      max: 30000,
      description: "Request timeout in milliseconds",
    })
    .describe("Configuration for My Plugin");
```

### Tool Input Schemas

Use the `toolInput` builder for tool parameters:

```typescript
import { toolInput } from "@brains/utils";

// Simple tool with basic inputs
const searchToolInput = toolInput()
  .string("query")
  .optionalNumber("limit")
  .boolean("includeMetadata", false)
  .build();

// Complex tool with enum and custom validation
const exportToolInput = toolInput()
  .enum("format", ["json", "csv", "xml"] as const)
  .optionalString("filename")
  .custom(
    "options",
    z
      .object({
        headers: z.boolean().default(true),
        compress: z.boolean().default(false),
      })
      .optional(),
  )
  .build();
```

## Plugin Lifecycle

Plugins follow a well-defined lifecycle managed by the base classes:

### 1. Construction Phase

```typescript
constructor(config: unknown) {
  // Validate configuration
  const validatedConfig = validatePluginConfig(schema, config, "plugin-id");

  // Call parent constructor
  super("plugin-id", "Plugin Name", "Description", validatedConfig);

  // Do NOT initialize services here - wait for onRegister
}
```

### 2. Registration Phase

```typescript
protected override async onRegister(context: PluginContext): Promise<void> {
  // Access services from context
  const { logger, entityService, formatters } = context;

  // Initialize plugin services
  this.myService = new MyService({ logger });

  // Register formatters, content types, etc.
  formatters.register("myFormat", new MyFormatter());

  // Subscribe to events if needed
  this.unsubscribe = messageBus.subscribe("event", this.handleEvent);
}
```

### 3. Active Phase

During this phase, the plugin's tools are available and can be called:

- Tools are accessed via `plugin-id:tool-name`
- Logging helpers are available: `this.debug()`, `this.info()`, `this.warn()`, `this.error()`
- Access to configuration via `this.config`

### 4. Shutdown Phase

```typescript
protected override async onShutdown(): Promise<void> {
  // Stop any running processes
  this.myService?.stop();

  // Unsubscribe from events
  this.unsubscribe?.();

  // Clean up resources
  await this.cleanup();

  this.info("Plugin shutdown complete");
}
```

## Direct Service Access

### Accessing Services Through Context

Services are provided through the `PluginContext` during the registration phase:

```typescript
protected override async onRegister(context: PluginContext): Promise<void> {
  // Destructure the services you need
  const {
    logger,
    entityService,
    formatters,
    messageBus,
    registerEntityType,  // For registering new entity types
  } = context;

  // Store references if needed throughout plugin lifecycle
  this.entityService = entityService;

  // Use services directly
  const entities = await entityService.search({
    entityType: "note",
    query: "example",
  });

  // Register formatters
  formatters.register("myFormat", new MyFormatter());

  // For content plugins, additional context is available
  if (this instanceof ContentGeneratingPlugin) {
    const { contentTypeRegistry } = context;
    // contentTypeRegistry is used internally by registerContentType
  }
}
```

### Available Services

The following services are available through `PluginContext`:

- `logger`: Logger instance with plugin-specific context
- `entityService`: CRUD operations on entities
- `formatters`: Formatter registry for content formatting
- `messageBus`: Event publish/subscribe system
- `registerEntityType`: Function to register new entity types

### Service Usage Examples

````typescript
// EntityService usage
const notes = await entityService.search({
  entityType: "note",
  query: "meeting",
  limit: 10,
});

const note = await entityService.getEntity("note-123");

await entityService.createEntity({
  entityType: "note",
  content: "New note content",
  metadata: { tags: ["important"] },
});

// MessageBus usage
messageBus.publish({
  type: "plugin:event",
  payload: { data: "something happened" },
});

const unsubscribe = messageBus.subscribe(
  "entity:created",
  async (message) => {
    this.info("New entity created", message.payload);
  },
);

// Formatter usage
const formatter = formatters.get("markdown");
const formatted = await formatter.format(content);

## Testing Patterns

### Using Plugin Test Utilities

The `@brains/utils` package includes comprehensive testing utilities:

```typescript
import {
  PluginTester,
  ConfigTester,
  createMockPlugin,
  PluginTestHarness,
} from "@brains/utils";

describe("MyPlugin", () => {
  // Test plugin lifecycle
  it("should register successfully", async () => {
    const plugin = new MyPlugin({ apiKey: "test" });
    const tester = new PluginTester(plugin);

    await tester.testRegistration();
    await tester.testToolsStructure();
  });

  // Test configuration
  it("should validate configuration", () => {
    const tester = new ConfigTester(configSchema, "my-plugin");

    tester.testConfig({
      name: "valid config",
      config: { apiKey: "test-key" },
      shouldPass: true,
    });

    tester.testConfig({
      name: "missing required field",
      config: {},
      shouldPass: false,
      expectedError: "Required",
    });
  });

  // Test with mock services
  it("should interact with entity service", async () => {
    const harness = new PluginTestHarness();
    const plugin = new MyPlugin({ apiKey: "test" });

    await harness.installPlugin(plugin);

    // Create test data
    await harness.createEntity({
      entityType: "note",
      content: "Test note",
    });

    // Test plugin functionality
    const tool = harness.getTool("my-tool");
    const result = await tool.handler({});

    expect(result).toBeDefined();
  });
});
````

### Testing Tool Validation

```typescript
it("should validate tool input", async () => {
  const tester = new PluginTester(plugin);

  // Test with valid input
  const result = await tester.testToolExecution("my-tool", {
    validParam: "value",
  });
  expect(result).toHaveProperty("success", true);

  // Test with invalid input
  await tester.testToolValidation("my-tool", {
    invalidParam: 123,
  });
});
```

### Testing Progress Reporting

```typescript
it("should report progress", async () => {
  const plugin = createProgressPlugin();
  const tester = new PluginTester(plugin);

  await tester.testRegistration();

  let progressCount = 0;
  const sendProgress = async (): Promise<void> => {
    progressCount++;
  };

  const tool = tester.findTool("progress_tool");
  await tool.handler({ steps: 3 }, { sendProgress });

  expect(progressCount).toBe(3);
});
```

## Common Plugin Patterns

### Commands and Tools Organization

Plugins should follow consistent patterns for organizing commands and tools:

#### Tools Pattern (Recommended)

All plugins should define their tools in a single `tools/index.ts` file using a factory function:

```typescript
// plugins/my-plugin/src/tools/index.ts
import type { PluginTool } from "@brains/plugins";
import { z } from "zod";

export function createMyPluginTools(
  myPlugin: MyPlugin,
  pluginId: string,
): PluginTool[] {
  return [
    {
      name: `${pluginId}:action`,
      description: "Perform an action",
      inputSchema: {
        param: z.string().describe("Action parameter"),
      },
      visibility: "public",
      handler: async (input) => {
        const { param } = input as { param: string };
        return myPlugin.performAction(param);
      },
    },
    // Additional tools...
  ];
}
```

#### Commands Pattern

Commands should also be defined in a single `commands/index.ts` file:

```typescript
// plugins/my-plugin/src/commands/index.ts
import type { Command } from "@brains/plugins";

export function createMyPluginCommands(
  myPlugin: MyPlugin,
  pluginId: string,
): Command[] {
  return [
    {
      name: "action",
      description: "Perform an action",
      usage: "/action <param>",
      handler: async (args, context) => {
        if (args.length === 0) {
          return {
            type: "message",
            message: "Please provide a parameter",
          };
        }

        const result = await myPlugin.performAction(args[0]);
        return {
          type: "message",
          message: `Action completed: ${result}`,
        };
      },
    },
    // Additional commands...
  ];
}
```

#### Interface-Specific Commands

Interface plugins (CLI, Matrix) may have interface-specific commands that should be defined inline in the interface class:

```typescript
// interfaces/cli/src/cli-interface.ts
protected override async getCommands(): Promise<Command[]> {
  return createCLICommands({
    showProgress: false, // Interface-specific state
  });
}
```

#### Key Principles

1. **Single File Pattern**: All tools/commands in one `index.ts` file, not spread across multiple files
2. **Factory Functions**: Use factory functions that return arrays of tools/commands
3. **Consistent Naming**: Use `create[PluginName]Tools()` and `create[PluginName]Commands()`
4. **Plugin ID Prefix**: Tools should be prefixed with plugin ID (e.g., `git-sync:status`)
5. **No Backward Compatibility Exports**: New code should use the factory functions directly

### Feature Plugin Pattern

Feature plugins add functionality to the system. See `git-sync` for a complete example:

```typescript
import { BasePlugin, validatePluginConfig, toolInput } from "@brains/utils";

export class BackupPlugin extends BasePlugin<BackupConfig> {
  private backupService?: BackupService;

  constructor(config: unknown) {
    const validatedConfig = validatePluginConfig(
      backupConfigSchema,
      config,
      "backup",
    );

    super(
      "backup",
      "Backup Plugin",
      "Automated backup system",
      validatedConfig,
    );
  }

  protected override async onRegister(context: PluginContext): Promise<void> {
    const { entityService, logger } = context;

    this.backupService = new BackupService({
      entityService,
      logger: logger.child("backup"),
      destination: this.config.destination,
    });

    if (this.config.autoBackup) {
      this.backupService.startScheduled(this.config.interval);
    }
  }

  protected override async getTools(): Promise<PluginTool[]> {
    return [
      this.createTool(
        "backup",
        "Create a backup of all entities",
        toolInput().boolean("compress", true).build(),
        async (input) => {
          const result = await this.backupService!.createBackup(input);
          return { success: true, path: result.path };
        },
      ),
    ];
  }

  protected override async onShutdown(): Promise<void> {
    this.backupService?.stop();
  }
}
```

### Content Generation Plugin Pattern

Content plugins generate and manage content. See `webserver-plugin` for a complete example:

```typescript
import { ContentGeneratingPlugin } from "@brains/utils";

export class DocumentPlugin extends ContentGeneratingPlugin<DocumentConfig> {
  protected override async onRegister(context: PluginContext): Promise<void> {
    // Register content types
    this.registerContentType("report", {
      contentType: "report",
      schema: reportSchema,
      formatter: new ReportFormatter(),
    });

    this.registerContentType("summary", {
      contentType: "summary",
      schema: summarySchema,
    });
  }

  // Parent class automatically provides:
  // - document:generate_report
  // - document:generate_summary
  // - document:list_generated
  // - document:get_generated
  // - document:save_generated
}
```

### Entity Processing Plugin Pattern

Plugins that process entities using the new base class:

```typescript
import { BasePlugin, toolInput } from "@brains/utils";

export class AnalyzerPlugin extends BasePlugin<AnalyzerConfig> {
  private entityService?: EntityService;

  protected override async onRegister(context: PluginContext): Promise<void> {
    this.entityService = context.entityService;
  }

  protected override async getTools(): Promise<PluginTool[]> {
    return [
      this.createTool(
        "analyze_entities",
        "Analyze entities and generate insights",
        toolInput()
          .string("entityType")
          .optionalString("filter")
          .boolean("detailed", false)
          .build(),
        async (input) => {
          const entities = await this.entityService!.search({
            entityType: input.entityType,
            query: input.filter,
          });

          const analysis = {
            total: entities.length,
            byType: {} as Record<string, number>,
            insights: [] as string[],
          };

          for (const entity of entities) {
            this.debug(`Analyzing entity ${entity.id}`);

            // Perform analysis
            analysis.byType[entity.entityType] =
              (analysis.byType[entity.entityType] || 0) + 1;
          }

          return analysis;
        },
      ),
    ];
  }
}
```

### Event-Driven Plugin Pattern

Plugins that respond to system events:

```typescript
import { BasePlugin } from "@brains/utils";

export class MonitorPlugin extends BasePlugin<MonitorConfig> {
  private unsubscribers: Array<() => void> = [];

  protected override async onRegister(context: PluginContext): Promise<void> {
    const { messageBus } = context;

    // Subscribe to multiple events
    this.unsubscribers.push(
      messageBus.subscribe("entity:created", async (message) => {
        this.info("Entity created", { id: message.payload.id });
        await this.handleEntityCreated(message.payload);
      }),

      messageBus.subscribe("entity:updated", async (message) => {
        this.debug("Entity updated", { id: message.payload.id });
        await this.handleEntityUpdated(message.payload);
      }),
    );

    // Publish custom events
    messageBus.publish({
      type: "monitor:started",
      payload: { pluginId: this.id },
    });
  }

  protected override async onShutdown(): Promise<void> {
    // Clean up all subscriptions
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
  }

  private async handleEntityCreated(payload: any): Promise<void> {
    // Handle the event
  }

  private async handleEntityUpdated(payload: any): Promise<void> {
    // Handle the event
  }
}
```

## Tool Execution and Progress

### Plugin-Specific Message Types

Since the MCP refactoring, plugins now use plugin-specific message types for tool execution. This prevents conflicts when multiple plugins register tools.

```typescript
// BasePlugin automatically subscribes to plugin-specific messages
// The subscription happens in setupMessageHandlers() during registration

// Message types follow this pattern:
// - Tool execution: `plugin:${pluginId}:tool:execute`
// - Progress updates: `plugin:${pluginId}:progress`
// - Resource fetching: `plugin:${pluginId}:resource:get`
```

### Progress Callback Support

Tools can now report progress for long-running operations:

```typescript
export interface PluginTool {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: (
    input: unknown,
    context?: {
      progressToken?: string | number;
      sendProgress?: (notification: ProgressNotification) => Promise<void>;
    },
  ) => Promise<unknown>;
  visibility?: ToolVisibility;
}

// Example tool with progress reporting
protected async getTools(): Promise<PluginTool[]> {
  return [
    {
      name: "generate-site",
      description: "Generate static site",
      inputSchema: {
        environment: z.enum(["preview", "production"]),
      },
      handler: async (input, context) => {
        const { environment } = input as { environment: string };

        // Report progress if supported
        if (context?.sendProgress) {
          await context.sendProgress({
            progress: 0,
            total: 100,
            message: "Starting site generation...",
          });
        }

        // Do work...

        if (context?.sendProgress) {
          await context.sendProgress({
            progress: 50,
            total: 100,
            message: "Building pages...",
          });
        }

        // More work...

        return { success: true, pagesBuilt: 10 };
      },
    },
  ];
}
```

### Message Flow

1. **MCP Interface** receives tool execution request
2. **MCP Interface** sends `plugin:${pluginId}:tool:execute` message
3. **BasePlugin** handles the message and executes the tool
4. If progress is supported, **Plugin** sends `plugin:${pluginId}:progress` messages
5. **MCP Interface** forwards progress to the MCP client

## Best Practices

1. **Configuration**: Always validate configuration with Zod schemas
2. **Error Handling**: Provide meaningful error messages for users
3. **Testing**: Use the plugin test utilities for comprehensive testing
4. **Logging**: Use the provided logger with appropriate log levels
5. **Cleanup**: Implement shutdown() to clean up resources
6. **Type Safety**: Leverage TypeScript's type system fully
7. **Documentation**: Document your plugin's configuration and tools
8. **Progress Reporting**: Use progress callbacks for long-running operations
9. **Message Isolation**: Trust that BasePlugin handles message routing
