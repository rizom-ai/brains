# Plugin Context Redesign - Final Plan

## Overview

This plan consolidates and replaces previous plugin context redesign proposals. Based on analysis of existing plugins and their actual needs, we've identified three plugin types with clear access boundaries. This refactoring reorganizes existing functionality without introducing new concepts.

## Plugin Types by Access Level

### 1. **Core Plugin** - Basic functionality

**Examples**: git-sync  
**Access**: Commands, tools, messaging  
**Cannot**: Access entities or system-wide data

### 2. **Entity Plugin** - Data management

**Examples**: directory-sync, site-builder  
**Access**: Everything from Core + EntityService  
**Cannot**: Access system-wide commands or other plugins

### 3. **Interface Plugin** - User interfaces

**Examples**: cli, matrix, mcp, webserver  
**Access**: Everything from Core + System-wide access  
**Cannot**: Direct entity access (use commands instead)

## Context Interfaces

### Core Plugin Context

```typescript
interface CorePluginContext {
  // Identity
  readonly pluginId: string;
  readonly logger: Logger;

  // Command registration
  registerCommand(command: {
    name: string;
    description: string;
    parameters?: Record<string, ParamDef>;
    handler: (params: any) => string | Promise<string>;
  }): void;

  // Tool registration (for MCP)
  registerTool(tool: {
    name: string;
    description: string;
    inputSchema: ZodSchema;
    handler: (input: any) => Promise<any>;
  }): void;

  // Inter-plugin messaging
  sendMessage: MessageSender;
  subscribe: (channel: string, handler: MessageHandler) => () => void;
}
```

### Entity Plugin Context

```typescript
interface EntityPluginContext extends CorePluginContext {
  // Full entity service access
  readonly entityService: EntityService;

  // Entity type registration (already exists)
  registerEntityType<T extends BaseEntity>(
    entityType: string,
    schema: ZodSchema<T>,
    adapter: EntityAdapter<T>,
  ): void;
}
```

### Interface Plugin Context

```typescript
interface InterfacePluginContext extends CorePluginContext {
  // System-wide access (but no direct entity access)
  readonly system: {
    // Command discovery and execution
    getAllCommands(): Promise<Command[]>;
    executeCommand(
      name: string,
      params: Record<string, any>,
      context?: { userId?: string; source?: string },
    ): Promise<string>;

    // Plugin discovery
    getPlugins(): Promise<
      Array<{
        id: string;
        version: string;
        type: PluginType;
      }>
    >;
  };

  // Daemon support for long-running interfaces
  registerDaemon(name: string, daemon: Daemon): void;
}
```

## Plugin Type Definitions

```typescript
type PluginType = "core" | "entity" | "interface";

interface BasePlugin {
  id: string;
  version: string;
  description?: string;
}

interface CorePlugin extends BasePlugin {
  type: "core";
  register(context: CorePluginContext): Promise<void>;
}

interface EntityPlugin extends BasePlugin {
  type: "entity";
  register(context: EntityPluginContext): Promise<void>;
}

interface InterfacePlugin extends BasePlugin {
  type: "interface";
  register(context: InterfacePluginContext): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

type Plugin = CorePlugin | EntityPlugin | InterfacePlugin;
```

## Implementation Plan - Isolated Package First

### Phase 1: Create plugin-context Package (2 days)

#### 1.1 Package Structure

```
shell/plugin-context/
├── src/
│   ├── index.ts                    # Main exports
│   ├── types.ts                    # All type definitions
│   ├── contexts/
│   │   ├── corePluginContext.ts   # Core context implementation
│   │   ├── entityPluginContext.ts # Entity context implementation
│   │   └── interfacePluginContext.ts # Interface context implementation
│   └── mocks/
│       └── mockServices.ts        # Mock services for testing
├── test/
│   ├── unit/
│   │   ├── corePluginContext.test.ts
│   │   ├── entityPluginContext.test.ts
│   │   └── interfacePluginContext.test.ts
│   └── integration/
│       ├── mockPlugins.ts          # Sample plugins for testing
│       └── pluginLoading.test.ts   # Test plugin lifecycle
├── package.json
├── tsconfig.json
└── README.md
```

#### 1.2 Package Dependencies

```json
{
  "name": "@brains/plugin-context",
  "version": "0.1.0",
  "dependencies": {
    "@brains/types": "workspace:*",
    "@brains/utils": "workspace:*",
    "@brains/messaging-service": "workspace:*",
    "@brains/entity-service": "workspace:*",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@brains/test-utils": "workspace:*",
    "bun-types": "latest"
  }
}
```

### Phase 2: Build Mock Infrastructure (2 days)

#### 2.1 Mock Service Interfaces

