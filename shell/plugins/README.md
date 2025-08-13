# @brains/plugins

Base classes and interfaces for Personal Brain plugin development.

## Overview

This package provides the foundation for building plugins that extend Brain applications. It includes base classes for different plugin types, typed contexts, and standardized interfaces.

## Plugin Types

### CorePlugin

Base class for plugins that provide core functionality:

```typescript
import { CorePlugin } from "@brains/plugins";

export class MyPlugin extends CorePlugin {
  constructor() {
    super("my-plugin", packageJson);
  }
  
  async getTools() {
    return [
      {
        name: `${this.id}:my-tool`,
        description: "My custom tool",
        inputSchema: mySchema,
        handler: async (input) => {
          // Tool implementation
        }
      }
    ];
  }
}
```

### InterfacePlugin

Base class for plugins that provide user interfaces:

```typescript
import { InterfacePlugin } from "@brains/plugins";

export class MyInterface extends InterfacePlugin {
  createDaemon() {
    return {
      start: async () => {
        // Start interface server
      },
      stop: async () => {
        // Cleanup
      }
    };
  }
}
```

### MessageInterfacePlugin

Specialized for message-based interfaces (CLI, chat):

```typescript
import { MessageInterfacePlugin } from "@brains/plugins";

export class ChatInterface extends MessageInterfacePlugin {
  async handleMessage(message: string) {
    // Process user message
    const response = await this.executeCommand(message);
    return this.formatResponse(response);
  }
}
```

## Plugin Context

Plugins receive a typed context with all shell services:

### CorePluginContext

```typescript
interface CorePluginContext {
  shell: Shell;
  entityService: EntityService;
  aiService: AIService;
  messageBus: MessageBus;
  commandRegistry: CommandRegistry;
  mcpTransport: IMCPTransport;
  jobQueue: JobQueueService;
  contentGenerator: ContentGenerator;
  conversationService: ConversationService;
  logger: Logger;
}
```

### InterfacePluginContext

```typescript
interface InterfacePluginContext extends CorePluginContext {
  daemonRegistry: DaemonRegistry;
  viewRegistry: ViewRegistry;
}
```

## Plugin Capabilities

### Tools (MCP)

```typescript
interface PluginTool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  handler: (input: unknown, context: PluginContext) => Promise<unknown>;
}
```

### Resources (MCP)

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

Commands are auto-generated from tools for message interfaces. Additional message-only commands can be registered.

### Handlers

```typescript
interface PluginHandler {
  event: string;
  handler: (payload: unknown, context: PluginContext) => Promise<void>;
}
```

## Creating a Plugin

1. **Extend the appropriate base class**:
   - `CorePlugin` for functionality plugins
   - `InterfacePlugin` for UI plugins
   - `MessageInterfacePlugin` for chat/CLI

2. **Implement required methods**:
   - `getTools()` - Return MCP tools
   - `getResources()` - Return MCP resources
   - `getHandlers()` - Return event handlers
   - `getCommands()` - Additional commands (optional)

3. **Use the context**:
   - Access all shell services through `this.context`
   - Use `this.logger` for logging
   - Use `this.config` for plugin configuration

## Testing

Test harnesses for each plugin type:

```typescript
import { createCorePluginTestHarness } from "@brains/plugins/test";

const harness = createCorePluginTestHarness(myPlugin);
await harness.initialize();

// Test tool execution
const result = await harness.executeTool('my-tool', { input: 'data' });

// Test command execution
const response = await harness.executeCommand('/my-command', ['arg1']);
```

## Configuration

Plugins support configuration with Zod validation:

```typescript
const configSchema = z.object({
  apiKey: z.string().optional(),
  timeout: z.number().default(5000),
});

class MyPlugin extends CorePlugin<z.infer<typeof configSchema>> {
  constructor(config?: z.input<typeof configSchema>) {
    super("my-plugin", packageJson, config, configSchema);
  }
}
```

## Best Practices

1. **Use typed schemas** - Define Zod schemas for all inputs/outputs
2. **Handle errors gracefully** - Don't crash the shell
3. **Document tools clearly** - Descriptions are shown to users
4. **Keep tools focused** - One tool, one purpose
5. **Test with harnesses** - Use provided test utilities
6. **Log appropriately** - Use context.logger

## Exports

- Base classes: `CorePlugin`, `InterfacePlugin`, `MessageInterfacePlugin`
- Interfaces: `Plugin`, `PluginTool`, `PluginResource`, `PluginHandler`
- Context types: `CorePluginContext`, `InterfacePluginContext`
- Test utilities: `createCorePluginTestHarness`, etc.
- Type guards and utilities

## License

MIT