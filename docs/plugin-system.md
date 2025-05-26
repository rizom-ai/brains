# Plugin System

The plugin system is a core architectural feature of the Personal Brain application. It provides a flexible mechanism for extending the application with new functionality through contexts and features.

## Plugin Types

### Context Plugins

Domain-specific plugins that add new entity types and related functionality:

- **Note Context**: Notes, journaling, documentation
- **Task Context**: Tasks, todos, project management
- **Profile Context**: People, contacts, relationships

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

All plugins must implement a standard interface:

```typescript
export interface Plugin {
  // Unique identifier for the plugin
  id: string;

  // Version of the plugin
  version: string;

  // Other plugins this plugin depends on
  dependencies?: string[];

  // Register plugin components and hooks
  register(context: PluginContext): PluginLifecycle;
}

// Lifecycle hooks for plugin initialization and cleanup
export interface PluginLifecycle {
  // Called when the plugin is initialized
  onInitialize?(): Promise<void> | void;

  // Called when the plugin is being shut down
  onShutdown?(): Promise<void> | void;

  // Called when the application is ready
  onReady?(): Promise<void> | void;

  // Called when a dependency plugin is initialized
  onDependencyInitialized?(dependencyId: string): Promise<void> | void;
}

// Context provided to plugins during registration
export interface PluginContext {
  // Component registry for services
  registry: Registry;

  // Entity registry for registering entity types
  entityRegistry: EntityRegistry;

  // Message bus for communication
  messageBus: MessageBus;

  // Brain protocol for registering commands
  brainProtocol: BrainProtocol;

  // MCP server for registering tools and resources
  mcpServer: McpServer;

  // Entity service for data operations
  entityService: EntityService;

  // Logger for plugin-specific logging
  logger: Logger;

  // Tool registry for registering tools
  toolRegistry: ToolRegistry;

  // Logger instance
  logger: Logger;

  // Configuration
  config: ConfigurationManager;
}
```

### Context Plugins

Context plugins represent major functional domains in the application:

```typescript
export interface ContextPlugin extends Plugin {
  // Context-specific configuration
  contextConfig?: Record<string, unknown>;

  // Context type identifier
  contextType: string;
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

  // Shut down all plugins in reverse dependency order
  async shutdownPlugins(): Promise<void>;

  // Get a registered plugin by ID
  getPlugin(id: string): Plugin | undefined;

  // Check if a plugin is registered
  hasPlugin(id: string): boolean;

  // Check if a plugin is initialized
  isPluginInitialized(id: string): boolean;

  // Get all registered plugins
  getAllPlugins(): Plugin[];
}
```

## Plugin Configuration

### Astro-like Configuration Pattern

Plugins are configured declaratively when creating the Shell instance, following an Astro-like pattern:

```typescript
const shell = Shell.getInstance({
  database: {
    url: "file:./brain.db",
  },
  ai: {
    provider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  plugins: [
    // Git sync plugin for version control
    gitSync({
      repoPath: "./brain-repo",
      branch: "main",
      autoSync: false,
    }),

    // Note context plugin
    noteContext({
      defaultFormat: "markdown",
      enableAutoTags: true,
    }),

    // Task context plugin
    taskContext({
      defaultPriority: "medium",
    }),
  ],
});
```

### Plugin Initialization Order

Plugins are **not** initialized in the order they appear in the configuration. Instead:

1. **Dependency Resolution**: The PluginManager analyzes plugin dependencies
2. **Topological Sort**: Plugins are sorted so dependencies are initialized first
3. **Parallel Initialization**: Plugins with no interdependencies can initialize in parallel
4. **Graceful Failure**: If a plugin fails, others continue to initialize

This ensures robust initialization regardless of configuration order.

### Error Handling During Initialization

Plugin initialization follows a graceful degradation model:

```typescript
// Shell continues to function even if some plugins fail
await shell.initialize();

// Check which plugins failed
const failedPlugins = shell.getPluginManager().getFailedPlugins();
if (failedPlugins.length > 0) {
  console.warn("Some plugins failed to initialize:", failedPlugins);
}
```

Benefits:

- Shell remains functional even if optional plugins fail
- Clear error messages help diagnose issues
- Development is easier (can work with partial functionality)
- Production systems are more resilient

### MCP Server Configuration

The MCP server is **not** configured as a plugin. It's a core component that:

- Is always available (not optional)
- Is created and managed internally by the Shell
- Provides the `mcpServer` in the plugin context
- Cannot be disabled or replaced

Future MCP configuration options might include:

