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
import type { 
  Plugin, 
  PluginTool,
  ServicePluginContext,
  CorePluginContext,
  InterfacePluginContext 
} from "@brains/plugins";
import { ServicePlugin, CorePlugin, InterfacePlugin } from "@brains/plugins";
import { myPluginConfigSchema, type MyPluginConfig } from "./config";
import packageJson from "../package.json";

export class MyPlugin extends ServicePlugin<MyPluginConfig> {
  private myService?: MyService;

  constructor(config: unknown) {
    super(
      "my-plugin",
      packageJson,
      config,
      myPluginConfigSchema,
      {} // default config values
    );
  }

  // Lifecycle: Initialize plugin
  protected override async onRegister(context: ServicePluginContext): Promise<void> {
    // Initialize services
    this.myService = new MyService({
      apiKey: this.config.apiKey,
      logger: this.logger.child("MyService"),
    });

    // Register entity types if needed
    context.registerEntityType("my-entity", myEntitySchema, myEntityAdapter);

    this.logger.info("Plugin initialized successfully");
  }

  // Define plugin tools
  protected override async getTools(): Promise<PluginTool[]> {
    return [
      {
        name: `${this.id}:fetch_data`,
        description: "Fetch data from service",
        inputSchema: {}, // Empty object for no parameters
        visibility: "public",
        handler: async (): Promise<{ data: string }> => {
          if (!this.myService) {
            throw new Error("Service not initialized");
          }
          const data = await this.myService.fetchData();
          return { data };
        },
      },
    ];
  }

  // Lifecycle: Cleanup (optional)
  protected override async onShutdown(): Promise<void> {
    this.myService?.disconnect();
    this.logger.info("Plugin shutdown complete");
  }
}
```

### Plugin Types

The plugin system provides three main plugin types:

1. **CorePlugin**: For system-level functionality (query processing, job monitoring)
2. **ServicePlugin**: For feature plugins that provide services (most common)
3. **InterfacePlugin**: For user interfaces (CLI, Matrix, MCP, WebServer)

### ServicePlugin Example

The `ServicePlugin` is the most common base class for feature plugins:

- Content type registration
- Generated content management
- Automatic tool creation for content generation

```typescript
import type { ServicePluginContext, PluginTool, Template } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { blogConfigSchema, type BlogConfig } from "./config";
import { BlogFormatter } from "./formatters/blog-formatter";
import { blogTemplate } from "./templates/blog";
import packageJson from "../package.json";

export class BlogPlugin extends ServicePlugin<BlogConfig> {
  constructor(config: unknown) {
    super(
      "blog",
      packageJson,
      config,
      blogConfigSchema,
      { /* default config */ }
    );
  }

  protected override async onRegister(context: ServicePluginContext): Promise<void> {
    // Register templates for rendering
    context.registerTemplates({
      blog: blogTemplate,
      "blog-list": blogListTemplate,
    });

    // Register routes if needed
    context.registerRoutes([
      {
        id: "blog",
        path: "/blog",
        title: "Blog",
        description: "Blog posts",
        sections: [
          {
            id: "main",
            template: "blog-list",
          },
        ],
      },
    ]);

    this.logger.info("Blog plugin initialized");
  }

  protected override async getTools(): Promise<PluginTool[]> {
    return createBlogTools(this, this.id);
  }

  protected override async getCommands(): Promise<Command[]> {
    return createBlogCommands(this, this.id);
  }
}
```

### InterfacePlugin Example

Interface plugins handle user interactions:

```typescript
import { InterfacePlugin } from "@brains/plugins";
import type { InterfacePluginContext } from "@brains/plugins";

export class CLIInterfacePlugin extends InterfacePlugin<CLIConfig> {
  protected override async onRegister(context: InterfacePluginContext): Promise<void> {
    // Access query method from context
    const response = await context.query("What is the weather?");
    console.log(response);
  }
}

## Plugin Configuration

### Configuration Schema Pattern

All plugins must define their configuration using Zod schemas and validate it in the constructor:

```typescript
// config.ts
import { z } from "zod";

// Define schema using Zod directly
export const myPluginConfigSchema = z.object({
  apiKey: z.string().describe("API key for the service"),
  endpoint: z.string().optional().describe("API endpoint URL"),
  timeout: z.number().min(0).max(30000).default(5000)
    .describe("Request timeout in milliseconds"),
  environment: z.enum(["dev", "staging", "prod"]).default("prod")
    .describe("Target environment"),
  allowedDomains: z.array(z.string()).default([])
    .describe("List of allowed domains"),
  debug: z.boolean().default(false).describe("Enable debug logging"),
});

// Export types
export type MyPluginConfig = z.infer<typeof myPluginConfigSchema>;
export type MyPluginConfigInput = z.input<typeof myPluginConfigSchema>;

// Export default config values
export const MY_PLUGIN_CONFIG_DEFAULTS: Partial<MyPluginConfig> = {
  timeout: 5000,
  environment: "prod",
  allowedDomains: [],
  debug: false,
};
```

### Tool Input Schemas

Define tool parameters using Zod schemas directly:

```typescript
import { z } from "zod";

// Simple tool with basic inputs
const searchToolInput = {
  query: z.string().describe("Search query"),
  limit: z.number().optional().describe("Maximum results"),
  includeMetadata: z.boolean().default(false).describe("Include metadata"),
};

// Complex tool with enum and custom validation
const exportToolInput = {
  format: z.enum(["json", "csv", "xml"]).describe("Export format"),
  filename: z.string().optional().describe("Output filename"),
  options: z.object({
    headers: z.boolean().default(true),
    compress: z.boolean().default(false),
  }).optional().describe("Export options"),
};
```

## Plugin Lifecycle

Plugins follow a well-defined lifecycle managed by the base classes:

### 1. Construction Phase

```typescript
constructor(config: unknown) {
  // Call parent constructor with all required parameters
  super(
    "plugin-id",
    packageJson,          // Pass package.json for version info
    config,               // Raw config to be validated
    myPluginConfigSchema, // Zod schema for validation
    CONFIG_DEFAULTS       // Default values
  );

  // Do NOT initialize services here - wait for onRegister
}
```

### 2. Registration Phase

```typescript
protected override async onRegister(context: ServicePluginContext): Promise<void> {
  // Initialize plugin services
  this.myService = new MyService({ 
    logger: this.logger.child("MyService") 
  });

  // Register entity types
  context.registerEntityType("my-entity", myEntitySchema, myEntityAdapter);

  // Register templates
  context.registerTemplates({
    "my-template": myTemplate,
  });

  // Register job handlers
  context.registerJobHandler("my-job", new MyJobHandler());
}
```

### 3. Active Phase

During this phase, the plugin's tools are available and can be called:

- Tools are accessed via `plugin-id:tool-name`
- Logging is available via `this.logger` (Logger instance)
- Access to configuration via `this.config`
- Access to context services via stored references

### 4. Shutdown Phase

```typescript
protected override async onShutdown(): Promise<void> {
  // Stop any running processes
  this.myService?.stop();

  // Unsubscribe from events
  this.unsubscribe?.();

  // Clean up resources
  await this.cleanup();

  this.logger.info("Plugin shutdown complete");
}
```

## Direct Service Access

### Accessing Services Through Context

Services are provided through context types specific to each plugin type:

```typescript
// ServicePlugin context
protected override async onRegister(context: ServicePluginContext): Promise<void> {
  // Available methods and services:
  context.registerEntityType(type, schema, adapter);
  context.registerTemplates(templates);
  context.registerRoutes(routes);
  context.registerJobHandler(type, handler);
  context.listRoutes();
  context.listViewTemplates();
  context.getViewTemplate(name);
  context.enqueueJob(type, data, options);
  
  // Access to services
  context.entityService;
  context.logger; // Also available as this.logger
}

// InterfacePlugin context includes query method
protected override async onRegister(context: InterfacePluginContext): Promise<void> {
  // All ServicePlugin context methods plus:
  const response = await context.query(prompt, additionalContext);
}

// CorePlugin context is minimal
protected override async onRegister(context: CorePluginContext): Promise<void> {
  // Basic context only
  context.logger;
}
```

