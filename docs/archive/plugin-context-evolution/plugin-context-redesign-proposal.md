# PluginContext Redesign Proposal

## Vision

Make plugin development so simple that a developer can create their first working plugin in 15 minutes, while still providing power users with advanced capabilities.

## Design Principles

1. **Progressive Disclosure** - Start simple, add complexity only when needed
2. **Secure by Default** - Plugins can only access their own data unless explicitly granted permissions
3. **Consistent Patterns** - One way to do things, not three
4. **Self-Documenting** - Interface names and structure teach you how to use them

## Core Design: Capability-Based Contexts

### Base Context (Every Plugin Gets This)

```typescript
interface PluginContext {
  /**
   * Your plugin's unique identifier
   * @example "my-awesome-plugin"
   */
  readonly pluginId: string;

  /**
   * Logger automatically scoped to your plugin
   * @example context.logger.info("Plugin initialized")
   */
  readonly logger: Logger;

  /**
   * Key-value storage automatically scoped to your plugin
   * @example await context.storage.set("user-prefs", { theme: "dark" })
   */
  readonly storage: PluginStorage;

  /**
   * Request additional capabilities for your plugin
   * @example const entities = await context.requestCapability("entities")
   */
  requestCapability<T extends CapabilityType>(
    capability: T,
  ): Promise<Capabilities[T]>;
}

interface PluginStorage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}
```

### Capability System

```typescript
type CapabilityType =
  | "entities"
  | "messaging"
  | "commands"
  | "ui"
  | "jobs"
  | "content"
  | "system"; // Special capability for interface plugins

interface Capabilities {
  entities: EntityCapability;
  messaging: MessagingCapability;
  commands: CommandCapability;
  ui: UICapability;
  jobs: JobCapability;
  content: ContentCapability;
  system: SystemCapability; // For interface plugins only
}
```

### Example Capabilities

#### Entities Capability

```typescript
interface EntityCapability {
  /**
   * Define a new entity type for your plugin
   * @example
   * entities.defineType("todo", {
   *   schema: z.object({
   *     title: z.string(),
   *     completed: z.boolean()
   *   })
   * })
   */
  defineType<T extends BaseEntity>(
    typeName: string,
    config: {
      schema: ZodSchema<T>;
      searchableFields?: string[];
    },
  ): void;

  /**
   * Create a new entity (automatically scoped to your plugin)
   * @example
   * const todo = await entities.create("todo", {
   *   title: "Build awesome plugin",
   *   completed: false
   * })
   */
  create<T extends BaseEntity>(
    type: string,
    data: Omit<T, "id" | "entityType" | "created" | "updated">,
  ): Promise<T>;

  /**
   * Get an entity by ID (only your plugin's entities)
   */
  get<T extends BaseEntity>(type: string, id: string): Promise<T | null>;

  /**
   * List entities with optional filtering
   */
  list<T extends BaseEntity>(
    type: string,
    options?: {
      filter?: Partial<T>;
      limit?: number;
      offset?: number;
    },
  ): Promise<T[]>;

  /**
   * Update an entity
   */
  update<T extends BaseEntity>(
    type: string,
    id: string,
    updates: Partial<T>,
  ): Promise<T>;

  /**
   * Delete an entity
   */
  delete(type: string, id: string): Promise<boolean>;
}
```

#### Messaging Capability

```typescript
interface MessagingCapability {
  /**
   * Send a message to other plugins
   * @example
   * await messaging.send("task.completed", {
   *   taskId: "123",
   *   completedBy: "user@example.com"
   * })
   */
  send<T = unknown>(
    channel: string,
    data: T,
    options?: { persistent?: boolean },
  ): Promise<void>;

  /**
   * Subscribe to messages from other plugins
   * @example
   * messaging.subscribe("task.completed", async (data) => {
   *   console.log("Task completed:", data.taskId);
   * })
   */
  subscribe<T = unknown>(
    channel: string,
    handler: (data: T) => void | Promise<void>,
  ): () => void; // Returns unsubscribe function

  /**
   * Request data from another plugin
   * @example
   * const userProfile = await messaging.request("user.getProfile", {
   *   userId: "123"
   * })
   */
  request<TRequest = unknown, TResponse = unknown>(
    channel: string,
    data: TRequest,
    options?: { timeout?: number },
  ): Promise<TResponse>;

  /**
   * Respond to requests from other plugins
   */
  respond<TRequest = unknown, TResponse = unknown>(
    channel: string,
    handler: (data: TRequest) => TResponse | Promise<TResponse>,
  ): () => void;
}
```

#### Commands Capability

