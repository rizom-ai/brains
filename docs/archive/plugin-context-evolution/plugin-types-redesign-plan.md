# Plugin Types Redesign - Simple Implementation Plan

## Overview

Three plugin types with progressive complexity:

1. **Simple Plugin** - Basic functionality (base for all plugins)
2. **Entity Plugin** - Adds entity management (extends Simple)
3. **Interface Plugin** - Adds system access for UIs (extends Simple)

## Plugin Type Hierarchy

### 1. Simple Plugin (Base)

Most basic plugin type. Can register commands and tools.

```typescript
interface SimplePluginContext {
  // Core identity
  readonly pluginId: string;
  readonly logger: Logger;

  // Command registration
  registerCommand(command: Command): void;

  // Tool registration (for MCP)
  registerTool(tool: Tool): void;

  // Basic messaging
  sendMessage<T>(channel: string, data: T): Promise<void>;
  subscribe<T>(channel: string, handler: (data: T) => void): () => void;

  // Plugin storage (scoped key-value)
  storage: {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
  };
}

interface SimplePlugin {
  id: string;
  version: string;
  type: "simple";
  register(context: SimplePluginContext): Promise<void>;
}
```

**Example: Calculator Plugin**

```typescript
export const calculatorPlugin: SimplePlugin = {
  id: "calculator",
  version: "1.0.0",
  type: "simple",

  async register(context) {
    context.registerCommand({
      name: "calc:add",
      description: "Add two numbers",
      parameters: {
        a: { type: "number", required: true },
        b: { type: "number", required: true },
      },
      handler: ({ a, b }) => `${a} + ${b} = ${a + b}`,
    });

    context.logger.info("Calculator plugin loaded");
  },
};
```

### 2. Entity Plugin

Extends SimplePlugin with entity management capabilities.

```typescript
interface EntityPluginContext extends SimplePluginContext {
  // Entity operations (scoped to plugin)
  entities: {
    defineType<T extends BaseEntity>(name: string, schema: ZodSchema<T>): void;

    create<T extends BaseEntity>(
      type: string,
      data: Omit<T, "id" | "created" | "updated">,
    ): Promise<T>;

    get<T extends BaseEntity>(type: string, id: string): Promise<T | null>;

    list<T extends BaseEntity>(
      type: string,
      options?: ListOptions,
    ): Promise<T[]>;

    update<T extends BaseEntity>(
      type: string,
      id: string,
      updates: Partial<T>,
    ): Promise<T>;

    delete(type: string, id: string): Promise<boolean>;
  };
}

interface EntityPlugin {
  id: string;
  version: string;
  type: "entity";
  register(context: EntityPluginContext): Promise<void>;
}
```

**Example: Notes Plugin**

```typescript
export const notesPlugin: EntityPlugin = {
  id: "notes",
  version: "1.0.0",
  type: "entity",

  async register(context) {
    // Define entity type
    context.entities.defineType("note", noteSchema);

    // Register commands
    context.registerCommand({
      name: "note:create",
      description: "Create a new note",
      parameters: {
        title: { type: "string", required: true },
        content: { type: "string", required: true },
      },
      handler: async ({ title, content }) => {
        const note = await context.entities.create("note", {
          title,
          content,
        });
        return `Created note: ${note.id}`;
      },
    });

    context.registerCommand({
      name: "note:list",
      description: "List all notes",
      handler: async () => {
        const notes = await context.entities.list("note");
        return `You have ${notes.length} notes`;
      },
    });
  },
};
```

### 3. Interface Plugin

Extends SimplePlugin with system-wide access for building UIs.