```typescript
const shell = Shell.getInstance({
  // ... other config ...
  mcp: {
    transport: "stdio", // or "http" in future
    port: 3000, // for HTTP transport
  },
});
```

## Plugin Registration

### Manual Plugin Registration (Legacy)

While the Astro-like configuration is preferred, plugins can still be registered manually:

```typescript
// packages/note-context/src/index.ts
import type { Plugin, PluginContext } from "@brains/shell";
import { noteSchema, NoteAdapter } from "./entity/noteEntity";
import { NoteService } from "./services/noteService";
import { NoteTools } from "./tools/noteTools";
import { NoteMessageHandlers } from "./messaging/noteMessageHandlers";

// Create note context plugin
const noteContext: ContextPlugin = {
  id: "note-context",
  version: "1.0.0",
  contextType: "note",
  dependencies: ["core"],

  register({ registry, entityRegistry, messageBus, toolRegistry, logger }) {
    // Register services
    registry.register("noteService", () => new NoteService());

    // Register entity type
    entityRegistry.registerEntityType("note", noteSchema, new NoteAdapter());

    // Register message handlers
    messageBus.registerHandlers(NoteMessageHandlers);

    // Register tools
    toolRegistry.registerTools(NoteTools);

    // Return lifecycle hooks
    return {
      async onInitialize() {
        logger.info("Note context initializing");
        // Initialize note context
      },

      async onShutdown() {
        logger.info("Note context shutting down");
        // Clean up resources
      },
    };
  },
};

// Register the plugin
registerPlugin(noteContext);

// Export for direct usage
export default noteContext;
```

### Plugin Dependencies

Plugins can specify dependencies on other plugins:

```typescript
// Website context depends on note and profile contexts
const websiteContext: ContextPlugin = {
  id: "website-context",
  version: "1.0.0",
  contextType: "website",
  dependencies: ["note-context", "profile-context"],

  // Registration function
  register(context) {
    // Implementation
  },
};
```

The plugin manager ensures that dependencies are initialized in the correct order.

## Tool-First Architecture

### Design Philosophy

The Brain system follows a **tool-first architecture** where:

1. **Tools are the primary API** - All plugin functionality is exposed as tools
2. **Tools are self-describing** - Each tool has a schema, description, and handler
3. **Commands are secondary** - CLI/Matrix interfaces generate commands from tools
4. **MCP is the standard** - Model Context Protocol provides the tool interface

### Why Tools Over Commands

Traditional command-based systems have limitations:

- Commands are often stringly-typed with arbitrary argument parsing
- No standardized schema or validation
- Poor discoverability and documentation
- Difficult to integrate with external systems

Tools solve these problems:

```typescript
// Tool definition with schema
const createNoteTool = {
  name: "create_note",
  description: "Create a new note with content and tags",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Note title" },
      content: { type: "string", description: "Note content" },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Tags for categorization",
      },
    },
    required: ["title", "content"],
  },
  handler: async (input) => {
    // Type-safe, validated input
    return await noteService.createNote(input.title, input.content, input.tags);
  },
};
```

### Command Generation Pattern

Interface layers (CLI, Matrix bot) can automatically generate commands from tools:

```typescript
// In CLI interface
class CLIInterface {
  generateCommandsFromTools(tools: PluginTool[]) {
    for (const tool of tools) {
      // Convert tool name from snake_case to kebab-case for CLI
      const commandName = tool.name.replace(/_/g, "-");

      // Generate command with automatic argument parsing
      this.commander
        .command(commandName)
        .description(tool.description)
        .action(async (args) => {
          // Validate args against tool.inputSchema
          const validatedInput = validateWithSchema(args, tool.inputSchema);

          // Execute tool handler
          const result = await tool.handler(validatedInput);

          // Format output for CLI
          console.log(formatOutput(result));
        });
    }
  }
}

// In Matrix interface
class MatrixInterface {
  generateCommandsFromTools(tools: PluginTool[]) {
    for (const tool of tools) {
      // Register Matrix command
      this.registerCommand(tool.name, async (roomId, args) => {
        // Parse Matrix message into tool input
        const input = parseMatrixArgs(args, tool.inputSchema);

        // Execute tool
        const result = await tool.handler(input);

        // Send formatted response to Matrix room
        await this.sendMessage(roomId, formatMatrixResponse(result));
      });
    }
  }
}
```

Benefits of this approach:

1. **Single source of truth** - Tool definition drives all interfaces
2. **Consistent validation** - Schema validation everywhere
3. **Better documentation** - Tools are self-documenting
4. **Easier testing** - Test tools directly without command parsing
5. **External integration** - MCP clients can discover and use tools