```typescript
interface CommandCapability {
  /**
   * Register a command that users can execute
   * @example
   * commands.register({
   *   name: "todo:add",
   *   description: "Add a new todo item",
   *   parameters: {
   *     title: { type: "string", required: true },
   *     due: { type: "date", required: false }
   *   },
   *   handler: async (params) => {
   *     const todo = await entities.create("todo", {
   *       title: params.title,
   *       due: params.due
   *     });
   *     return `Created todo: ${todo.id}`;
   *   }
   * })
   */
  register(command: {
    name: string;
    description: string;
    parameters?: Record<string, ParameterDef>;
    handler: (params: any) => string | Promise<string>;
  }): void;

  /**
   * Get commands registered by this plugin
   * @returns Commands that this plugin has registered
   */
  getOwnCommands(): Command[];
}
```

#### System Capability (Interface Plugins Only)

```typescript
interface SystemCapability {
  /**
   * Get ALL commands from ALL plugins
   * Only available to interface plugins (CLI, Matrix, MCP, etc.)
   * @example
   * const allCommands = await system.getAllCommands();
   * // Use for command completion, help text, etc.
   */
  getAllCommands(): Promise<Command[]>;

  /**
   * Execute any command by name
   * @example
   * const result = await system.executeCommand("todo:add", {
   *   title: "Build awesome feature"
   * });
   */
  executeCommand(
    commandName: string,
    params: Record<string, any>,
    context?: { userId?: string; source?: string },
  ): Promise<string>;

  /**
   * Get information about all registered plugins
   */
  getPluginInfo(): Promise<
    Array<{
      id: string;
      version: string;
      capabilities: CapabilityType[];
    }>
  >;

  /**
   * Monitor system health
   */
  getSystemStatus(): Promise<{
    plugins: number;
    entities: number;
    activeJobs: number;
  }>;
}
```

#### UI Capability (for web interface)

```typescript
interface UICapability {
  /**
   * Register a page in the web interface
   * @example
   * ui.registerPage({
   *   path: "/todos",
   *   title: "My Todos",
   *   icon: "checklist",
   *   component: TodoListComponent
   * })
   */
  registerPage(config: {
    path: string;
    title: string;
    icon?: string;
    component: ComponentType;
  }): void;

  /**
   * Add a widget to the dashboard
   */
  registerWidget(config: {
    id: string;
    title: string;
    size: "small" | "medium" | "large";
    component: ComponentType;
  }): void;
}
```

## Plugin Types

### Regular Plugin

Most plugins that add functionality (entities, commands, tools):

```typescript
export const todoPlugin: Plugin = {
  id: "todo-plugin",
  version: "1.0.0",

  async register(context: PluginContext) {
    const entities = await context.requestCapability("entities");
    const commands = await context.requestCapability("commands");

    // Can only see its own commands via commands.getOwnCommands()
    // Cannot see other plugins' commands
  },
};
```

### Interface Plugin

Special plugins that provide user interfaces (CLI, Matrix, Web):

```typescript
export const cliPlugin: InterfacePlugin = {
  id: "cli-interface",
  version: "1.0.0",
  type: "interface", // Special marker

  async register(context: PluginContext) {
    // Interface plugins can request system capability
    const system = await context.requestCapability("system");
    const commands = await context.requestCapability("commands");

    // Can see ALL commands from all plugins
    const allCommands = await system.getAllCommands();

    // Set up command completion, help, etc.
    setupCommandCompletion(allCommands);
  },
};
```

## Security Model

### Capability Permissions

```typescript
// During plugin registration, the system checks:
function canRequestCapability(
  plugin: Plugin,
  capability: CapabilityType,
): boolean {
  // Only interface plugins can request "system" capability
  if (capability === "system") {
    return plugin.type === "interface";
  }

  // All plugins can request other capabilities
  return true;
}
```

### Why This Works

1. **Regular plugins** can only register and see their own commands
2. **Interface plugins** are trusted system components that need global access
3. **Clear distinction** between plugin types in the type system
4. **No accidental exposure** of system-wide data to regular plugins

## Migration Path

### Step 1: Adapter Layer

Create an adapter that provides the new interface while using the existing implementation:

```typescript
class PluginContextAdapter implements PluginContext {
  constructor(private oldContext: OldPluginContext) {}

  get pluginId() { return this.oldContext.pluginId; }
  get logger() { return this.oldContext.logger; }

  get storage(): PluginStorage {
    return {
      get: (key) => /* use entity service with special storage entity type */,
      set: (key, value) => /* ... */,
      delete: (key) => /* ... */,
      list: (prefix) => /* ... */
    };
  }

  async requestCapability<T extends CapabilityType>(
    capability: T
  ): Promise<Capabilities[T]> {
    // Check permissions
    if (capability === "system" && this.plugin.type !== "interface") {
      throw new Error("Only interface plugins can access system capability");
    }

    switch(capability) {
      case "entities":
        return new EntityCapabilityAdapter(this.oldContext);
      case "system":
        return new SystemCapabilityAdapter(this.oldContext);
      // ... etc
    }
  }
}
```

### Step 2: Gradual Migration

