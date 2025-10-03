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

Plugins receive a typed context object based on their plugin type:

### CorePluginContext

```typescript
interface CorePluginContext {
  shell: Shell;
  entityService: IEntityService;
  aiService: IAIService;
  messageBus: IMessageBus;
  commandRegistry: ICommandRegistry;
  mcpService: IMCPService;
  jobQueue: IJobQueueService;
  contentService: IContentService;
  conversationService: IConversationService;
  identityService: IIdentityService;
  permissionService: IPermissionService;
  embeddingService: IEmbeddingService;
  datasourceRegistry: IDatasourceRegistry;
  templateRegistry: ITemplateRegistry;
  logger: Logger;
}
```

### ServicePluginContext

```typescript
interface ServicePluginContext extends CorePluginContext {
  serviceRegistry: IServiceRegistry;
}
```

### InterfacePluginContext

```typescript
interface InterfacePluginContext extends CorePluginContext {
  daemonRegistry: IDaemonRegistry;
  renderService: IRenderService;
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

## Best Practices

1. **Use typed schemas**: Always define Zod schemas for tool inputs/outputs
2. **Handle errors gracefully**: Don't let plugin errors crash the shell
3. **Document tools clearly**: Tool descriptions are shown to users and AI
4. **Keep tools focused**: Each tool should do one thing well
5. **Use direct registration**: Register capabilities directly, not via events
6. **Test with harnesses**: Use the provided test harnesses for consistency

## Next Steps

See [plugin-development-patterns.md](./plugin-development-patterns.md) for detailed examples and patterns.