### Migration Path

For existing command-based code:

1. **Keep existing commands working** - Don't break compatibility
2. **Implement tools alongside** - Add tool definitions that mirror commands
3. **Deprecate command registration** - Mark direct command registration as legacy
4. **Auto-generate commands** - Switch to generating commands from tools
5. **Remove legacy code** - Once all commands are generated from tools

## MCP Tool Registration

Plugins register their functionality as MCP tools and resources:

```typescript
// Define note tools
export const NoteTools = [
  {
    name: "create-note",
    description: "Create a new note",
    schema: createNoteSchema,
    handler: async (args, context) => {
      const noteService = context.registry.resolve<NoteService>("noteService");
      return noteService.createNote(args.title, args.content, args.tags);
    },
  },
  {
    name: "list-notes",
    description: "List all notes",
    schema: listNotesSchema,
    handler: async (args, context) => {
      const noteService = context.registry.resolve<NoteService>("noteService");
      return noteService.listNotes(args.limit, args.offset);
    },
  },
  // Additional tools...
];

// Register tools in plugin
toolRegistry.registerTools(NoteTools);
```

## Message Handling

Plugins can register message handlers to process messages:

```typescript
// Define note message handlers
export const NoteMessageHandlers = {
  "note.create": async (message, context) => {
    const noteService = context.registry.resolve<NoteService>("noteService");
    const { title, content, tags } = message.payload;
    const note = await noteService.createNote(title, content, tags);
    return {
      success: true,
      data: note,
    };
  },
  "note.list": async (message, context) => {
    const noteService = context.registry.resolve<NoteService>("noteService");
    const { limit, offset } = message.payload;
    const notes = await noteService.listNotes(limit, offset);
    return {
      success: true,
      data: notes,
    };
  },
  // Additional handlers...
};

// Register message handlers in plugin
messageBus.registerHandlers(NoteMessageHandlers);
```

## Plugin Lifecycle

The plugin manager manages the lifecycle of all plugins:

1. **Registration**: Plugins register themselves with the plugin manager
2. **Dependency Resolution**: The plugin manager resolves dependencies
3. **Initialization**: Plugins are initialized in dependency order
4. **Application Ready**: The `onReady` hook is called for all plugins
5. **Shutdown**: Plugins are shut down in reverse dependency order

```
┌─────────────────────────────────────────────────────────┐
│                  Plugin Lifecycle                       │
│                                                         │
│  Registration → Dependency → Initialization → Ready     │
│                Resolution                               │
│                                                         │
│                          ↑                              │
│                          │                              │
│                      Shutdown                           │
└─────────────────────────────────────────────────────────┘
```

## Feature Plugin Example

Here's how a feature plugin like Git Sync follows the tool-first approach:

```typescript
// packages/git-sync/src/gitSyncPlugin.ts
export class GitSyncPlugin implements Plugin {
  id = "git-sync";
  version = "1.0.0";

  async register(context: PluginContext): Promise<PluginCapabilities> {
    const gitSync = new GitSync({
      entityService: context.entityService,
      logger: context.logger,
    });

    // Initialize git repository
    await gitSync.initialize();

    // Define tools - the ONLY way to expose functionality
    const tools: PluginTool[] = [
      {
        name: "git_sync",
        description: "Synchronize all entities with git repository",
        inputSchema: {
          type: "object",
          properties: {},
        },
        handler: async () => {
          await gitSync.sync();
          return { message: "Sync completed successfully" };
        },
      },
      {
        name: "git_sync_pull",
        description: "Pull entities from git repository",
        inputSchema: {
          type: "object",
          properties: {},
        },
        handler: async () => {
          const imported = await gitSync.importFromGit();
          return {
            message: `Imported ${imported.length} entities from git`,
            entities: imported,
          };
        },
      },
      {
        name: "git_sync_push",
        description: "Push entities to git repository",
        inputSchema: {
          type: "object",
          properties: {},
        },
        handler: async () => {
          const exported = await gitSync.exportToGit();
          return {
            message: `Exported ${exported.length} entities to git`,
            entities: exported,
          };
        },
      },
      {
        name: "git_sync_status",
        description: "Get git repository status",
        inputSchema: {
          type: "object",
          properties: {},
        },
        handler: async () => {
          const status = await gitSync.getStatus();
          return status;
        },
      },
    ];

    // Return plugin capabilities - tools only, no commands!
    return {
      tools,
      resources: [], // No resources for this plugin
    };
  }
}

// Usage: Interface layers generate commands from these tools
// CLI: `brain git-sync`, `brain git-sync-pull`, etc.
// Matrix: `!git_sync`, `!git_sync_pull`, etc.
```