```typescript
interface InterfacePluginContext extends SimplePluginContext {
  // System-wide access
  system: {
    // Get ALL commands from all plugins
    getAllCommands(): Promise<Command[]>;

    // Execute any command
    executeCommand(
      name: string,
      params: any,
      context?: ExecutionContext,
    ): Promise<string>;

    // Get all registered plugins
    getPlugins(): Promise<PluginInfo[]>;

    // Access all entities (read-only by default)
    queryEntities(query: EntityQuery): Promise<BaseEntity[]>;
  };

  // UI registration (if applicable)
  ui?: {
    registerRoute(route: Route): void;
    registerMenuItem(item: MenuItem): void;
  };
}

interface InterfacePlugin {
  id: string;
  version: string;
  type: "interface";
  register(context: InterfacePluginContext): Promise<void>;

  // Interface lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

**Example: CLI Interface**

```typescript
export const cliInterface: InterfacePlugin = {
  id: "cli",
  version: "1.0.0",
  type: "interface",

  async register(context) {
    this.context = context;
    this.commands = await context.system.getAllCommands();
  },

  async start() {
    // Set up readline interface
    const rl = createReadline();

    rl.on("line", async (input) => {
      const [cmd, ...args] = input.split(" ");

      try {
        const result = await this.context.system.executeCommand(
          cmd,
          parseArgs(args),
          { source: "cli", userId: process.env.USER },
        );
        console.log(result);
      } catch (error) {
        console.error(`Error: ${error.message}`);
      }
    });
  },

  async stop() {
    // Cleanup
  },
};
```

## Implementation Strategy

### Phase 1: Define Types (1 day)

```typescript
// shared/plugin-utils/src/types.ts
export type PluginType = "simple" | "entity" | "interface";

export interface BasePlugin {
  id: string;
  version: string;
  type: PluginType;
}

export interface SimplePlugin extends BasePlugin {
  type: "simple";
  register(context: SimplePluginContext): Promise<void>;
}

export interface EntityPlugin extends BasePlugin {
  type: "entity";
  register(context: EntityPluginContext): Promise<void>;
}

export interface InterfacePlugin extends BasePlugin {
  type: "interface";
  register(context: InterfacePluginContext): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type Plugin = SimplePlugin | EntityPlugin | InterfacePlugin;
```

### Phase 2: Create Context Builders (2 days)

```typescript
// shell/core/src/contexts/simplePluginContext.ts
export function createSimplePluginContext(
  plugin: Plugin,
  shell: Shell,
): SimplePluginContext {
  const logger = shell.logger.child(plugin.id);

  return {
    pluginId: plugin.id,
    logger,

    registerCommand: (command) => {
      shell.commandRegistry.register({
        ...command,
        pluginId: plugin.id,
      });
    },

    registerTool: (tool) => {
      shell.toolRegistry.register({
        ...tool,
        pluginId: plugin.id,
      });
    },

    sendMessage: (channel, data) => {
      return shell.messageBus.send(channel, data, plugin.id);
    },

    subscribe: (channel, handler) => {
      return shell.messageBus.subscribe(channel, handler);
    },

    storage: createPluginStorage(plugin.id, shell.entityService),
  };
}

// shell/core/src/contexts/entityPluginContext.ts
export function createEntityPluginContext(
  plugin: EntityPlugin,
  shell: Shell,
): EntityPluginContext {
  const simpleContext = createSimplePluginContext(plugin, shell);

  return {
    ...simpleContext,

    entities: {
      defineType: (name, schema) => {
        const qualifiedType = `${plugin.id}:${name}`;
        shell.entityRegistry.register(qualifiedType, schema);
      },

      create: async (type, data) => {
        const qualifiedType = `${plugin.id}:${type}`;
        return shell.entityService.create({
          ...data,
          entityType: qualifiedType,
          _pluginId: plugin.id,
        });
      },

      get: async (type, id) => {
        const qualifiedType = `${plugin.id}:${type}`;
        return shell.entityService.get(qualifiedType, id);
      },

      // ... other entity methods
    },
  };
}

// shell/core/src/contexts/interfacePluginContext.ts
export function createInterfacePluginContext(
  plugin: InterfacePlugin,
  shell: Shell,
): InterfacePluginContext {
  const simpleContext = createSimplePluginContext(plugin, shell);

  return {
    ...simpleContext,

    system: {
      getAllCommands: () => shell.commandRegistry.getAll(),

      executeCommand: (name, params, context) => {
        return shell.executeCommand(name, params, {
          ...context,
          source: plugin.id,
        });
      },

      getPlugins: () => shell.pluginManager.getPluginInfo(),

      queryEntities: (query) => shell.queryProcessor.execute(query),
    },

    // UI only for web interface
    ui:
      plugin.id === "webserver"
        ? {
            registerRoute: (route) => shell.routeRegistry.register(route),
            registerMenuItem: (item) => shell.menuRegistry.register(item),
          }
        : undefined,
  };
}
```

### Phase 3: Update Plugin Manager (1 day)

```typescript
// shell/core/src/pluginManager.ts
export class PluginManager {
  async loadPlugin(plugin: Plugin): Promise<void> {
    // Create appropriate context based on plugin type
    const context = this.createContext(plugin);

    // Register the plugin
    await plugin.register(context);

    // Start interface plugins
    if (plugin.type === "interface") {
      await plugin.start();
      this.runningInterfaces.set(plugin.id, plugin);
    }

    this.plugins.set(plugin.id, plugin);
  }

