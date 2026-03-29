# Shared Plugin & Interface Patterns

These patterns apply to ALL plugin types (EntityPlugin, ServicePlugin, InterfacePlugin, MessageInterfacePlugin).

## Plugin Types

- **EntityPlugin** — Content types with schema, adapter, AI generation, derive()
- **ServicePlugin** — Infrastructure: tools, templates, views, external service connections
- **InterfacePlugin** — Transport layers: MCP, CLI, Discord, A2A, webserver

## Core Development Principles

### 1. Tool-First Architecture

- **EVERY feature MUST be exposed as an MCP tool**
- Commands are auto-generated from tools for message interfaces
- Never create command-only functionality

### 2. Entity-Driven Design

- Plugins that manage data MUST define entity types as EntityPlugins
- Use Zod schemas for all entity definitions
- Implement proper EntityAdapter for markdown serialization

### 3. Test-First Implementation

- Write tests using the provided harnesses BEFORE implementation
- Never access private members in tests
- Use `createPluginHarness()` for all plugin testing

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
    return { success: false, error: getErrorMessage(error) };
  }
}
```

## Essential Imports

```typescript
// Plugin framework
import {
  EntityPlugin,
  ServicePlugin,
  InterfacePlugin,
  type EntityPluginContext,
  type ServicePluginContext,
  type InterfacePluginContext,
  type Tool,
  createTool,
  toolSuccess,
  toolError,
} from "@brains/plugins";

// Utilities
import { z, createId } from "@brains/utils";
import type { Logger, ProgressReporter } from "@brains/utils";

// Testing
import { createPluginHarness } from "@brains/plugins/test";
import {
  createMockEntityPluginContext,
  createMockServicePluginContext,
} from "@brains/test-utils";
```

## Context Hierarchy

### BasePluginContext (shared by all)

- `logger`, `pluginId`, `dataDir`, `domain`, `siteUrl`, `previewUrl`
- `entityService` — Read-only entity service
- `identity.*` — Brain identity and profile access
- `messaging.*` — Inter-plugin communication
- `jobs.*` — Job queue (monitoring + scoped enqueue/registerHandler)
- `conversations.*` — Read-only conversation access
- `eval.*` — Test handler registration

### EntityPluginContext (extends Base)

- `entityService` — Full entity CRUD
- `entities.*` — Entity management (register, getAdapter, update, registerDataSource)
- `ai.*` — AI generation (query, generate, generateObject, generateImage)
- `prompts.*` — Prompt entity resolution

### ServicePluginContext (extends Base)

- `entityService` — Full entity CRUD
- `entities.*` — Entity management
- `templates.*` — Template operations (register, format, parse, resolve, getCapabilities)
- `views.*` — View template access and rendering
- `prompts.*` — Prompt entity resolution

### InterfacePluginContext (extends Base)

- `mcpTransport` — MCP transport access
- `agentService` — Agent service for AI interaction
- `permissions.*` — User permission checking
- `daemons.*` — Daemon registration
- `conversations.*` — Extended with write operations (start, addMessage)
- `tools.*` — List tools by permission level
- `apiRoutes.*` — Plugin API routes

## Architecture Checklist

Before submitting any plugin or interface:

- [ ] **Tool-first**: All functionality exposed as MCP tools
- [ ] **Entity schemas**: Defined with Zod for any managed data
- [ ] **Error handling**: No unhandled errors can crash shell
- [ ] **Test coverage**: Using provided harnesses, no private access
- [ ] **Message bus**: Events published for significant actions
- [ ] **Cleanup**: Resources released in shutdown method
- [ ] **Type safety**: Full TypeScript typing, no `any` types
- [ ] **Validation**: All inputs validated with Zod schemas
