# Shared Plugin & Interface Patterns

These patterns apply to ALL plugin types (CorePlugin, ServicePlugin, InterfacePlugin, MessageInterfacePlugin).

## Core Development Principles

### 1. Tool-First Architecture

- **EVERY feature MUST be exposed as an MCP tool**
- Commands are auto-generated from tools for message interfaces
- Never create command-only functionality
- Tools define the contract, interfaces consume them

### 2. Entity-Driven Design

- Plugins that manage data MUST define entity types
- Use Zod schemas for all entity definitions
- Implement proper EntityAdapter for markdown serialization
- Register entities during plugin initialization

### 3. Test-First Implementation

- Write tests using the provided harnesses BEFORE implementation
- Never access private members in tests
- Use `createCorePluginHarness()` for CorePlugin testing
- Use `createServicePluginHarness()` for ServicePlugin testing
- Use `createInterfacePluginHarness()` for InterfacePlugin testing

## Error Handling

**NEVER let errors crash the shell:**

```typescript
async handleTool(input: unknown): Promise<ToolResult> {
  try {
    const params = schema.parse(input);
    const result = await this.process(params);
    return { success: true, data: result };
  } catch (error) {
    this.context.logger.error("Tool execution failed", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
```

## Common Patterns

### DO

1. **Use dependency injection via context**

   ```typescript
   const { entityService, aiService } = this.context;
   ```

2. **Validate all inputs with Zod**

   ```typescript
   const params = inputSchema.parse(input);
   ```

3. **Return consistent result objects**

   ```typescript
   return { success: true, data: result };
   return { success: false, error: "message" };
   ```

4. **Clean up resources in shutdown**

   ```typescript
   async shutdown(): Promise<void> {
     this.subscriptions.forEach(sub => sub.unsubscribe());
   }
   ```

5. **Use test harnesses for testing**
   ```typescript
   const harness = createCorePluginHarness();
   ```

### DON'T

1. **Access private members in tests**

   ```typescript
   // WRONG
   (plugin as any).privateMethod();
   // RIGHT
   await harness.executeTool("public_tool", {});
   ```

2. **Throw errors that crash the shell**

   ```typescript
   // WRONG
   throw new Error("Fatal error");
   // RIGHT
   return { success: false, error: "Error message" };
   ```

3. **Create commands without tools**

   ```typescript
   // WRONG - Tools auto-generate commands
   commandRegistry.register({ name: "cmd", handler: ... });
   ```

4. **Forget to validate entity types**

   ```typescript
   // WRONG
   const entity = data as MyEntity;
   // RIGHT
   const entity = myEntitySchema.parse(data);
   ```

5. **Use setTimeout/setInterval directly**
   ```typescript
   // WRONG
   setTimeout(() => poll(), 1000);
   // RIGHT - Use daemons for long-running processes
   daemonRegistry.registerDaemon({ start, stop });
   ```

## Essential Imports

```typescript
// Plugin framework
import {
  ServicePlugin,
  CorePlugin,
  InterfacePlugin,
  MessageInterfacePlugin,
  type ServicePluginContext,
  type CorePluginContext,
  type InterfacePluginContext,
  type PluginTool,
  createTypedTool,
} from "@brains/plugins";

// Utilities
import { z, createId, PROGRESS_STEPS, JobResult } from "@brains/utils";
import type { Logger, ProgressReporter } from "@brains/utils";

// Testing
import { createCorePluginHarness } from "@brains/plugins/test";
import { createServicePluginHarness } from "@brains/plugins/test";
import { createInterfacePluginHarness } from "@brains/plugins/test";
import { describe, it, expect, beforeEach } from "bun:test";
```

## Context Namespaces

### CorePluginContext (base for all)

- `logger` - Logging service
- `entityService` - Read-only entity service
- `identity.*` - Brain identity and profile access
- `ai.query()` - AI query operations
- `conversations.*` - Read-only conversation access
- `templates.*` - Template operations
- `messaging.*` - Inter-plugin communication
- `jobs.*` - Job monitoring (read-only)

### ServicePluginContext (extends Core)

- `entityService` - Full entity CRUD service
- `entities.*` - Entity management (register, getAdapter, update)
- `ai.*` - Extended AI (generate, generateImage)
- `jobs.*` - Extended (enqueue, registerHandler)
- `views.*`, `plugins.*`, `eval.*`

### InterfacePluginContext (extends Core)

- `mcpTransport` - MCP transport access
- `agentService` - Agent service for queries
- `permissions.*` - Permission checking
- `daemons.*` - Daemon management
- `conversations.*` - Extended with write operations (start, addMessage)

## Architecture Checklist

Before submitting any plugin or interface:

- [ ] **Tool-first**: All functionality exposed as MCP tools
- [ ] **Entity schemas**: Defined with Zod for any managed data
- [ ] **Error handling**: No unhandled errors can crash shell
- [ ] **Test coverage**: Using provided harnesses, no private access
- [ ] **Message bus**: Events published for significant actions
- [ ] **Cleanup**: Resources released in shutdown method
- [ ] **Documentation**: Clear descriptions for all tools/resources
- [ ] **Type safety**: Full TypeScript typing, no `any` types
- [ ] **Validation**: All inputs validated with Zod schemas
