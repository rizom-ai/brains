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

## Plugin Registration

### Registering a Plugin

Plugins are registered with the plugin manager:

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

## MCP Tool Registration

Plugins always register their functionality as MCP tools and resources:

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

Here's how a feature plugin like Git Sync works:

```typescript
// packages/git-sync/src/gitSyncPlugin.ts
export class GitSyncPlugin implements Plugin {
  id = "git-sync";
  version = "1.0.0";
  
  register(context: PluginContext): PluginLifecycle {
    const gitSync = new GitSync({
      entityService: context.entityService,
      logger: context.logger,
    });
    
    // Register MCP tools
    context.mcpServer.addTool({
      name: "git_sync",
      description: "Synchronize brain with git repository",
      inputSchema: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["sync", "pull", "push", "status"]
          }
        }
      },
      handler: async (input) => {
        return await gitSync[input.operation]();
      }
    });
    
    // Register commands
    context.brainProtocol.registerCommand("sync", () => gitSync.syncAll());
    context.brainProtocol.registerCommand("sync:status", () => gitSync.getStatus());
    
    return {
      onInitialize: () => gitSync.initialize(),
      onShutdown: () => gitSync.shutdown(),
    };
  }
}
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
