# ServicePluginContext Namespacing Refactor

## Goal

Refactor all plugin context interfaces (CorePluginContext, ServicePluginContext, InterfacePluginContext) from flat 30+ method structures to logical namespaced groups for better DX and maintainability.

## Decision Summary

- **Migration:** Clean break - update all 16 plugins at once
- **Scope:** All contexts (Core, Service, Interface)
- **Namespaces:** `entities`, `jobs`, `ai`, `templates`, `messaging`, `views`, `eval`

---

## Namespace Structure

### CorePluginContext

```typescript
interface CorePluginContext {
  // Direct properties (unchanged)
  readonly pluginId: string;
  readonly logger: Logger;
  readonly dataDir: string;
  readonly entityService: ICoreEntityService;

  // Namespaced groups
  readonly identity: {
    get(): IdentityBody;
    getProfile(): ProfileBody;
    getAppInfo(): Promise<AppInfo>;
  };

  readonly jobs: {
    getActive(types?: string[]): Promise<JobInfo[]>;
    getActiveBatches(): Promise<Batch[]>;
    getBatchStatus(batchId: string): Promise<BatchJobStatus | null>;
    getStatus(jobId: string): Promise<JobInfo | null>;
  };

  readonly templates: {
    register(templates: Record<string, Template>): void;
    format<T>(templateName: string, data: T, options?): string;
    parse<T>(templateName: string, content: string): T;
  };

  readonly messaging: {
    send: MessageSender;
    subscribe<T, R>(channel: string, handler: MessageHandler<T, R>): () => void;
  };

  readonly conversations: {
    get(conversationId: string): Promise<Conversation | null>;
    search(query: string): Promise<Conversation[]>;
    getMessages(conversationId: string, options?): Promise<Message[]>;
  };

  // AI query
  readonly ai: {
    query(
      prompt: string,
      context?: Record<string, unknown>,
    ): Promise<DefaultQueryResponse>;
  };
}
```

### ServicePluginContext (extends Core)

```typescript
interface ServicePluginContext extends CorePluginContext {
  // Override with full entity service
  readonly entityService: IEntityService;

  // Entity management
  readonly entities: {
    register<T>(entityType: string, schema, adapter, config?): void;
    getAdapter<T>(entityType: string): EntityAdapter<T> | undefined;
    update<T>(entity: T): Promise<{ entityId: string; jobId: string }>;
    registerDataSource(dataSource: DataSource): void;
  };

  // Extends core jobs with write operations
  readonly jobs: CorePluginContext["jobs"] & {
    enqueue(
      type: string,
      data: unknown,
      toolContext: ToolContext | null,
      options?: JobOptions,
    ): Promise<string>;
    enqueueBatch(
      operations: BatchOperation[],
      options?: JobOptions,
    ): Promise<string>;
    registerHandler<T, R>(
      type: string,
      handler: JobHandler<string, T, R>,
    ): void;
  };

  // Extends core AI with generation
  readonly ai: CorePluginContext["ai"] & {
    generate<T>(config: ContentGenerationConfig): Promise<T>;
    generateImage(prompt: string, options?): Promise<ImageGenerationResult>;
    canGenerateImages(): boolean;
  };

  // Extends core templates with resolution
  readonly templates: CorePluginContext["templates"] & {
    resolve<T>(templateName: string, options?): Promise<T | null>;
    getCapabilities(templateName: string): TemplateCapabilities | null;
  };

  // View templates
  readonly views: {
    get(name: string): ViewTemplate<unknown> | undefined;
    list(): ViewTemplate<unknown>[];
    getRenderService(): RenderService;
  };

  // Evaluation
  readonly eval: {
    registerHandler(handlerId: string, handler: EvalHandler): void;
  };

  // Plugin metadata
  readonly plugins: {
    getPackageName(pluginId: string): string | undefined;
  };
}
```

### InterfacePluginContext (extends Core)

```typescript
interface InterfacePluginContext extends CorePluginContext {
  // Services
  readonly mcpTransport: IMCPTransport;
  readonly agentService: IAgentService;

  // Permissions
  readonly permissions: {
    getUserLevel(interfaceType: string, userId: string): UserPermissionLevel;
  };

  // Daemons
  readonly daemons: {
    register(name: string, daemon: Daemon): void;
  };

  // Jobs (same as ServicePluginContext)
  readonly jobs: CorePluginContext["jobs"] & {
    enqueue: EnqueueJobFn;
    enqueueBatch(
      operations: BatchOperation[],
      options?: JobOptions,
    ): Promise<string>;
    registerHandler<T, R>(
      type: string,
      handler: JobHandler<string, T, R>,
    ): void;
  };

  // Conversations with write operations
  readonly conversations: CorePluginContext["conversations"] & {
    start(
      conversationId: string,
      interfaceType: string,
      channelId: string,
      metadata,
    ): Promise<string>;
    addMessage(
      conversationId: string,
      role: MessageRole,
      content: string,
      metadata?,
    ): Promise<void>;
  };
}
```