### Available Services by Plugin Type

**CorePlugin Context**:
- `logger`: Logger instance

**ServicePlugin Context**:
- `logger`: Logger instance (also available as `this.logger`)
- `entityService`: Entity CRUD operations
- `registerEntityType()`: Register new entity types
- `registerTemplates()`: Register view templates
- `registerRoutes()`: Register routes
- `registerJobHandler()`: Register job handlers
- `enqueueJob()`: Queue jobs for processing
- `listRoutes()`: List all registered routes
- `listViewTemplates()`: List all templates
- `getViewTemplate()`: Get a specific template
- `parseContent()`: Parse content using template schema

**InterfacePlugin Context**:
- All ServicePlugin context methods
- `query()`: Execute queries (core shell operation)
- `getJobStatus()`: Get job status
- `getActiveJobs()`: List active jobs

### Service Usage Examples

```typescript
// EntityService usage (via context)
const notes = await context.entityService.search({
  entityType: "note",
  query: "meeting",
  limit: 10,
});

const note = await context.entityService.getEntity("note", "note-123");

await context.entityService.createEntity({
  entityType: "note",
  content: "New note content",
  metadata: { tags: ["important"] },
});

// Template registration
context.registerTemplates({
  "my-template": {
    name: "my-template",
    schema: myContentSchema,
    description: "My custom template",
    pluginId: this.id,
    renderers: {
      web: MyComponent,
    },
    interactive: false,
  },
});

// Job enqueueing
const jobId = await context.enqueueJob(
  "process-data",
  { entityId: "123" },
  { priority: 5 }
);
```

## Testing Patterns

### Using Plugin Test Utilities

The `@brains/plugins` package includes the unified `PluginTestHarness`:

```typescript
import { PluginTestHarness } from "@brains/plugins";
import { MyPlugin } from "./plugin";

describe("MyPlugin", () => {
  let harness: PluginTestHarness<MyPlugin>;
  
  beforeEach(() => {
    harness = new PluginTestHarness();
  });

  afterEach(() => {
    harness.cleanup();
  });

  // Test plugin lifecycle
  it("should register successfully", async () => {
    const plugin = new MyPlugin({ apiKey: "test" });
    
    await harness.installPlugin(plugin);
    
    expect(harness.getPlugin()).toBe(plugin);
    expect(harness.getCapabilities()).toBeDefined();
  });

  // Test configuration validation
  it("should validate configuration", () => {
    expect(() => new MyPlugin({})).toThrow(); // Missing required field
    expect(() => new MyPlugin({ apiKey: "test" })).not.toThrow();
  });

  // Test with mock services
  it("should interact with entity service", async () => {
    const plugin = new MyPlugin({ apiKey: "test" });
    await harness.installPlugin(plugin);

    // Create test data using mock shell
    const mockShell = harness.getMockShell();
    await mockShell.entityService.createEntity({
      entityType: "note",
      content: "Test note",
    });

    // Test plugin functionality
    const tools = await plugin.getTools();
    const tool = tools.find(t => t.name === `${plugin.id}:my-tool`);
    const result = await tool?.handler({});

    expect(result).toBeDefined();
  });
});
```

### Testing Tool Validation

```typescript
it("should validate tool input", async () => {
  const plugin = new MyPlugin({ apiKey: "test" });
  await harness.installPlugin(plugin);
  
  const tools = await plugin.getTools();
  const tool = tools.find(t => t.name === `${plugin.id}:my-tool`);
  
  // Test with valid input - should not throw
  await expect(tool?.handler({ validParam: "value" }))
    .resolves.toHaveProperty("success", true);
  
  // Test with invalid input - Zod will throw validation error
  await expect(tool?.handler({ invalidParam: 123 }))
    .rejects.toThrow();
});
```

### Testing Progress Reporting