## Interface Plugin Example

Here's how the web server plugin provides HTTP access:

```typescript
// packages/web-server/src/webServerPlugin.ts
export class WebServerPlugin implements Plugin {
  id = "web-server";
  version = "1.0.0";

  private server?: Server;

  register(context: PluginContext): PluginLifecycle {
    return {
      onInitialize: async () => {
        this.server = Bun.serve({
          port: 3000,
          fetch: (req) => this.handleRequest(req, context),
        });

        // Set up WebSocket for real-time updates
        context.messageBus.on("entity.*", (event) => {
          this.broadcast(event);
        });
      },

      onShutdown: () => this.server?.stop(),
    };
  }

  private async handleRequest(req: Request, context: PluginContext) {
    const url = new URL(req.url);

    // REST API endpoints
    if (url.pathname.startsWith("/api/")) {
      return this.handleAPI(req, context);
    }

    // MCP over HTTP
    if (url.pathname === "/mcp") {
      return this.handleMCPOverHTTP(req, context.mcpServer);
    }

    // Serve web UI
    return new Response("Brain Web UI", {
      headers: { "Content-Type": "text/html" },
    });
  }

  private async handleAPI(req: Request, context: PluginContext) {
    const url = new URL(req.url);

    // Direct access to entity service for performance
    if (url.pathname === "/api/entities" && req.method === "GET") {
      const entities = await context.entityService.searchEntities("");
      return Response.json({ entities });
    }

    if (url.pathname === "/api/query" && req.method === "POST") {
      const { query } = await req.json();
      const result = await context.queryProcessor.processQuery(query);
      return Response.json(result);
    }

    return new Response("Not Found", { status: 404 });
  }
}
```

Benefits of interface plugins:

- Direct access to core services for better performance
- Can implement protocols that MCP doesn't support
- Real-time features via WebSockets
- Custom authentication and authorization
- Serve static files and web UIs

## Plugin Configuration

Plugins can be configured through the configuration manager:

```typescript
// Plugin-specific configuration
export const noteContextConfigSchema = z.object({
  defaultFormat: z.enum(["markdown", "text", "html"]).default("markdown"),
  maxNoteLength: z.number().positive().default(10000),
  enableAutoTags: z.boolean().default(true),
});

export type NoteContextConfig = z.infer<typeof noteContextConfigSchema>;

// Accessing configuration in plugin
const config =
  context.config.getPluginConfig<NoteContextConfig>("note-context");
```

## Error Handling

Plugins should handle errors gracefully and not affect the stability of the application:

```typescript
try {
  // Plugin operation
} catch (error) {
  context.logger.error(`Error in note-context plugin: ${error.message}`, {
    pluginId: "note-context",
    operation: "createNote",
    error,
  });

  return {
    success: false,
    error: {
      code: "NOTE_CREATION_FAILED",
      message: "Failed to create note",
      details: error.message,
    },
  };
}
```

## Testing Plugins

Plugins should be tested in isolation:

```typescript
// Testing a plugin
describe("Note Context Plugin", () => {
  let pluginContext: MockPluginContext;
  let plugin: ContextPlugin;

  beforeEach(() => {
    // Create mock plugin context
    pluginContext = createMockPluginContext();

    // Create plugin instance
    plugin = createNoteContextPlugin();
  });

  test("should register note entity type", () => {
    // Register plugin
    plugin.register(pluginContext);

    // Verify entity registration
    expect(
      pluginContext.entityRegistry.registerEntityType,
    ).toHaveBeenCalledWith("note", expect.any(Object), expect.any(Object));
  });

  test("should register note tools", () => {
    // Register plugin
    plugin.register(pluginContext);

    // Verify tool registration
    expect(pluginContext.toolRegistry.registerTools).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: "create-note" }),
        expect.objectContaining({ name: "list-notes" }),
      ]),
    );
  });

  // Additional tests...
});
```

## Best Practices

1. **Keep Plugins Focused**: Each plugin should have a clear, focused responsibility.
2. **Declare Dependencies Explicitly**: Always declare dependencies on other plugins.
3. **Handle Errors Gracefully**: Catch and log errors within plugins.
4. **Clean Up Resources**: Use the onShutdown hook to clean up resources.
5. **Use Schema Validation**: Validate all input and output data with schemas.
6. **Leverage the Registry**: Use the registry to access and provide services.
7. **Test in Isolation**: Test plugins with mock dependencies.
8. **Document Plugin Capabilities**: Clearly document what your plugin provides.