1. New plugins use new interface
2. Migrate existing plugins one by one
3. Deprecate old interface
4. Remove old implementation

## Example: Building a Todo Plugin

```typescript
// todo-plugin.ts
import { Plugin, PluginContext } from "@brains/plugin-utils";
import { z } from "zod";

const todoSchema = z.object({
  title: z.string(),
  completed: z.boolean().default(false),
  due: z.date().optional(),
});

export const todoPlugin: Plugin = {
  id: "todo-plugin",
  version: "1.0.0",

  async register(context: PluginContext) {
    // Get the capabilities we need
    const entities = await context.requestCapability("entities");
    const commands = await context.requestCapability("commands");

    // Define our entity type
    entities.defineType("todo", {
      schema: todoSchema,
      searchableFields: ["title"],
    });

    // Register commands
    commands.register({
      name: "todo:add",
      description: "Add a new todo",
      parameters: {
        title: { type: "string", required: true },
      },
      handler: async ({ title }) => {
        const todo = await entities.create("todo", { title });
        return `Created todo: ${todo.title}`;
      },
    });

    commands.register({
      name: "todo:list",
      description: "List all todos",
      handler: async () => {
        const todos = await entities.list("todo");
        const pending = todos.filter((t) => !t.completed);
        return `You have ${pending.length} pending todos`;
      },
    });

    context.logger.info("Todo plugin initialized");
  },
};
```

## Example: Building an Interface Plugin

```typescript
// cli-interface.ts
import { InterfacePlugin, PluginContext } from "@brains/plugin-utils";

export const cliInterface: InterfacePlugin = {
  id: "cli-interface",
  version: "1.0.0",
  type: "interface",

  async register(context: PluginContext) {
    const system = await context.requestCapability("system");
    const messaging = await context.requestCapability("messaging");

    // Get all commands for command completion
    const commands = await system.getAllCommands();

    // Set up CLI
    const cli = createCLI({
      commands,
      onCommand: async (cmdName, params) => {
        try {
          const result = await system.executeCommand(cmdName, params);
          console.log(result);
        } catch (error) {
          console.error(`Command failed: ${error.message}`);
        }
      },
    });

    // Listen for system events
    messaging.subscribe("entity.created", ({ entity }) => {
      console.log(`New ${entity.type} created: ${entity.id}`);
    });

    await cli.start();
  },
};
```

## Benefits

### For New Developers

- **5 minute learning curve** - Just 3 concepts: context, storage, capabilities
- **Type-safe by default** - TypeScript guides you
- **No accidental breakage** - Can't access other plugins' data
- **Clear examples** - Each capability has simple examples

### For Power Users

- **Full control when needed** - Request additional capabilities
- **Composable** - Mix and match capabilities
- **Extensible** - Easy to add new capabilities

### For Maintainers

- **Easier to secure** - Capability-based security model
- **Easier to evolve** - Add new capabilities without breaking existing plugins
- **Easier to test** - Each capability can be mocked independently
- **Easier to document** - Each capability is self-contained

## Comparison

### Before (Current):

```typescript
// 20+ methods to understand
interface PluginContext {
  pluginId: string;
  logger: Logger;
  sendMessage: MessageSender;
  registerEntityType: (...) => void;
  generateContent: GenerateContentFunction;
  formatContent: (...) => string;
  parseContent: (...) => T;
  registerTemplates: (...) => void;
  registerRoutes: (...) => void;
  getViewTemplate: (...) => ViewTemplate;
  getRoute: (...) => RouteDefinition;
  listRoutes: () => RouteDefinition[];
  listViewTemplates: () => ViewTemplate[];
  entityService: EntityService;
  enqueueJob: (...) => Promise<string>;
  getJobStatus: (...) => Promise<JobQueue>;
  enqueueBatch: (...) => Promise<string>;
  getBatchStatus: (...) => Promise<BatchJobStatus>;
  getActiveJobs: (...) => Promise<JobQueue[]>;
  getActiveBatches: (...) => Promise<Batch[]>;
  registerJobHandler: (...) => void;
  registerDaemon: (...) => void;
  getAllCommands: () => Promise<Command[]>;
  getPluginPackageName: (...) => string;
}
```

### After (Proposed):

```typescript
// Start with just 3 things
interface PluginContext {
  pluginId: string;
  logger: Logger;
  storage: PluginStorage;
  requestCapability<T>(capability: T): Promise<Capabilities[T]>;
}

// Request only what you need
const entities = await context.requestCapability("entities");
const commands = await context.requestCapability("commands");

// Interface plugins get special access
const system = await context.requestCapability("system"); // Only for interfaces
```

## Next Steps

1. **Validate design** with potential plugin developers
2. **Build prototype** of adapter layer
3. **Create plugin templates** for common use cases
4. **Write migration guide** for existing plugins
5. **Plan deprecation timeline** for old interface