```typescript
it("should report progress", async () => {
  const plugin = new MyPlugin({ apiKey: "test" });
  await harness.installPlugin(plugin);

  let progressCount = 0;
  const sendProgress = async (): Promise<void> => {
    progressCount++;
  };

  const tools = await plugin.getTools();
  const tool = tools.find(t => t.name.endsWith(":progress_tool"));
  
  await tool?.handler(
    { steps: 3 }, 
    { sendProgress }
  );

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
  getService: () => MyService | undefined,
  context: ServicePluginContext,
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
      handler: async (input: unknown): Promise<unknown> => {
        const service = getService();
        if (!service) {
          throw new Error("Service not initialized");
        }
        const { param } = input as { param: string };
        return service.performAction(param);
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
5. **Service Access**: Pass service getters to avoid initialization order issues
6. **Type Safety**: Properly type input and return values with `unknown`
7. **Standard Directory Structure**: Follow the established pattern:
   - `src/plugin.ts` - Main plugin class
   - `src/config.ts` - Configuration schema
   - `src/tools/index.ts` - All tools in one file
   - `src/lib/` - Business logic and services
   - `src/formatters/` - Response formatters (if needed)
   - `src/handlers/` - Job handlers (if needed)

### Feature Plugin Pattern

Feature plugins add functionality to the system. See `git-sync` or `directory-sync` for complete examples:

```typescript
import { ServicePlugin } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import { backupConfigSchema, type BackupConfig } from "./config";
import packageJson from "../package.json";

export class BackupPlugin extends ServicePlugin<BackupConfig> {
  private backupService?: BackupService;

  constructor(config: unknown) {
    super(
      "backup",
      packageJson,
      config,
      backupConfigSchema,
      {} // defaults
    );
  }

  protected override async onRegister(context: ServicePluginContext): Promise<void> {
    this.backupService = new BackupService({
      entityService: context.entityService,
      logger: this.logger.child("BackupService"),
      destination: this.config.destination,
    });

    if (this.config.autoBackup) {
      this.backupService.startScheduled(this.config.interval);
    }
  }

  protected override async getTools(): Promise<PluginTool[]> {
    return createBackupTools(
      () => this.backupService,
      this.context!,
      this.id
    );
  }

  protected override async onShutdown(): Promise<void> {
    this.backupService?.stop();
  }
}
```

### Site Builder Plugin Pattern

The site-builder plugin shows how to handle content generation and site building:

```typescript
import { ServicePlugin } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import { SiteBuilder } from "./lib/site-builder";
import { SiteContentService } from "./lib/site-content-service";

export class SiteBuilderPlugin extends ServicePlugin<SiteBuilderConfig> {
  private siteBuilder?: SiteBuilder;
  private siteContentService?: SiteContentService;

  protected override async onRegister(context: ServicePluginContext): Promise<void> {
    // Register entity types for content
    context.registerEntityType(
      "site-content-preview",
      siteContentPreviewSchema,
      siteContentPreviewAdapter
    );
    
    // Register templates and routes
    context.registerTemplates({ dashboard: dashboardTemplate });
    context.registerRoutes([...]);
    
    // Initialize services
    this.siteBuilder = SiteBuilder.getInstance(
      this.logger.child("SiteBuilder"),
      context
    );
    
    this.siteContentService = new SiteContentService(
      this.logger.child("SiteContentService"),
      context,
      this.id,
      this.config.siteConfig
    );
  }
}
```

### Entity Processing Plugin Pattern

Plugins that process entities:

```typescript
import { ServicePlugin } from "@brains/plugins";
import type { ServicePluginContext, IEntityService } from "@brains/plugins";

export class AnalyzerPlugin extends ServicePlugin<AnalyzerConfig> {
  private entityService?: IEntityService;

  protected override async onRegister(context: ServicePluginContext): Promise<void> {
    this.entityService = context.entityService;
  }