```typescript
// shell/plugin-context/src/mocks/mockServices.ts

export interface MockServices {
  // Core services
  logger: Logger;
  commandRegistry: MockCommandRegistry;
  toolRegistry: MockToolRegistry;
  messageBus: MockMessageBus;

  // Entity services (for entity plugins)
  entityService?: MockEntityService;
  entityRegistry?: MockEntityRegistry;

  // System services (for interface plugins)
  pluginManager?: MockPluginManager;
  shell?: MockShell;
}

export class MockCommandRegistry {
  private commands = new Map<string, Command>();

  register(command: Command): void {
    this.commands.set(command.name, command);
  }

  getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  execute(name: string, params: any): Promise<string> {
    const command = this.commands.get(name);
    if (!command) throw new Error(`Command not found: ${name}`);
    return command.handler(params);
  }
}

// Similar mocks for other services...
```

#### 2.2 Context Builders with Mocks

```typescript
// shell/plugin-context/src/contexts/corePluginContext.ts

export function createCorePluginContext(
  plugin: Plugin,
  services: MockServices,
): CorePluginContext {
  return {
    pluginId: plugin.id,
    logger: services.logger.child(plugin.id),

    registerCommand: (cmd) => {
      services.commandRegistry.register({
        ...cmd,
        metadata: { pluginId: plugin.id },
      });
    },

    registerTool: (tool) => {
      services.toolRegistry.register({
        ...tool,
        metadata: { pluginId: plugin.id },
      });
    },

    sendMessage: async (type, payload) => {
      return services.messageBus.send(type, payload, plugin.id);
    },

    subscribe: (type, handler) => {
      return services.messageBus.subscribe(type, handler);
    },
  };
}
```

### Phase 3: Comprehensive Testing (3 days)

#### 3.1 Unit Tests for Each Context Type

```typescript
// shell/plugin-context/test/unit/corePluginContext.test.ts

describe("CorePluginContext", () => {
  let mockServices: MockServices;
  let testPlugin: CorePlugin;

  beforeEach(() => {
    mockServices = createMockServices();
    testPlugin = {
      id: "test-plugin",
      version: "1.0.0",
      type: "core",
      register: async (ctx) => {
        ctx.registerCommand({
          name: "test:hello",
          description: "Test command",
          handler: () => "Hello!",
        });
      },
    };
  });

  test("provides plugin identity", async () => {
    const context = createCorePluginContext(testPlugin, mockServices);
    expect(context.pluginId).toBe("test-plugin");
  });

  test("provides scoped logger", async () => {
    const context = createCorePluginContext(testPlugin, mockServices);
    expect(context.logger).toBeDefined();
    // Verify logger has plugin context
  });

  test("registers commands with plugin metadata", async () => {
    const context = createCorePluginContext(testPlugin, mockServices);
    await testPlugin.register(context);

    const commands = mockServices.commandRegistry.getAll();
    expect(commands).toHaveLength(1);
    expect(commands[0].metadata?.pluginId).toBe("test-plugin");
  });

  test("handles messaging", async () => {
    const context = createCorePluginContext(testPlugin, mockServices);

    const received: any[] = [];
    const unsubscribe = context.subscribe("test.event", async (payload) => {
      received.push(payload);
      return { success: true };
    });

    await context.sendMessage("test.event", { message: "hello" });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ message: "hello" });

    unsubscribe();
  });
});
```

#### 3.2 Entity Plugin Context Tests

```typescript
// shell/plugin-context/test/unit/entityPluginContext.test.ts

describe("EntityPluginContext", () => {
  test("extends core context", () => {
    const context = createEntityPluginContext(testPlugin, mockServices);

    // Has all core functionality
    expect(context.pluginId).toBeDefined();
    expect(context.logger).toBeDefined();
    expect(context.registerCommand).toBeDefined();
    expect(context.sendMessage).toBeDefined();
    expect(context.subscribe).toBeDefined();

    // Plus entity service
    expect(context.entityService).toBeDefined();
    expect(context.registerEntityType).toBeDefined();
  });

  test("provides entity service access", async () => {
    const context = createEntityPluginContext(testPlugin, mockServices);

    // Can use entity service
    const entities = await context.entityService.listEntities("test");
    expect(entities).toEqual([]);
  });

  test("registers entity types", () => {
    const context = createEntityPluginContext(testPlugin, mockServices);

    context.registerEntityType("note", noteSchema, noteAdapter);

    // Should be registered in the entity registry
    const registered = mockServices.entityRegistry.getRegisteredTypes();
    expect(registered).toContain("note");
  });
});
```

#### 3.3 Integration Tests

