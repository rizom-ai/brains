# Plan: System Tools as Framework (not a plugin)

## Context

The system plugin is not like other plugins. It doesn't integrate with an external service, and it doesn't define an entity type. It's the brain's own API — CRUD operations, search, query, job status, identity. Every method is a one-liner delegating to a context service:

```typescript
public async searchEntities(query) { return this.getContext().entityService.search(query); }
public async query(prompt)         { return this.getContext().ai.query(prompt); }
public getIdentityData()           { return this.getContext().identity.get(); }
public getEntityTypes()            { return this.getContext().entityService.getEntityTypes(); }
```

The plugin class is a pass-through. The real logic lives in the tools (`createSystemTools`), which call these methods. The methods exist only because tools can't access context directly — they receive the plugin instance.

This is framework code pretending to be a plugin.

## Problems with system as a plugin

1. **AI dependency** — system needs `context.ai.query()`, which means either PluginContext includes AI (bloating it for all plugins) or system stores it as a dependency (special case)
2. **Circular logic** — system registers tools that operate on the same services that created system's context
3. **Instructions** — system provides agent instructions about entity CRUD, but this is brain-level knowledge, not plugin-level
4. **Dashboard widgets** — system registers 4 dashboard widgets on `plugins:ready`. This is brain initialization, not plugin behavior
5. **MCP resources + prompts** — system registers entity resources and workflow prompts. These describe the brain itself, not a plugin
6. **Tools reference plugin instance** — `createSystemTools(this, this.id)` passes the plugin so tools can call its methods. A framework tool would just access services directly

## Design

Move system tools, resources, prompts, and instructions from a plugin into shell-level registration. No SystemPlugin class. The shell registers these directly after all plugins are initialized.

### What moves to the shell

| Current (system plugin)                                                        | New location                                             | Why                                          |
| ------------------------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------- |
| `system_create`, `system_update`, `system_delete`                              | `shell/core/src/system-tools.ts`                         | Core CRUD, registered directly on MCPService |
| `system_get`, `system_list`, `system_search`                                   | `shell/core/src/system-tools.ts`                         | Core query tools                             |
| `system_query`                                                                 | `shell/core/src/system-tools.ts`                         | AI query — uses agent service directly       |
| `system_job-status`                                                            | `shell/core/src/system-tools.ts`                         | Job queue introspection                      |
| `system_set-cover`                                                             | `shell/core/src/system-tools.ts` (after image migration) | Cross-entity operation                       |
| `system_extract`                                                               | `shell/core/src/system-tools.ts` (after derive() plan)   | Derived entity trigger                       |
| Entity resources (`entity://types`, `entity://{type}`, `entity://{type}/{id}`) | `shell/core/src/system-resources.ts`                     | Brain-level resources                        |
| Brain resources (`brain://identity`, `brain://profile`)                        | `shell/core/src/system-resources.ts`                     | Brain-level resources                        |
| MCP prompts (create, generate, review, publish, brainstorm)                    | `shell/core/src/system-prompts.ts`                       | Brain-level prompts                          |
| Agent instructions (entity CRUD guidance)                                      | `shell/core/src/system-instructions.ts`                  | Brain-level instructions                     |
| Dashboard widgets (entity-stats, character, profile, system-info)              | `shell/core/src/system-widgets.ts`                       | Brain initialization                         |

### How tools access services

Currently tools call `plugin.searchEntities()` which calls `context.entityService.search()`. After the move, tools receive services directly:

```typescript
// Before (via plugin)
const result = await plugin.searchEntities(query, options);

// After (direct service access)
export function createSystemTools(services: SystemServices): PluginTool[] {
  // ...
  handler: async (input) => {
    return services.entityService.search(query, options);
  };
}

interface SystemServices {
  entityService: IEntityService;
  aiService: IAIService; // for query()
  jobQueue: IJobQueueService;
  identityService: IIdentityService;
  conversationService: IConversationService;
  messaging: IMessagingService;
}
```

No plugin instance. No context. Just typed service references.

### Registration in shell

After all plugins are initialized, the shell registers system tools:

```typescript
// In shell initialization, after plugin registration
const systemTools = createSystemTools({
  entityService: this.services.entityService,
  aiService: this.services.aiService,
  jobQueue: this.services.jobQueue,
  identityService: this.services.identityService,
  conversationService: this.services.conversationService,
  messaging: this.services.messageBus,
});

for (const tool of systemTools) {
  this.services.mcpService.registerTool("system", tool);
}
```

Same for resources, prompts, and instructions.

### What happens to system plugin config

`SystemConfig` has `searchLimit` (default 10). This moves to shell config or brain definition — it's a brain-level setting, not a plugin setting.

### What this enables

- **PluginContext without AI** — no plugin needs `ai.query()` anymore. EntityPlugins use `ai.generate()` (for generation handlers). IntegrationPlugins don't need AI at all. The `ai` namespace on PluginContext becomes EntityPlugin-specific.
- **Simpler plugin count** — one fewer plugin to register, configure, and reason about
- **Clearer architecture** — system tools are visibly framework, not accidentally a plugin
- **No special cases** — system was the only IntegrationPlugin that needed AI. Removing it makes IntegrationPlugin a clean "tools + external services" category

## Steps

### Phase 1: Extract tools

1. Create `shell/core/src/system-tools.ts` with `createSystemTools(services)`
2. Move tool definitions from `plugins/system/src/tools/` — replace `plugin.xxx()` calls with direct service calls
3. Register tools in shell initialization after plugins
4. Tests (same tool behavior, different registration path)

### Phase 2: Extract resources + prompts + instructions

1. Create `shell/core/src/system-resources.ts`, `system-prompts.ts`, `system-instructions.ts`
2. Move from system plugin's `onRegister`, `getResources`, `getInstructions`
3. Register in shell initialization
4. Tests

### Phase 3: Extract dashboard widgets

1. Create `shell/core/src/system-widgets.ts`
2. Move widget registration from system plugin's `onRegister`
3. Register on `system:plugins:ready` from shell
4. Tests

### Phase 4: Delete system plugin

1. Remove `plugins/system/` directory
2. Remove system from brain model registrations (rover, ranger, relay)
3. Move `searchLimit` config to brain definition or shell config
4. Update eval test cases that reference system plugin
5. Update docs

## What does NOT change

- Tool names stay `system_*` — no breaking change for the agent or eval test cases
- Resources, prompts, instructions stay identical
- MCP clients see the same tools, resources, prompts
- Plugin authors don't notice — system tools are just "there"

## Verification

1. `bun test` — all tests pass
2. `bun run typecheck` / `bun run lint`
3. `system_create`, `system_get`, `system_list`, `system_search`, `system_update`, `system_delete` all work
4. `system_query` works (AI query)
5. MCP resources browsable in MCP Inspector
6. MCP prompts visible in Claude Desktop
7. Agent instructions include entity CRUD guidance
8. Dashboard widgets render correctly
9. No `SystemPlugin` class exists
10. System not registered as a plugin in any brain model
11. PluginContext has no `ai` namespace (AI is EntityPlugin-specific or passed as dependency)
