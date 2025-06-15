# Plugin System

The plugin system is a core architectural feature of the Personal Brain application. It provides a flexible mechanism for extending the application with new functionality through a tool-first architecture.

## Overview

The plugin system follows a **tool-first architecture** where plugins expose their functionality primarily through MCP (Model Context Protocol) tools and resources. This design ensures that all plugin capabilities are accessible to AI assistants and can be composed into higher-level workflows.

## Plugin Types

### Entity Plugins

Plugins that add new entity types and related functionality:

- **Link Plugin**: Web content capture with AI summarization and tagging (first priority after cleanup)
- **Article Plugin**: Long-form content with draft/publish workflow
- **Task Plugin**: Tasks, todos, project management
- **Profile Plugin**: People, contacts, relationships
- **Note Plugin**: Extended note features beyond BaseEntity (deprioritized - BaseEntity provides core functionality)

### Feature Plugins

Cross-cutting functionality that works across all entity types:

- **Git Sync**: Version control and synchronization
- **Backup**: Export and backup functionality
- **Analytics**: Usage statistics and insights

### Interface Plugins

Alternative ways to access the brain beyond MCP:

- **Web Server**: HTTP/WebSocket API, REST endpoints, Web UI
- **GraphQL**: GraphQL API server
- **gRPC**: High-performance RPC interface

## Core Concepts

### Plugin Interface

All plugins must implement the standard Plugin interface. The framework provides base classes that implement this interface and provide common functionality:

```typescript
export interface Plugin {
  // Unique identifier for the plugin
  id: string;

  // Version of the plugin
  version: string;

  // Human-readable name
  name?: string;

  // Description of plugin functionality
  description?: string;

  // Other plugins this plugin depends on
  dependencies?: string[];

  // Register plugin components and capabilities
  register(context: PluginContext): Promise<PluginCapabilities>;

  // Optional shutdown hook for cleanup
  shutdown?(): Promise<void>;
}
```

### Base Classes

The framework provides two base classes that implement the Plugin interface:

- **BasePlugin**: Foundation for all plugins, provides configuration validation, logging, and lifecycle management
- **ContentGeneratingPlugin**: Extends BasePlugin for plugins that generate content, adds content type registration and management

See the [Plugin Development Patterns](./plugin-development-patterns.md) documentation for detailed usage.

### Plugin Capabilities

Plugins expose their functionality through tools and resources:

```typescript
export interface PluginCapabilities {
  // MCP tools exposed by the plugin
  tools: PluginTool[];

  // MCP resources exposed by the plugin
  resources: PluginResource[];
}

export interface PluginTool {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: (input: unknown) => Promise<unknown>;
}

export interface PluginResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: () => Promise<{
    contents: Array<{
      text: string;
      uri: string;
      mimeType?: string;
    }>;
  }>;
}
```

### Plugin Context

The context provided to plugins during registration:

```typescript
export interface PluginContext {
  // Component registry for services
  registry: Registry;

  // Logger for plugin-specific logging
  logger: Logger;

  // Access other plugins
  getPlugin: (id: string) => Plugin | undefined;

  // Event emitter for plugin communication
  events: EventEmitter;

  // Message bus for structured messaging
  messageBus: MessageBus;

  // Formatter registry for custom formatters
  formatters: FormatterRegistry;
}
```

### Plugin Manager

The plugin manager handles plugin registration, dependencies, and lifecycle:

```typescript
export class PluginManager {
  // Register a plugin
  registerPlugin(plugin: Plugin): void;

  // Initialize all registered plugins in dependency order
  async initializePlugins(): Promise<void>;

  // Disable a plugin
  disablePlugin(id: string): void;

  // Enable a previously disabled plugin
  async enablePlugin(id: string): Promise<void>;

  // Get a registered plugin by ID
  getPlugin(id: string): Plugin | undefined;

  // Get all registered plugins
  getAllPlugins(): Map<string, PluginState>;
}
```

## Plugin Events

The plugin manager emits events during the plugin lifecycle:

```typescript
enum PluginEvent {
  REGISTERED = "plugin:registered",
  INITIALIZED = "plugin:initialized",
  DISABLED = "plugin:disabled",
  ENABLED = "plugin:enabled",
  ERROR = "plugin:error",
  TOOL_REGISTER = "plugin:tool:register",
  RESOURCE_REGISTER = "plugin:resource:register",
}
```

## Creating a Plugin

### Using the Base Classes (Recommended)

The framework provides base classes that handle common plugin functionality:

```typescript
import { BasePlugin, validatePluginConfig, pluginConfig } from "@brains/utils";
import type { PluginContext, PluginTool } from "@brains/types";

// 1. Define configuration schema
const myPluginConfigSchema = pluginConfig()
  .requiredString("apiKey", "API key for the service")
  .build();

// 2. Create plugin class extending BasePlugin
export class MyPlugin extends BasePlugin<MyPluginConfig> {
  constructor(config: unknown) {
    const validatedConfig = validatePluginConfig(
      myPluginConfigSchema,
      config,
      "my-plugin",
    );
    super("my-plugin", "My Plugin", "A sample plugin", validatedConfig);
  }

  protected override async getTools(): Promise<PluginTool[]> {
    return [
      this.createTool(
        "my_tool",
        "Does something useful",
        { input: z.string() },
        async (input) => {
          return { result: `Processed: ${input.input}` };
        },
      ),
    ];
  }
}

// 3. Export factory function
export const myPlugin = (config: unknown) => new MyPlugin(config);
```

See [Plugin Development Patterns](./plugin-development-patterns.md) for complete examples using `BasePlugin` and `ContentGeneratingPlugin`.

### Basic Plugin Structure (Low-Level)

If you need direct control, you can implement the Plugin interface directly:

```typescript
import type { Plugin, PluginContext, PluginCapabilities } from "@brains/types";

export const myPlugin: Plugin = {
  id: "my-plugin",
  version: "1.0.0",
  name: "My Plugin",
  description: "A sample plugin",

  async register(context: PluginContext): Promise<PluginCapabilities> {
    const { logger } = context;

    logger.info("Registering My Plugin");

    return {
      tools: [
        {
          name: "my-plugin:my_tool",
          description: "Does something useful",
          inputSchema: {
            input: z.string().describe("The input to process"),
          },
          handler: async (input) => {
            // Tool implementation
            return { result: `Processed: ${input.input}` };
          },
        },
      ],
      resources: [
        {
          uri: "my-plugin://status",
          name: "My Plugin Status",
          handler: async () => ({
            contents: [
              {
                text: "Plugin is running",
                uri: "my-plugin://status",
              },
            ],
          }),
        },
      ],
    };
  },
};
```

### Entity Plugin Example

```typescript
import type { Plugin } from "@brains/types";
import { NoteAdapter } from "./adapters/noteAdapter";

export const notePlugin: Plugin = {
  id: "note-plugin",
  version: "1.0.0",
  name: "Note Plugin",
  description: "Adds note management capabilities",

  async register(context) {
    const { registry, logger } = context;

    // Register entity adapter
    const entityRegistry = registry.get("entityRegistry");
    entityRegistry.registerEntityType("note", noteSchema, new NoteAdapter());

    // Register formatters
    context.formatters.register("note", new NoteFormatter());

    return {
      tools: [createNoteTool, searchNotesTool, updateNoteTool, deleteNoteTool],
      resources: [notesListResource, noteStatsResource],
    };
  },
};
```

## Plugin Configuration

### App Configuration

Plugins are configured when creating an App instance:

```typescript
import { App } from "@brains/app";
import { gitSyncPlugin } from "@brains/git-sync";
import { notePlugin } from "@brains/note-plugin";

await App.run({
  name: "my-brain",
  version: "1.0.0",

  // Plugin configuration
  plugins: [
    // Feature plugin with configuration
    gitSyncPlugin({
      repoPath: "./brain-repo",
      branch: "main",
      autoSync: true,
      syncInterval: 300, // 5 minutes
    }),

    // Entity plugin
    notePlugin(),

    // Custom plugin
    {
      id: "custom-plugin",
      version: "1.0.0",
      register: async (context) => ({
        tools: [],
        resources: [],
      }),
    },
  ],
});
```

### Plugin Options

Plugins can accept configuration options:

```typescript
export interface GitSyncOptions {
  repoPath: string;
  remote?: string;
  branch?: string;
  autoSync?: boolean;
  syncInterval?: number;
}

export function gitSync(options: GitSyncOptions): Plugin {
  return {
    id: "git-sync",
    version: "1.0.0",
    name: "Git Sync",

    async register(context) {
      // Use options to configure the plugin
      const gitSync = new GitSync(options);

      return {
        tools: gitSync.getTools(),
        resources: gitSync.getResources(),
      };
    },
  };
}
```

## Best Practices

1. **Tool-First Design**: Expose all functionality through MCP tools and resources
2. **Clear Naming**: Use descriptive names for tools and resources with your plugin prefix
3. **Schema Validation**: Always validate inputs using Zod schemas
4. **Error Handling**: Provide clear error messages and handle edge cases
5. **Logging**: Use the provided logger for debugging and monitoring
6. **Dependencies**: Declare plugin dependencies explicitly
7. **Testing**: Write unit tests for your plugin tools and integration tests

## Plugin Examples

- **Git Sync Plugin**: See `packages/git-sync` for a complete feature plugin
- **Note Plugin**: See `docs/examples/note-plugin` for an entity plugin example
- **Custom Plugin**: See the inline plugin example in the App configuration section
