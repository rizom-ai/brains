# @brains/plugins

Base classes and utilities for Brain plugin development.

## Plugin Types

### EntityPlugin

Content types — schema, adapter, AI generation, and explicit derived-entity projections.

```typescript
import { EntityPlugin } from "@brains/plugins";

export class MyPlugin extends EntityPlugin<MyEntity> {
  readonly entityType = "my-entity";
  readonly schema = myEntitySchema;
  readonly adapter = new MyAdapter();

  protected createGenerationHandler(context) {
    return new MyGenerationHandler(context);
  }
}
```

**Context: `EntityPluginContext`** — entities, ai, prompts, jobs, messaging

### ServicePlugin

Infrastructure — tools, templates, views, external service connections.

```typescript
import { ServicePlugin, createTool, toolSuccess } from "@brains/plugins";

export class MyPlugin extends ServicePlugin<MyConfig> {
  protected override async onRegister(context) {
    // register templates, subscribe to messages, etc.
  }

  protected override async getTools() {
    return [createTool(this.id, "my-tool", "Description", schema, handler)];
  }
}
```

**Context: `ServicePluginContext`** — entities, templates, views, prompts, jobs, messaging

### InterfacePlugin

Transport layers — MCP, CLI, Discord, A2A, webserver.

```typescript
import { InterfacePlugin } from "@brains/plugins";

export class MyInterface extends InterfacePlugin<MyConfig> {
  protected override async onRegister(context) {
    context.daemons.register("my-daemon", myDaemon);
  }
}
```

**Context: `InterfacePluginContext`** — mcpTransport, agentService, daemons, permissions, conversations (read+write), tools, apiRoutes

## Context Hierarchy

All three contexts share `BasePluginContext`:

- `pluginId`, `logger`, `dataDir`, `domain`, `siteUrl`, `previewUrl`
- `entityService` (read-only)
- `identity` (get, getProfile, getAppInfo)
- `messaging` (send, subscribe)
- `jobs` (enqueue, enqueueBatch, registerHandler, monitoring)
- `conversations` (read-only)
- `eval` (registerHandler)

Each sibling adds only what it needs:

| Capability                              | Entity | Service | Interface |
| --------------------------------------- | ------ | ------- | --------- |
| `ai` (generate, generateImage)          | ✅     | —       | —         |
| `templates` (register, format, resolve) | —      | ✅      | —         |
| `views`                                 | —      | ✅      | —         |
| `prompts.resolve`                       | ✅     | ✅      | —         |
| `mcpTransport` / `agentService`         | —      | —       | ✅        |
| `daemons`                               | —      | —       | ✅        |
| `conversations` (write)                 | —      | —       | ✅        |

## Testing

```typescript
import { createPluginHarness } from "@brains/plugins/test";

const harness = createPluginHarness({ dataDir: "/tmp/test" });
await harness.installPlugin(new MyPlugin());

// For entity plugins
const context = harness.getEntityContext("my-entity");

// For service plugins
const context = harness.getServiceContext("my-plugin");
```

Mock contexts for unit testing:

```typescript
import { createMockEntityPluginContext } from "@brains/test-utils";
import { createMockServicePluginContext } from "@brains/test-utils";
```

## Exports

- **Classes**: `EntityPlugin`, `ServicePlugin`, `InterfacePlugin`, `MessageInterfacePlugin`, `BasePlugin`
- **Contexts**: `BasePluginContext`, `EntityPluginContext`, `ServicePluginContext`, `InterfacePluginContext`
- **Tools**: `createTool`, `createResource`, `toolSuccess`, `toolError`
- **Types**: `Tool`, `Resource`, `ResourceTemplate`, `Prompt`, `ToolContext`, `ToolResponse`
