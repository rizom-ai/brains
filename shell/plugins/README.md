# @brains/plugins

The plugin runtime: the declarative definitions every package is written with, the adapters that register them, and the contexts, registries and test harness behind them.

## Package families

Every package under `entities/`, `plugins/` and `interfaces/` is a declarative definition, imported through `@brains/sdk`. Each family has one internal adapter that registers it; the adapters share one internal core, `PluginCore`, which no entry exports.

### Entity packages

Content types: schema, markdown adapter, generation, projections, templates and data sources.

```typescript
import { defineEntity, defineEntityPackage, z } from "@brains/sdk/entities";

const memo = defineEntity({
  type: "memo",
  purpose: "A short note.",
  metadata: z.object({ title: z.string() }),
});

export default defineEntityPackage({ id: "memos", entities: [memo] });
```

**Context: `EntityPluginContext`** — entities, ai, prompts, jobs, messaging

### Services

Tools, jobs, routes and external service connections.

```typescript
import { defineServicePlugin, z } from "@brains/sdk/services";

export default defineServicePlugin(
  { id: "digests", config: z.object({}), setup: () => ({}) },
  { tools: () => [] },
);
```

**Context: `ServicePluginContext`** — entities, templates, views, prompts, jobs, messaging

### Interfaces

Transport layers — MCP, chat, A2A, email, web chat. The runtime itself hosts HTTP (`@brains/http-host`); interfaces declare the routes it serves. `defineInterface` declares routes and daemons; `defineMessageInterface` declares a channel, its listener and its sender, and the runtime coordinates job progress, tool statuses and held-back completions for it.

**Context: `InterfacePluginContext`** — mcpTransport, agentService, daemons, permissions, conversations (read+write), tools, apiRoutes

First-party packages reach runtime capabilities the public API leaves out through `@brains/sdk/internal/*` (`serviceRuntime`, `entityRuntime`, `interfaceRuntime`, `withSiteRuntime`), each tracked in `docs/legacy-code-inventory.json`.

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

## Analytics reports

`system_analytics` answers aggregate questions through typed reports. Core registers `overview`, `publishing-cadence` and `content-health`; a plugin adds its own in `onRegister`:

```typescript
context.analytics.register(
  defineAnalyticsReport({ type, description, params, minVisibility, handler }),
);
```

- The tool's input schema is built after plugins register: `type` is an enum of every report, and `params` shows each report's fields.
- The registry (`AnalyticsRegistry`) validates params against the report's own schema and refuses a caller below its `minVisibility`.
- The handler receives a read-only entity service and the caller's `visibilityScope`. A public caller reads published entities only.
- Report definitions carry no output schema. A consumer that renders a report, such as Studio's Traffic workspace, parses it with its own schema, so drift fails that consumer.

## Testing

```typescript
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";

const harness = createPluginHarness({ dataDir: "/tmp/test" });
for (const plugin of instantiatePluginPackageDefinition(
  definition,
  {},
  {
    name: "@example/memos",
    version: "0.1.0",
  },
)) {
  await harness.installPlugin(plugin);
}

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

- **Definitions**: `defineEntity`, `defineEntityPackage`, `defineServicePlugin`, `defineInterface`, `defineMessageInterface`, `defineDataSource`, `defineSharedState`
- **Contexts**: `BasePluginContext`, `EntityPluginContext`, `ServicePluginContext`, `InterfacePluginContext`
- **Tools**: `createTool`, `createResource`, `toolSuccess`, `toolError`
- **Types**: `Tool`, `Resource`, `ResourceTemplate`, `Prompt`, `ToolContext`, `ToolResponse`