---

## Before/After Examples

### Before (flat)

```typescript
async onRegister(context: ServicePluginContext): Promise<void> {
  context.registerEntityType("post", schema, adapter);
  context.registerTemplates({ "post-list": template });
  context.registerDataSource(dataSource);
  context.registerJobHandler("generation", handler);
  context.subscribe("entity:created", onCreated);
  const content = await context.generateContent<Post>(config);
  await context.enqueueJob("generation", data, toolContext);
}
```

### After (namespaced)

```typescript
async onRegister(context: ServicePluginContext): Promise<void> {
  context.entities.register("post", schema, adapter);
  context.entities.registerDataSource(dataSource);
  context.templates.register({ "post-list": template });
  context.jobs.registerHandler("generation", handler);
  context.messaging.subscribe("entity:created", onCreated);
  const content = await context.ai.generate<Post>(config);
  await context.jobs.enqueue("generation", data, toolContext);
}
```

---

## Implementation Strategy: Section by Section

Migrate **one namespace at a time** across all plugins. Each namespace is a focused, testable unit.

### Phase 1: `context.jobs.*` (highest usage: 14+ plugins)

**Flat methods to migrate:**

- `registerJobHandler()` → `context.jobs.registerHandler()`
- `enqueueJob()` → `context.jobs.enqueue()`
- `enqueueBatch()` → `context.jobs.enqueueBatch()`
- `getJobStatus()` → `context.jobs.getStatus()`
- `getActiveJobs()` → `context.jobs.getActive()`
- `getActiveBatches()` → `context.jobs.getActiveBatches()`
- `getBatchStatus()` → `context.jobs.getBatchStatus()`

**Steps:**

1. Add `JobNamespace` interface to `context-namespaces.ts`
2. Add `jobs` namespace to all three contexts
3. Update all plugins to use `context.jobs.*`
4. Remove flat job methods
5. Commit: `refactor(plugins): migrate to context.jobs namespace`

---

### Phase 2: `context.entities.*` (16 plugins)

**Flat methods to migrate:**

- `registerEntityType()` → `context.entities.register()`
- `getAdapter()` → `context.entities.getAdapter()`
- `updateEntity()` → `context.entities.update()`
- `registerDataSource()` → `context.entities.registerDataSource()`

**Steps:**

1. Add `EntityNamespace` interface
2. Add `entities` namespace to ServicePluginContext
3. Update all plugins to use `context.entities.*`
4. Remove flat entity methods
5. Commit: `refactor(plugins): migrate to context.entities namespace`

---

### Phase 3: `context.templates.*` (14+ plugins)

**Flat methods to migrate:**

- `registerTemplates()` → `context.templates.register()`
- `formatContent()` → `context.templates.format()`
- `parseContent()` → `context.templates.parse()`
- `resolveContent()` → `context.templates.resolve()`
- `getTemplateCapabilities()` → `context.templates.getCapabilities()`

**Steps:**

1. Add `TemplateNamespace` interface
2. Add `templates` namespace to Core and Service contexts
3. Update all plugins to use `context.templates.*`
4. Remove flat template methods
5. Commit: `refactor(plugins): migrate to context.templates namespace`

---

### Phase 4: `context.messaging.*` (8+ plugins)

**Flat methods to migrate:**

- `sendMessage()` → `context.messaging.send()`
- `subscribe()` → `context.messaging.subscribe()`

**Steps:**

1. Add `MessagingNamespace` interface
2. Add `messaging` namespace to CorePluginContext
3. Update all plugins to use `context.messaging.*`
4. Remove flat messaging methods
5. Commit: `refactor(plugins): migrate to context.messaging namespace`

---

### Phase 5: `context.ai.*` (8+ plugins)

**Flat methods to migrate:**

- `generateContent()` → `context.ai.generate()`
- `generateImage()` → `context.ai.generateImage()`
- `canGenerateImages()` → `context.ai.canGenerateImages()`
- `query()` → `context.ai.query()`

**Steps:**

1. Add `AINamespace` interface
2. Add `ai` namespace to Core and Service contexts
3. Update all plugins to use `context.ai.*`
4. Remove flat AI methods
5. Commit: `refactor(plugins): migrate to context.ai namespace`

---

### Phase 6: `context.identity.*` (used by system plugin)

**Flat methods to migrate:**

- `getIdentity()` → `context.identity.get()`
- `getProfile()` → `context.identity.getProfile()`
- `getAppInfo()` → `context.identity.getAppInfo()`