  private createContext(plugin: Plugin): any {
    switch (plugin.type) {
      case "simple":
        return createSimplePluginContext(plugin, this.shell);
      case "entity":
        return createEntityPluginContext(plugin as EntityPlugin, this.shell);
      case "interface":
        return createInterfacePluginContext(
          plugin as InterfacePlugin,
          this.shell,
        );
      default:
        throw new Error(`Unknown plugin type: ${(plugin as any).type}`);
    }
  }
}
```

### Phase 4: Migration Examples (1 day)

```typescript
// Before: Everything in one context
const oldPlugin = {
  register: async (context: OldPluginContext) => {
    context.registerEntityType(...);
    context.registerCommand(...);
    context.getAllCommands(); // Available to everyone!
  }
};

// After: Clear plugin types
const simplePlugin: SimplePlugin = {
  type: "simple",
  register: async (context) => {
    context.registerCommand(...);
    // context.entities - NOT AVAILABLE
    // context.system - NOT AVAILABLE
  }
};

const entityPlugin: EntityPlugin = {
  type: "entity",
  register: async (context) => {
    context.registerCommand(...);
    context.entities.defineType(...); // Available!
    // context.system - NOT AVAILABLE
  }
};

const interfacePlugin: InterfacePlugin = {
  type: "interface",
  register: async (context) => {
    context.registerCommand(...);
    context.system.getAllCommands(); // Available!
    // context.entities - NOT AVAILABLE (use system.queryEntities)
  }
};
```

## Benefits

### Clear Mental Model

- **Simple**: I just need commands/tools
- **Entity**: I need commands + data storage
- **Interface**: I need commands + system access

### Progressive Complexity

- Start with SimplePlugin
- Upgrade to EntityPlugin when you need data
- Only InterfacePlugin for building UIs

### Type Safety

```typescript
// TypeScript prevents mistakes
const plugin: SimplePlugin = {
  type: "simple",
  register: async (context) => {
    context.entities.create(...); // ❌ TypeScript Error!
  }
};
```

### Security by Design

- Simple plugins can't access entities
- Entity plugins can't access other plugins' data
- Only interface plugins can see system-wide data

## Migration Path

1. **Tag existing plugins** with appropriate type
2. **Wrap old context** to provide new interface
3. **Update plugins** one by one
4. **Remove old context** when all migrated

## Timeline

- Week 1: Implement types and context builders
- Week 2: Update plugin manager and test
- Week 3: Migrate 2-3 plugins as examples
- Week 4: Documentation and rollout

This approach is much simpler than the capability system while still providing clear boundaries and good developer experience.
