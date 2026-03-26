# Plan: System Tools as Framework (not a plugin)

## Context

The system plugin is not like other plugins. It doesn't integrate with an external service, and it doesn't define an entity type. It's the brain's own API — CRUD operations, search, query, job status, identity. Every method is a one-liner delegating to a context service:

```typescript
public async searchEntities(query) { return this.getContext().entityService.search(query); }
public async query(prompt)         { return this.getContext().ai.query(prompt); }
public getIdentityData()           { return this.getContext().identity.get(); }
```

The plugin class is a pass-through. This is framework code pretending to be a plugin.

## Design

Move system tools from `plugins/system/` to `shell/core/src/system/`. The shell registers them during initialization using the same message bus pattern that plugins use — one execution path, no special cases.

### How it works

The shell does exactly what `BasePlugin.setupMessageHandlers()` does, but without a plugin class:

```typescript
// In shell initialization, after plugins
const systemTools = createSystemTools(services);

for (const tool of systemTools) {
  // Register on MCP service (agent + MCP clients see these tools)
  mcpService.registerTool("system", tool);
}

// Subscribe to tool execution (same pattern as BasePlugin)
messageBus.subscribe("plugin:system:tool:execute", async (msg) => {
  const { toolName, args, interfaceType, userId, channelId } = msg.payload;
  const tool = systemTools.find((t) => t.name === toolName);
  if (!tool) return { success: false, error: `Tool not found: ${toolName}` };
  const result = await tool.handler(args, { interfaceType, userId, channelId });
  return { success: true, data: result };
});
```

Same message bus routing. Same tool execution path. Same MCP registration. Just no plugin class wrapping it.

### Tool handlers access services directly

```typescript
// Before (via plugin)
const result = await plugin.searchEntities(query, options);

// After (direct service access)
const result = await services.entityService.search(query, options);
```

```typescript
interface SystemServices {
  entityService: IEntityService;
  aiService: IAIService;
  jobQueueService: IJobQueueService;
  conversationService: IConversationService;
  identityService: IIdentityService;
  messageBus: IMessageBus;
  logger: Logger;
  searchLimit: number;
}
```

No plugin instance. No context. Just typed service references.

### Where it lives

```
shell/core/src/system/
  tools.ts            — tool definitions (create, get, list, search, update, delete, extract, set-cover)
  resources.ts        — MCP resources (entity://types, brain://identity, brain://profile, entity templates)
  prompts.ts          — MCP prompts (create, generate, review, publish, brainstorm)
  instructions.ts     — agent instructions for entity CRUD
  widgets.ts          — dashboard widget registration
  register.ts         — wires everything up during shell initialization
```

`register.ts` is called from `shellInitializer.ts` after plugins are initialized. It creates the tools, registers them on MCP service, subscribes to the message bus, and registers resources/prompts/instructions/widgets.

### What this enables

- **No AI on PluginContext** — system was the only plugin that needed `ai.query()`. Now it's a direct service call.
- **One fewer plugin** — brain models don't register system, it's always there
- **Clearer architecture** — system tools are visibly framework, not accidentally a plugin
- **Same execution path** — message bus routing unchanged, no special `registerDirectTool()`

### What stays the same

- Tool names: `system_*`
- Message bus pattern: `plugin:system:tool:execute`
- MCP registration: `mcpService.registerTool("system", tool)`
- Agent sees the same tools
- Resources, prompts, instructions identical
- Dashboard widgets identical

### What changes

- No `SystemPlugin` class
- No `plugins/system/` directory
- Brain models don't register system (shell always includes it)
- `SystemConfig.searchLimit` moves to brain definition or shell config
- Tool handlers call services directly instead of through plugin methods

## Steps

1. Create `shell/core/src/system/tools.ts` — tool definitions with direct service access
2. Create `shell/core/src/system/resources.ts` — MCP resources
3. Create `shell/core/src/system/prompts.ts` — MCP prompts
4. Create `shell/core/src/system/instructions.ts` — agent instructions
5. Create `shell/core/src/system/widgets.ts` — dashboard widgets
6. Create `shell/core/src/system/register.ts` — wires everything up
7. Call `registerSystemTools()` from `shellInitializer.ts` after plugin initialization
8. Verify all tools work (same behavior, different registration path)
9. Delete `plugins/system/` directory
10. Remove system from brain model registrations (rover, ranger, relay)
11. Update tests — move relevant tests to `shell/core/test/system/`

## Verification

1. `bun test` — all tests pass
2. `bun run typecheck` / `bun run lint`
3. All system tools work via MCP Inspector
4. Agent can call system tools (same tool names)
5. MCP resources browsable
6. MCP prompts visible
7. Dashboard widgets render
8. No `SystemPlugin` class exists
9. System not registered as a plugin in any brain model
10. PluginContext has no `ai` namespace
