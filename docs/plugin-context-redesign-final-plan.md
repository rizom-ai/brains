# Plugin Context Redesign - Final Plan

## Overview

This plan consolidates and replaces previous plugin context redesign proposals. Based on analysis of existing plugins and their actual needs, we've identified three plugin types with clear access boundaries. This refactoring reorganizes existing functionality without introducing new concepts.

## Plugin Types by Access Level

### 1. **Core Plugin** - Basic functionality

**Examples**: Simple command/messaging plugins  
**Access**: Identity, logging, messaging, template registration/formatting  
**Cannot**: Generate content, access entities or system-wide data

### 2. **Service Plugin** - Data and content operations (formerly Entity Plugin)

**Examples**: git-sync, directory-sync, site-builder  
**Access**: Everything from Core + content generation, entity service, job queues  
**Cannot**: Access system-wide commands or other plugins

### 3. **Interface Plugin** - User interfaces

**Examples**: cli, matrix, mcp, webserver  
**Access**: Everything from Core + system-wide command discovery, daemon support  
**Cannot**: Direct entity access or content generation (use commands instead)

## Context Interfaces

### Core Plugin Context

```typescript
interface CorePluginContext {
  // Identity
  readonly pluginId: string;
  readonly logger: Logger;

  // Inter-plugin messaging
  sendMessage: MessageSender;
  subscribe: (channel: string, handler: MessageHandler) => () => void;

  // Template operations (lightweight, no AI generation)
  registerTemplates: (templates: Record<string, Template>) => void;
  formatContent: <T = unknown>(
    templateName: string,
    data: T,
    options?: { truncate?: number },
  ) => string;
  parseContent: <T = unknown>(templateName: string, content: string) => T;
}
```

Note: Plugins return capabilities (tools, resources, commands) from their register() method rather than registering them via context methods.

### Service Plugin Context (formerly Entity Plugin Context)

```typescript
interface ServicePluginContext extends CorePluginContext {
  // Content generation (AI-powered, needs entity storage)
  generateContent: <T = unknown>(config: ContentGenerationConfig) => Promise<T>;

  // Full entity service access
  readonly entityService: EntityService;

  // Entity type registration
  registerEntityType<T extends BaseEntity>(
    entityType: string,
    schema: ZodSchema<T>,
    adapter: EntityAdapter<T>,
  ): void;

  // Job queue operations
  enqueueJob: (
    type: string,
    data: unknown,
    options: JobOptions,
  ) => Promise<string>;
  getJobStatus: (jobId: string) => Promise<JobQueue | null>;
  enqueueBatch: (
    operations: BatchOperation[],
    options: JobOptions,
  ) => Promise<string>;
  getBatchStatus: (batchId: string) => Promise<BatchJobStatus | null>;
  getActiveJobs: (types?: string[]) => Promise<JobQueue[]>;
  getActiveBatches: () => Promise<Batch[]>;
  registerJobHandler: (type: string, handler: JobHandler) => void;

  // Route and view registration
  registerRoutes: (
    routes: RouteDefinition[],
    options?: { environment?: string },
  ) => void;
  getViewTemplate: (name: string) => ViewTemplate | undefined;
  getRoute: (path: string) => RouteDefinition | undefined;
  listRoutes: () => RouteDefinition[];
  listViewTemplates: () => ViewTemplate[];
}
```

### Interface Plugin Context

```typescript
interface InterfacePluginContext extends CorePluginContext {
  // Command discovery (no direct data manipulation)
  getAllCommands: () => Promise<Command[]>;

  // Plugin metadata access
  getPluginPackageName: (targetPluginId?: string) => string | undefined;

  // Daemon support for long-running interfaces
  registerDaemon: (name: string, daemon: Daemon) => void;

  // Job monitoring (read-only for status updates)
  getActiveJobs: (types?: string[]) => Promise<JobQueue[]>;
  getActiveBatches: () => Promise<Batch[]>;
}
```

Note: Interface plugins coordinate but don't manipulate data directly. They use commands/tools exposed by other plugins.

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
  register(context: CorePluginContext): Promise<PluginCapabilities>;
}

interface ServicePlugin extends BasePlugin {
  type: "service";
  register(context: ServicePluginContext): Promise<PluginCapabilities>;
}