  protected override async getTools(): Promise<PluginTool[]> {
    return [
      {
        name: `${this.id}:analyze_entities`,
        description: "Analyze entities and generate insights",
        inputSchema: {
          entityType: z.string().describe("Entity type to analyze"),
          filter: z.string().optional().describe("Filter query"),
          detailed: z.boolean().default(false).describe("Include details"),
        },
        visibility: "public",
        handler: async (input: unknown): Promise<unknown> => {
          const { entityType, filter, detailed } = input as {
            entityType: string;
            filter?: string;
            detailed: boolean;
          };
          
          const entities = await this.entityService!.search({
            entityType,
            query: filter,
          });

          const analysis = {
            total: entities.length,
            byType: {} as Record<string, number>,
            insights: [] as string[],
          };

          for (const entity of entities) {
            this.logger.debug(`Analyzing entity ${entity.id}`);

            // Perform analysis
            analysis.byType[entity.entityType] =
              (analysis.byType[entity.entityType] || 0) + 1;
          }

          return analysis;
        },
      },
    ];
  }
}
```

### Event-Driven Plugin Pattern

For plugins that need to respond to events, you'll need to get access to the message bus through the shell:

```typescript
import { ServicePlugin } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";

export class MonitorPlugin extends ServicePlugin<MonitorConfig> {
  private unsubscribers: Array<() => void> = [];

  protected override async onRegister(context: ServicePluginContext): Promise<void> {
    // Note: Message bus access would need to be added to context
    // or accessed through a different mechanism

    // Event handling would be implemented through other mechanisms
    // such as job handlers or polling
    this.logger.info("Monitor plugin started");
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

## Tool Execution and Context

### Tool Handler Context

Tools receive an optional context parameter that provides additional capabilities:

```typescript
export interface ToolContext {
  interfaceId?: string;        // Which interface is calling
  userId?: string;             // User making the request
  channelId?: string;          // Channel/room context
  progressToken?: string | number;  // For progress tracking
  sendProgress?: (notification: ProgressNotification) => Promise<void>;
}
```

### Progress Reporting in Tools

Tools can report progress for long-running operations:

```typescript
// Example tool with progress reporting
{
  name: `${pluginId}:generate-site`,
  description: "Generate static site",
  inputSchema: {
    environment: z.enum(["preview", "production"]).describe("Target environment"),
  },
  visibility: "anchor",
  handler: async (input: unknown, context?: ToolContext): Promise<unknown> => {
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
    await buildPages();

    if (context?.sendProgress) {
      await context.sendProgress({
        progress: 50,
        total: 100,
        message: "Building pages...",
      });
    }

    // More work...
    await generateAssets();

    if (context?.sendProgress) {
      await context.sendProgress({
        progress: 100,
        total: 100,
        message: "Site generation complete!",
      });
    }

    return { success: true, pagesBuilt: 10 };
  },
}
```

### Job-Based Operations

For long-running operations, consider using the job queue:

```typescript
// In your tool handler
const jobId = await context.enqueueJob(
  "site-build",
  {
    environment: "production",
    clean: true,
  },
  {
    priority: 5,
    source: `plugin:${pluginId}`,
    metadata: {
      interfaceId: context?.interfaceId ?? "plugin",
      userId: context?.userId ?? "system",
      operationType: "site_building",
      pluginId,
    },
  }
);

return {
  status: "queued",
  jobId,
  message: "Site build job queued",
};
```

## Best Practices

1. **Configuration**: Always validate configuration with Zod schemas in the constructor
2. **Error Handling**: Provide meaningful error messages for users
3. **Testing**: Use the unified PluginTestHarness for comprehensive testing
4. **Logging**: Use `this.logger` with appropriate log levels
5. **Cleanup**: Implement onShutdown() to clean up resources
6. **Type Safety**: Leverage TypeScript's type system fully
7. **Documentation**: Document your plugin's configuration and tools
8. **Progress Reporting**: Use progress callbacks for long-running operations
9. **Directory Structure**: Follow the standard plugin directory layout
10. **Service Access**: Use getter functions to avoid initialization order issues
11. **Tool Organization**: Keep all tools in a single `tools/index.ts` file
12. **Import Consolidation**: Import everything from `@brains/plugins`