```typescript
// shell/plugin-context/test/integration/pluginLoading.test.ts

describe("Plugin Loading Integration", () => {
  test("loads core plugin", async () => {
    const loader = new PluginContextLoader(mockServices);
    const plugin = createMockCorePlugin();

    await loader.loadPlugin(plugin);

    expect(loader.getLoadedPlugins()).toContain(plugin.id);
  });

  test("loads entity plugin with correct context", async () => {
    const loader = new PluginContextLoader(mockServices);
    const plugin = createMockEntityPlugin();

    await loader.loadPlugin(plugin);

    // Verify entity operations work
    const entities = await mockServices.entityService.listEntities("test");
    expect(entities).toBeDefined();
  });

  test("loads interface plugin and starts it", async () => {
    const loader = new PluginContextLoader(mockServices);
    const plugin = createMockInterfacePlugin();

    await loader.loadPlugin(plugin);

    expect(plugin.started).toBe(true);
  });

  test("prevents entity access from core plugin", async () => {
    const loader = new PluginContextLoader(mockServices);
    const plugin: CorePlugin = {
      id: "bad-plugin",
      type: "core",
      register: async (ctx: any) => {
        // Try to access entity service (should not exist)
        expect(ctx.entityService).toBeUndefined();
      },
    };

    await loader.loadPlugin(plugin);
  });
});
```

### Phase 4: Documentation and Examples (1 day)

Create example plugins demonstrating each type:

```typescript
// shell/plugin-context/examples/calculator-plugin.ts (Core)
export const calculatorPlugin: CorePlugin = {
  id: "calculator",
  version: "1.0.0",
  type: "core",
  description: "Simple calculator plugin",

  async register(context: CorePluginContext) {
    context.registerCommand({
      name: "calc:add",
      description: "Add two numbers",
      parameters: {
        a: { type: "number", required: true },
        b: { type: "number", required: true },
      },
      handler: ({ a, b }) => `Result: ${a + b}`,
    });

    context.registerTool({
      name: "calculate",
      description: "Perform calculations",
      inputSchema: z.object({
        operation: z.enum(["add", "subtract", "multiply", "divide"]),
        a: z.number(),
        b: z.number(),
      }),
      handler: async ({ operation, a, b }) => {
        switch (operation) {
          case "add":
            return a + b;
          case "subtract":
            return a - b;
          case "multiply":
            return a * b;
          case "divide":
            return a / b;
        }
      },
    });

    context.logger.info("Calculator plugin registered");
  },
};

// shell/plugin-context/examples/notes-plugin.ts (Entity)
export const notesPlugin: EntityPlugin = {
  id: "notes",
  version: "1.0.0",
  type: "entity",

  async register(context: EntityPluginContext) {
    // Register entity type
    context.registerEntityType("note", noteSchema, noteAdapter);

    // Add commands that use entity service
    context.registerCommand({
      name: "note:create",
      description: "Create a note",
      handler: async ({ title, content }) => {
        const result = await context.entityService.createEntity({
          entityType: "note",
          title,
          content,
        });
        return `Created note: ${result.entityId}`;
      },
    });

    context.registerCommand({
      name: "note:list",
      description: "List all notes",
      handler: async () => {
        const notes = await context.entityService.listEntities("note");
        return `You have ${notes.length} notes`;
      },
    });
  },
};
```

### Phase 5: Shell Integration (2 days)

Only after the plugin-context package is fully tested in isolation:

1. **Update Shell to use plugin-context**

   ```typescript
   // shell/core/src/shell.ts
   import { PluginContextLoader } from "@brains/plugin-context";

   // Create loader with real services instead of mocks
   this.pluginLoader = new PluginContextLoader({
     logger: this.logger,
     commandRegistry: this.commandRegistry,
     entityService: this.entityService,
     messageBus: this.messageBus,
     // ... etc
   });
   ```

2. **Create adapter for existing PluginContext**

   ```typescript
   // shell/core/src/pluginContextAdapter.ts
   export function adaptOldContext(
     newContext: any,
     plugin: Plugin,
   ): OldPluginContext {
     // Map new context to old for backward compatibility
   }
   ```

3. **Update existing plugins one by one**

## Migration Strategy

### For Each Plugin:

1. **Add type field** to plugin definition
2. **Update imports** to use new types
3. **Test in isolation** with mock services
4. **Test in Shell** with real services

### Example Migration:

```typescript
// BEFORE
export const gitSyncPlugin = {
  id: "git-sync",
  version: "1.0.0",
  register: async (context: PluginContext) => {
    // Has access to everything
  },
};

// AFTER
export const gitSyncPlugin: CorePlugin = {
  id: "git-sync",
  version: "1.0.0",
  type: "core", // Added
  register: async (context: CorePluginContext) => {
    // Only has access to core features
  },
};
```

## Benefits of This Approach

1. **No new concepts** - Just reorganizing existing functionality
2. **Clear boundaries** - TypeScript enforces access levels
3. **Isolated testing** - Can test without full Shell
4. **Gradual migration** - Both old and new can coexist
5. **Better DX** - Focused contexts are easier to understand

## Timeline

- **Week 1**: Create plugin-context package with types and core implementation
- **Week 2**: Build mock services and comprehensive tests
- **Week 3**: Create examples and documentation
- **Week 4**: Integrate with Shell and migrate first plugin
- **Week 5**: Complete migration of all plugins

## Success Criteria

1. Plugin-context package has 100% test coverage
2. All three context types work with mock services
3. Clear examples for each plugin type
4. Zero dependencies on Shell internals
5. Existing plugins continue to work during migration