interface InterfacePlugin extends BasePlugin {
  type: "interface";
  register(context: InterfacePluginContext): Promise<PluginCapabilities>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

type Plugin = CorePlugin | ServicePlugin | InterfacePlugin;
```

## Capability Distribution Rationale

### Core Plugin Context

- **Templates**: Lightweight capability used by all plugins for formatting output
- **Messaging**: Fundamental communication mechanism
- **No content generation**: This requires AI calls and entity storage, too heavy for core

### Service Plugin Context

- **Content generation**: Needs entity service to store generated content
- **Entity access**: Required for data manipulation
- **Job queues**: Heavy operations need background processing
- **Routes/views**: Site-builder and similar plugins need these

### Interface Plugin Context

- **Command discovery**: Interfaces need to know available commands
- **No data generation**: Interfaces coordinate, not create
- **Read-only monitoring**: Can check job status but not create jobs
- **Daemon support**: Long-running processes for servers

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

  async register(context: CorePluginContext): Promise<PluginCapabilities> {
    // Register templates for formatting
    context.registerTemplates({
      "calc-result": {
        name: "calc-result",
        description: "Format calculation results",
        generate: async (data: { result: number }) => {
          return `🧮 Result: ${data.result}`;
        },
      },
    });

    // Set up message handling
    context.subscribe("calc:request", async (message) => {
      const { a, b, operation } = message.payload;
      let result: number;

      switch (operation) {
        case "add":
          result = a + b;
          break;
        case "subtract":
          result = a - b;
          break;
        default:
          throw new Error("Unknown operation");
      }

      await context.sendMessage("calc:result", { result });
      return { success: true };
    });

    context.logger.info("Calculator plugin registered");

    // Return capabilities
    return {
      tools: [],
      resources: [],
      commands: [
        {
          name: "calc:add",
          description: "Add two numbers",
          usage: "calc:add <a> <b>",
          handler: async (args) => {
            const [a, b] = args.map(Number);
            return context.formatContent("calc-result", { result: a + b });
          },
        },
      ],
    };
  },
};

// shell/plugin-context/examples/notes-plugin.ts (Service)
export const notesPlugin: ServicePlugin = {
  id: "notes",
  version: "1.0.0",
  type: "service",

  async register(context: ServicePluginContext): Promise<PluginCapabilities> {
    // Register entity type
    context.registerEntityType("note", noteSchema, noteAdapter);

    // Register templates
    context.registerTemplates({
      "note-summary": {
        name: "note-summary",
        description: "Format note summary",
        formatter: {
          format: (note: Note) =>
            `📝 ${note.title}\n${note.content.substring(0, 100)}...`,
          parse: (content: string) => ({ content }),
        },
      },
    });

    // Register job handlers
    context.registerJobHandler("note:summarize", async (job) => {
      const { noteId } = job.data;
      const note = await context.entityService.getEntity("note", noteId);

      if (!note) throw new Error("Note not found");

      // Generate AI summary
      const summary = await context.generateContent({
        templateName: "summarize",
        entityType: "note",
        entityId: noteId,
        prompt: "Summarize this note in 2-3 sentences",
      });

      return { summary };
    });

    // Return capabilities
    return {
      tools: [
        {
          name: "create_note",
          description: "Create a new note",
          inputSchema: z.object({
            title: z.string(),
            content: z.string(),
            tags: z.array(z.string()).optional(),
          }),
          handler: async (input) => {
            const result = await context.entityService.createEntity({
              entityType: "note",
              ...input,
            });
            return { noteId: result.entityId };
          },
        },
      ],
      resources: [],
      commands: [
        {
          name: "note:list",
          description: "List all notes",
          handler: async () => {
            const notes = await context.entityService.listEntities("note");
            return notes
              .map((n) => context.formatContent("note-summary", n))
              .join("\n\n");
          },
        },
      ],
    };
  },
};

// shell/plugin-context/examples/cli-interface-plugin.ts (Interface)
export const cliInterfacePlugin: InterfacePlugin = {
  id: "cli-interface",
  version: "1.0.0",
  type: "interface",

  async register(context: InterfacePluginContext): Promise<PluginCapabilities> {
    // Register daemon for CLI server
    context.registerDaemon("cli-server", {
      name: "cli-server",
      start: async () => {
        console.log("CLI interface started");
        // Set up readline interface
      },
      stop: async () => {
        console.log("CLI interface stopped");
      },
    });

    // Monitor active jobs
    context.subscribe("job:status", async (message) => {
      const activeJobs = await context.getActiveJobs();
      console.log(`Active jobs: ${activeJobs.length}`);
      return { success: true };
    });

    // Return interface-specific capabilities
    return {
      tools: [],
      resources: [],
      commands: [
        {
          name: "cli:help",
          description: "Show available commands",
          handler: async () => {
            const commands = await context.getAllCommands();
            return commands
              .map((cmd) => `${cmd.name} - ${cmd.description}`)
              .join("\n");
          },
        },
      ],
    };
  },

  async start() {
    // Start the CLI interface
    console.log("Starting CLI interface...");
  },

  async stop() {
    // Stop the CLI interface
    console.log("Stopping CLI interface...");
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

## Key Updates from Original Plan

Based on analysis of actual plugin usage patterns:

1. **Renamed "Entity Plugin" to "Service Plugin"** - Better reflects their role as data/content services
2. **Moved content generation from Core to Service** - Requires entity storage, too heavy for core
3. **Added template operations to Core** - All plugins use templates for formatting
4. **Clarified Interface plugin role** - Coordinate via commands, no direct data manipulation
5. **Plugins return capabilities** - Commands, tools, resources returned from register(), not registered via context
6. **Refined capability distribution** - Based on actual plugin needs, not theoretical organization