**Steps:**

1. Add `IdentityNamespace` interface
2. Add `identity` namespace to CorePluginContext
3. Update plugins to use `context.identity.*`
4. Remove flat identity methods
5. Commit: `refactor(plugins): migrate to context.identity namespace`

---

### Phase 7: `context.conversations.*` (Core read, Interface write)

**Flat methods to migrate:**

- `getConversation()` → `context.conversations.get()`
- `searchConversations()` → `context.conversations.search()`
- `getMessages()` → `context.conversations.getMessages()`
- `startConversation()` → `context.conversations.start()` (Interface only)
- `addMessage()` → `context.conversations.addMessage()` (Interface only)

**Steps:**

1. Add `ConversationNamespace` interface
2. Add `conversations` namespace to Core and Interface contexts
3. Update plugins to use `context.conversations.*`
4. Remove flat conversation methods
5. Commit: `refactor(plugins): migrate to context.conversations namespace`

---

### Phase 8: `context.views.*` (Service only)

**Flat methods to migrate:**

- `getViewTemplate()` → `context.views.get()`
- `listViewTemplates()` → `context.views.list()`
- `getRenderService()` → `context.views.getRenderService()`

**Steps:**

1. Add `ViewNamespace` interface
2. Add `views` namespace to ServicePluginContext
3. Update plugins to use `context.views.*`
4. Remove flat view methods
5. Commit: `refactor(plugins): migrate to context.views namespace`

---

### Phase 9: `context.eval.*` (7+ plugins)

**Flat methods to migrate:**

- `registerEvalHandler()` → `context.eval.registerHandler()`

**Steps:**

1. Add `EvalNamespace` interface
2. Add `eval` namespace to ServicePluginContext
3. Update plugins to use `context.eval.*`
4. Remove flat eval method
5. Commit: `refactor(plugins): migrate to context.eval namespace`

---

### Phase 10: Interface-specific namespaces

**`context.permissions.*` (Interface only):**

- `getUserPermissionLevel()` → `context.permissions.getUserLevel()`

**`context.daemons.*` (Interface only):**

- `registerDaemon()` → `context.daemons.register()`

**Steps:**

1. Add `PermissionNamespace` and `DaemonNamespace` interfaces
2. Add namespaces to InterfacePluginContext
3. Update interface plugins
4. Remove flat methods
5. Commit: `refactor(plugins): migrate to context.permissions and context.daemons namespaces`

---

### Phase 11: Cleanup and documentation

1. Remove any remaining flat method aliases
2. Update `shell/plugins/README.md`
3. Update `docs/plugin-system.md`
4. Update `docs/plugin-development-patterns.md`
5. Update `CLAUDE-PLUGINS-INTERFACES.md`
6. Commit: `docs(plugins): update documentation for namespaced context API`

---

## Files to Modify

### Core (6 files)

| File                                          | Changes                                   |
| --------------------------------------------- | ----------------------------------------- |
| `shell/plugins/src/context-namespaces.ts`     | NEW - All namespace interface definitions |
| `shell/plugins/src/core/context.ts`           | Add namespaces to CorePluginContext       |
| `shell/plugins/src/service/context.ts`        | Add namespaces to ServicePluginContext    |
| `shell/plugins/src/interface/context.ts`      | Add namespaces to InterfacePluginContext  |
| `shell/plugins/src/index.ts`                  | Export namespace types                    |
| `shell/plugins/src/service/service-plugin.ts` | Update helper methods to use namespaces   |

### Test Utilities (3 files)

| File                                              | Changes             |
| ------------------------------------------------- | ------------------- |
| `shell/plugins/test/harness/core-harness.ts`      | Update mock context |
| `shell/plugins/test/harness/service-harness.ts`   | Update mock context |
| `shell/plugins/test/harness/interface-harness.ts` | Update mock context |

### Plugins (16 files)

All plugins in `plugins/*/src/plugin.ts` or `plugins/*/src/index.ts`

### Documentation (4 files)

| File                                  | Changes               |
| ------------------------------------- | --------------------- |
| `shell/plugins/README.md`             | Update examples       |
| `docs/plugin-system.md`               | Update context docs   |
| `docs/plugin-development-patterns.md` | Update patterns       |
| `CLAUDE-PLUGINS-INTERFACES.md`        | Update interface docs |

---

## Verification

### Run after each step:

```bash
bun run typecheck
bun test shell/plugins/
```

### Run after all plugins migrated:

```bash
bun run typecheck
bun test
bun run lint
```

### Manual verification:

1. Start the app and verify plugins load
2. Test a few plugin tools via CLI or MCP
3. Verify job queue operations work

---

## Rollback Plan

If issues arise:

1. Git revert the commits
2. All changes are in tracked files
3. No database migrations required
