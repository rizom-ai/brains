# Plugin System

The plugin system provides a flexible mechanism for extending the Personal Brain application with new functionality through a tool-first architecture.

## Overview

The plugin system follows a **tool-first architecture** where plugins expose their functionality primarily through MCP (Model Context Protocol) tools and resources. Commands are automatically generated from tools for message-based interfaces.

## Plugin Types

### CorePlugin

Base class for plugins that provide core functionality:

- Tools and resources for MCP
- Commands for message interfaces (auto-generated from tools)
- Message handlers for async operations
- Job handlers for background processing

**Implemented Plugins:**

- SystemPlugin - System information and health checks
- DirectorySyncPlugin - Import/export entities to/from file system
- GitSyncPlugin - Sync entities with Git repositories
- LinkPlugin - Web content capture with AI extraction
- SiteBuilderPlugin - Static site generation with Preact/Tailwind
- SummaryPlugin - Content summarization and daily digests
- TopicsPlugin - AI-powered topic extraction
- PluginExamples - Example plugins demonstrating all plugin types

### ServicePlugin

Base class for plugins that provide shared services to other plugins:

- Shared functionality accessible by other plugins
- Service registration with the service registry
- Cross-plugin communication support

**Use Cases:**

- Shared data access layers
- Common utility services
- Cross-cutting concerns

### InterfacePlugin

Base class for plugins that provide user interfaces:

- Daemon support for long-running processes
- Interface-specific configuration
- Connection management

**Implemented Interfaces:**

- MCPInterface - MCP server with stdio and HTTP transports
- WebserverInterface - Static site HTTP server

### MessageInterfacePlugin

Specialized interface plugin for message-based interfaces:

- Message handling and formatting
- Conversation context management
- Command execution through message bus

**Implemented Message Interfaces:**

- CLIInterface - Interactive command-line interface using Ink
- MatrixInterface - Matrix bot integration with setup utility

## Plugin Registration

The plugin system uses **direct registration** with shell services:

1. PluginManager resolves dependencies and determines initialization order
2. Plugins receive a context object with all shell services
3. Plugins register their capabilities directly with the appropriate registries:
   - Tools → MCPService
   - Commands → CommandRegistry
   - Handlers → MessageBus
   - Daemons → DaemonRegistry

This eliminates timing issues that would occur with event-based registration.

## Plugin Context

Plugins receive a typed context object based on their plugin type. Context objects are organized into namespaces for better discoverability and maintainability.

### CorePluginContext

Base context available to all plugins with read-only operations:

