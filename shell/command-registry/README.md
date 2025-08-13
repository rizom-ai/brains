# @brains/command-registry

Command registration and execution system for Personal Brain shell.

## Overview

This package provides a centralized registry for commands that can be executed within the Brain shell. It handles command registration, validation, execution, and provides command discovery capabilities.

## Features

- Command registration with metadata
- Parameter validation using Zod schemas
- Command aliases and shortcuts
- Command history tracking
- Auto-completion support
- Command chaining and pipelines
- Help text generation

## Installation

```bash
bun add @brains/command-registry
```

## Usage

```typescript
import { CommandRegistry } from "@brains/command-registry";
import { z } from "zod";

const registry = CommandRegistry.getInstance();

// Register a command
registry.register({
  name: "search",
  description: "Search for entities",
  aliases: ["find", "query"],
  parameters: z.object({
    query: z.string(),
    type: z.string().optional(),
    limit: z.number().default(10),
  }),
  handler: async (params) => {
    const results = await entityService.search(params);
    return results;
  },
});

// Execute command
const result = await registry.execute("search", {
  query: "typescript",
  limit: 20,
});
```

## Command Definition

```typescript
interface CommandDefinition {
  name: string; // Command name
  description: string; // Help text
  aliases?: string[]; // Alternative names
  category?: string; // Command category
  parameters?: z.ZodSchema; // Parameter schema
  handler: CommandHandler; // Execution function
  middleware?: Middleware[]; // Pre-execution hooks
  permissions?: string[]; // Required permissions
}

type CommandHandler = (params: any, context: CommandContext) => Promise<any>;

interface CommandContext {
  user?: User;
  source: string; // "cli" | "api" | "plugin"
  timestamp: Date;
  metadata?: Record<string, any>;
}
```

## Registration

### Basic Registration

```typescript
registry.register({
  name: "create-note",
  description: "Create a new note",
  parameters: z.object({
    title: z.string(),
    content: z.string(),
    tags: z.array(z.string()).optional(),
  }),
  handler: async (params) => {
    return await entityService.create({
      type: "note",
      ...params,
    });
  },
});
```

### Batch Registration

```typescript
registry.registerBatch([
  { name: "list", handler: listHandler },
  { name: "get", handler: getHandler },
  { name: "update", handler: updateHandler },
  { name: "delete", handler: deleteHandler },
]);
```

### Plugin Commands

```typescript
// Plugins can register commands
class MyPlugin {
  registerCommands(registry: CommandRegistry) {
    registry.register({
      name: `${this.name}:action`,
      handler: this.handleAction.bind(this),
    });
  }
}
```

## Execution

### Direct Execution

```typescript
// Execute with parameters
const result = await registry.execute("create-note", {
  title: "My Note",
  content: "Content here",
});

// Execute with context
const result = await registry.execute(
  "delete",
  { id: "123" },
  { user: currentUser, source: "api" },
);
```

### Command Chaining

```typescript
// Chain multiple commands
const pipeline = registry
  .chain()
  .execute("search", { query: "typescript" })
  .execute("filter", { published: true })
  .execute("sort", { by: "created", order: "desc" });

const results = await pipeline.run();
```

### Async Queue

```typescript
// Queue commands for background execution
const jobId = await registry.queue("import", {
  path: "/large/dataset",
});

// Check status
const status = await registry.getJobStatus(jobId);
```

## Validation

### Parameter Validation

```typescript
registry.register({
  name: "config",
  parameters: z.object({
    key: z.string().regex(/^[a-z]+\.[a-z]+$/),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
  handler: async (params) => {
    // params are validated and typed
  },
});
```

### Custom Validators

```typescript
registry.addValidator("permission", async (command, context) => {
  if (command.permissions) {
    const hasPermission = await checkPermissions(
      context.user,
      command.permissions,
    );
    if (!hasPermission) {
      throw new Error("Permission denied");
    }
  }
});
```

## Discovery

### List Commands

```typescript
// Get all commands
const commands = registry.list();

// Filter by category
const entityCommands = registry.list({ category: "entity" });

// Search commands
const matches = registry.search("create");
```

### Help System

```typescript
// Get command help
const help = registry.getHelp("search");
console.log(help);
// Output:
// Command: search
// Description: Search for entities
// Aliases: find, query
// Parameters:
//   query (string) - Search query [required]
//   type (string) - Entity type [optional]
//   limit (number) - Result limit [default: 10]

// Generate all help text
const allHelp = registry.generateHelp();
```

## Auto-completion

```typescript
// Get completions for partial command
const completions = registry.complete("cre");
// Returns: ["create-note", "create-task", "create-project"]

// Get parameter completions
const paramCompletions = registry.completeParams("search", {
  query: "type",
});
// Returns available entity types
```

## Middleware

### Global Middleware

```typescript
// Add logging middleware
registry.use(async (command, params, context, next) => {
  console.log(`Executing: ${command.name}`);
  const start = Date.now();
  const result = await next();
  console.log(`Completed in ${Date.now() - start}ms`);
  return result;
});
```

### Command Middleware

```typescript
registry.register({
  name: "admin-action",
  middleware: [requireAuth, requireRole("admin"), auditLog],
  handler: async (params) => {
    // Protected handler
  },
});
```

## History

```typescript
// Enable history tracking
registry.enableHistory({ maxSize: 100 });

// Get command history
const history = registry.getHistory();

// Replay last command
const last = registry.getLastCommand();
await registry.replay(last);

// Clear history
registry.clearHistory();
```

## Events

```typescript
registry.on("command:registered", (command) => {
  console.log(`New command: ${command.name}`);
});

registry.on("command:executed", (event) => {
  console.log(`Executed: ${event.command} in ${event.duration}ms`);
});

registry.on("command:failed", (event) => {
  console.error(`Failed: ${event.command}`, event.error);
});
```

## Testing

```typescript
import { CommandRegistry } from "@brains/command-registry";

const registry = CommandRegistry.createFresh();

// Mock command
registry.register({
  name: "test",
  handler: jest.fn().mockResolvedValue({ success: true }),
});

// Test execution
const result = await registry.execute("test", { foo: "bar" });
expect(result).toEqual({ success: true });
```

## Exports

- `CommandRegistry` - Main registry class
- `CommandDefinition` - Command type definition
- `CommandContext` - Execution context type
- `CommandValidator` - Validation utilities
- Helper functions and types

## License

MIT
