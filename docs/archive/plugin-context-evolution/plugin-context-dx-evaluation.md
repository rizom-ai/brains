# PluginContext Developer Experience Evaluation

## Executive Summary

As an external developer looking to build a plugin, the current PluginContext interface is **overwhelming and inconsistent**. While it provides necessary functionality, it violates its own stated principle of being "clean" and "minimal."

## 🔴 Major Issues

### 1. **Too Many Responsibilities** (20+ methods!)

The interface tries to do everything:

- Entity management
- Content generation
- Template management
- View/Route management
- Job queue operations
- Batch processing
- Daemon management
- Inter-plugin communication
- System monitoring

**Developer Impact**: "Where do I even start? What's required vs optional?"

### 2. **Inconsistent Abstraction Levels**

```typescript
// Direct service access - low level
entityService: EntityService;

// But wrapped access for other things - high level
generateContent: GenerateContentFunction;
formatContent: <T = unknown>(...) => string;

// Mix of async and sync
enqueueJob: (...) => Promise<string>;  // async
registerEntityType: (...) => void;     // sync
```

**Developer Impact**: "Why can I access entityService directly but not other services? What's the pattern here?"

### 3. **Security/Privacy Concerns**

```typescript
// Why does my plugin need to see ALL jobs/commands?
getActiveJobs: (types?: string[]) => Promise<JobQueue[]>;
getAllCommands: () => Promise<Command[]>;
getPluginPackageName: (targetPluginId?: string) => string | undefined;
```

**Developer Impact**: "This feels like too much access. Can I accidentally break other plugins?"

### 4. **Unclear Required vs Optional**

- No indication of what's required to implement a basic plugin
- Comments like "// for tool use only" are confusing
- Some methods marked "(required)" but inconsistently

**Developer Impact**: "Do I need to use all of these? What's the minimum viable plugin?"

### 5. **Poor Method Naming/Organization**

```typescript
// Content operations scattered
generateContent; // AI generation?
formatContent; // Template formatting?
parseContent; // Parse what?
registerTemplates; // Different from formatContent?

// Confusing naming
getViewTemplate; // What's a "view" template?
listViewTemplates; // Why list vs get?
```

## 🟡 Confusing Patterns

### 1. **Template Scoping Mystery**

As an external dev, I'd wonder:

- Do I need to prefix template names with my plugin ID?
- What happens if two plugins register the same template name?
- Why are some methods talking about "view templates" and others just "templates"?

### 2. **Job Queue Complexity**

```typescript
enqueueJob(type: string, data: unknown, options: JobOptions)
```

- What job types are available?
- What should `data` look like?
- Do I create my own job types?

### 3. **Entity Service Access**

```typescript
// Full service access
entityService: EntityService;

// But also registration method?
registerEntityType: <T extends BaseEntity>(...) => void;
```

- When do I use which?
- Can I access entities from other plugins?
- What about entity permissions?

## 🟢 What Works Well

### 1. **Clear Plugin Identity**

```typescript
pluginId: string;
logger: Logger;
```

Good - I know who I am and have logging

### 2. **Message Bus Pattern**

```typescript
sendMessage: MessageSender;
subscribe: // from IMessageBus
```

Clean pub/sub pattern for inter-plugin communication

### 3. **Type Safety**

Good use of TypeScript generics and Zod schemas

## 📋 What a Developer Really Needs

### Minimal Plugin Example:

```typescript
// What I ACTUALLY need for a basic plugin
interface MinimalPluginContext {
  pluginId: string;
  logger: Logger;

  // Storage
  storage: PluginStorage; // Scoped key-value store

  // Entities (if needed)
  entities: {
    register: (type: string, schema: ZodSchema) => void;
    create: (entity: BaseEntity) => Promise<string>;
    get: (type: string, id: string) => Promise<BaseEntity>;
    list: (type: string, filter?: Filter) => Promise<BaseEntity[]>;
  };

  // Messaging (if needed)
  messaging: {
    send: (type: string, data: unknown) => Promise<void>;
    subscribe: (type: string, handler: Handler) => void;
  };

  // UI (if needed)
  ui: {
    registerCommand: (command: Command) => void;
    registerView: (path: string, component: Component) => void;
  };
}
```

### Progressive Disclosure:

```typescript
// Basic context for simple plugins
interface PluginContext {
  pluginId: string;
  logger: Logger;
  storage: PluginStorage;
}

// Extended contexts for specific needs
interface EntityPluginContext extends PluginContext {
  entities: EntityOperations;
}

interface UIPluginContext extends PluginContext {
  ui: UIOperations;
}

interface JobPluginContext extends PluginContext {
  jobs: JobOperations;
}
```

## 🚀 Recommendations

### 1. **Split Into Focused Interfaces**

- Core: `PluginContext` (id, logger, storage)
- Features: `EntityContext`, `UIContext`, `JobContext`, etc.
- Let plugins request what they need

### 2. **Remove System-Wide Access**

- No `getAllCommands()`
- No `getActiveJobs()`
- No cross-plugin metadata access

### 3. **Consistent Abstraction Level**

Either:

- Expose services directly: `context.entityService`, `context.jobService`
- OR wrap everything: `context.entities.create()`, `context.jobs.enqueue()`

Don't mix both patterns!

### 4. **Clear Documentation**

```typescript
interface PluginContext {
  /**
   * Your plugin's unique identifier
   * @example "my-awesome-plugin"
   */
  pluginId: string;

  /**
   * Logger scoped to your plugin
   * @example logger.info("Plugin started")
   */
  logger: Logger;

  /**
   * Store plugin-specific data (automatically scoped)
   * @example await storage.set("config", { theme: "dark" })
   */
  storage: PluginStorage;
}
```

### 5. **Plugin Templates/Examples**

Provide templates for common plugin types:

- Entity plugin (like notes, tasks)
- UI plugin (adding commands/views)
- Integration plugin (external services)
- Tool plugin (MCP tools)

## 🎯 The Goal

A new developer should be able to:

1. Understand the interface in < 5 minutes
2. Create a working plugin in < 30 minutes
3. Not worry about breaking other plugins
4. Progressively add features as needed

Current state: 20+ methods to understand before starting
Desired state: 3-5 methods for a basic plugin