```typescript
interface CorePluginContext {
  // Direct properties
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

Extended context for plugins that manage entities and background jobs:

```typescript
interface ServicePluginContext extends CorePluginContext {
  entityService: IEntityService; // Full entity service
  dataDir: string;

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

Context for plugins providing user interfaces:

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

## Plugin Capabilities

### Tools

MCP tools that can be invoked by any MCP client:

```typescript
interface PluginTool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  handler: (input: unknown, context: PluginContext) => Promise<unknown>;
}
```

### Resources

MCP resources that provide data:

```typescript
interface PluginResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: (uri: string, context: PluginContext) => Promise<ResourceContent>;
}
```

### Commands

Commands are automatically generated from tools for message interfaces. Additional message-only commands can be registered if needed.

### Handlers

Event handlers for async operations:

```typescript
interface PluginHandler {
  event: string;
  handler: (payload: unknown, context: PluginContext) => Promise<void>;
}
```

## Plugin Lifecycle

1. **Configuration**: Plugin is instantiated with configuration
2. **Registration**: Plugin's register() method is called with context
3. **Initialization**: Plugin registers all capabilities with shell services
4. **Operation**: Plugin handles requests through registered tools/commands
5. **Shutdown**: Plugin's shutdown() method is called for cleanup

## Error Handling

- Plugin failures during registration are logged but don't crash the shell
- The shell continues operating with successfully registered plugins
- Failed plugins can be queried through the plugin manager

## Testing

All plugin types have standardized test harnesses:

```typescript
// Test any CorePlugin
import { createCorePluginHarness } from "@brains/plugins/test";

const harness = createCorePluginHarness();
const plugin = new MyPlugin();
const capabilities = await harness.installPlugin(plugin);

// Execute tools
const result = await harness.executeTool("tool-name", { input: "data" });

// Test ServicePlugin
import { createServicePluginHarness } from "@brains/plugins/test";

const harness = createServicePluginHarness();
const plugin = new MyServicePlugin();
await harness.installPlugin(plugin);

// Test InterfacePlugin
import { createInterfacePluginHarness } from "@brains/plugins/test";

const harness = createInterfacePluginHarness();
const plugin = new MyInterfacePlugin();
await harness.installPlugin(plugin);
```

## Inter-Plugin Messaging Patterns

### The `system:plugins:ready` Pattern

When plugins need to communicate with other plugins via the message bus, timing is critical. Messages sent before a subscriber exists are lost. The `system:plugins:ready` pattern solves this.

**Problem**: Plugin A sends a message in `onRegister()`, but Plugin B (which subscribes to that message) hasn't been initialized yet because it has dependencies that load later.

**Solution**: Plugin A waits for `system:plugins:ready` before sending messages. This event fires after ALL plugins have registered their subscriptions.

#### Pattern Timeline

```
1. Plugin A initializes → subscribes to "system:plugins:ready"
2. Plugin B initializes → subscribes to "plugin-a:some-event"
3. Shell emits "system:plugins:ready"
4. Plugin A's callback fires → sends "plugin-a:some-event" message
5. Plugin B receives the message ✓
```

#### Widget Producer Pattern (System/Analytics plugins)

```typescript
protected override async onRegister(context: CorePluginContext): Promise<void> {
  // Subscribe to system:plugins:ready to send widgets AFTER Dashboard is listening
  context.messaging.subscribe("system:plugins:ready", async () => {
    await context.messaging.send("dashboard:register-widget", {
      id: "my-widget",
      pluginId: this.id,
      title: "My Widget",
      section: "primary",
      priority: 10,
      rendererName: "StatsWidget",
      dataProvider: async () => ({ value: 42 }),
    });
    return { success: true };
  });
}
```

#### Widget Consumer Pattern (Dashboard plugin)

```typescript
protected override async onRegister(context: ServicePluginContext): Promise<void> {
  // Subscribe in onRegister - this runs BEFORE system:plugins:ready
  context.messaging.subscribe("dashboard:register-widget", async (message) => {
    const widget = parseWidget(message.payload);
    this.widgetRegistry.register(widget);
    return { success: true };
  });
}
```

### When to Use This Pattern

Use `system:plugins:ready` when:

1. Your plugin sends messages that other plugins need to receive
2. The receiving plugin might have dependencies that cause it to initialize later
3. Lost messages would cause functionality to silently fail

Examples:

- Dashboard widget registration
- Route registration with site-builder
- Service discovery notifications

### When NOT to Use This Pattern

Don't use `system:plugins:ready` when:

1. You're responding to user actions (timing not an issue)
2. The message is a request/response that will retry on failure
3. You're subscribing to events (subscribers should be ready before events fire)

## Best Practices

1. **Use typed schemas**: Always define Zod schemas for tool inputs/outputs
2. **Handle errors gracefully**: Don't let plugin errors crash the shell
3. **Document tools clearly**: Tool descriptions are shown to users and AI
4. **Keep tools focused**: Each tool should do one thing well
5. **Use direct registration**: Register capabilities directly, not via events
6. **Test with harnesses**: Use the provided test harnesses for consistency
7. **Use system:plugins:ready for cross-plugin messages**: When sending messages that other plugins need to receive, wait for `system:plugins:ready` to ensure all subscribers are registered

## Next Steps

See [plugin-development-patterns.md](./plugin-development-patterns.md) for detailed examples and patterns.
