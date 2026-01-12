# Plugin Layer Improvement Plan

## Status

### Completed: Context Namespacing Refactor ✅

All plugin context interfaces have been migrated from flat 30+ method structures to logical namespaced groups:

- `context.entities.*` - Entity management (Service)
- `context.jobs.*` - Job queue operations (Core read, Service/Interface write)
- `context.ai.*` - AI operations (Core query, Service generate)
- `context.templates.*` - Template operations (Core format/parse, Service resolve)
- `context.messaging.*` - Inter-plugin messaging (Core)
- `context.conversations.*` - Conversation access (Core read, Interface write)
- `context.identity.*` - Brain identity (Core)
- `context.views.*` - View templates (Service)
- `context.eval.*` - Evaluation handlers (Service)
- `context.plugins.*` - Plugin metadata (Service)
- `context.permissions.*` - Permission checking (Interface)
- `context.daemons.*` - Daemon management (Interface)

Commits: Phases 1-11 completed, documentation updated.

---

## Current: Plugin Layer Improvements

### Phase 1: Core Improvements

#### 1. Standardized Tool Response Format

**Problem**: Inconsistent response formats across 15+ plugins

- Some use: `{ status, data, formatted }`
- Some use: `{ success, data, error }`
- Some use: `{ status, message, data }`

**Solution**: Create `ToolResult<T>` type and enforce via `createTool` helper

```typescript
type ToolResult<T> =
  | { success: true; data: T; formatted?: string }
  | { success: false; error: string; code?: string };
```

**Files**: `shell/plugins/src/utils/tool-helpers.ts`, all plugin tools

---

#### 2. Tool Input Auto-Validation

**Problem**: Schema validation happens twice in every tool

```typescript
createTool(id, "action", "desc", inputSchema, async (input) => {
  const parsed = inputSchema.parse(input); // Redundant - already validated
});
```

**Solution**: Pass pre-validated, typed input to handler

```typescript
createTool(
  id,
  "action",
  "desc",
  inputSchema,
  async (parsed: z.infer<typeof inputSchema>) => {
    // Already validated and typed
  },
);
```

**Files**: `shell/plugins/src/utils/tool-helpers.ts`

---

#### 3. Fix Jobs Hierarchy Inconsistency

**Problem**: ServicePluginContext and InterfacePluginContext both define `jobs.enqueue`, `jobs.registerHandler`, `jobs.enqueueBatch` separately

**Solution**: Create shared `IJobsWriteNamespace` type that both extend

```typescript
interface IJobsWriteNamespace extends IJobsNamespace {
  enqueue: EnqueueJobFn;
  enqueueBatch(
    operations: BatchOperation[],
    options?: JobOptions,
  ): Promise<string>;
  registerHandler<T, R>(type: string, handler: JobHandler<string, T, R>): void;
}
```

**Files**: `shell/plugins/src/core/context.ts`, `shell/plugins/src/service/context.ts`, `shell/plugins/src/interface/context.ts`

---

#### 4. Replace `views.getRenderService()` with `views.render()`

**Problem**: `views.getRenderService()` leaks internal service instead of controlled interface

**Solution**: Add `views.render()` method, remove `getRenderService()`

```typescript
// Current (leaky)
const service = context.views.getRenderService();
const output = service.render(template, data, "html");

// Better (controlled)
const output = context.views.render("template-name", data, "html");
```

**Files**: `shell/plugins/src/service/context.ts`, update any plugins using `getRenderService()`

---

#### 5. Merge CorePlugin into ServicePlugin

**Problem**: Three plugin types (Core, Service, Interface) but CorePlugin is barely used - only `system` plugin

**Solution**: Reduce to two plugin types

- **ServicePlugin** - The default for all feature plugins
- **InterfacePlugin** - For CLI, MCP, Matrix, etc.

CorePluginContext remains as shared base type that both extend.

```
Before: CorePlugin, ServicePlugin, InterfacePlugin (3 types)
After:  ServicePlugin, InterfacePlugin (2 types)
```

**Migration**: `system` plugin becomes ServicePlugin (it doesn't use entity write operations, but that's fine)

**Files**:

- `shell/plugins/src/core/core-plugin.ts` - deprecate/remove
- `plugins/system/src/plugin.ts` - extend ServicePlugin
- Update documentation

---

### Phase 2: Developer Experience

#### 6. Typed Message Channels

**Problem**: Manual schema validation for every message subscription

```typescript
context.messaging.subscribe("entity:created", async (msg) => {
  const payload = entityCreatedSchema.parse(msg.payload); // Every time
});
```

**Solution**: Type-safe channel definitions

```typescript
// Define channel with schema
const EntityCreatedChannel = defineChannel(
  "entity:created",
  entityCreatedSchema,
);

// Subscribe with automatic validation
context.messaging.subscribe(EntityCreatedChannel, async (payload) => {
  // payload already typed as z.infer<typeof entityCreatedSchema>
});
```

**Files**: `shell/plugins/src/core/context.ts`, NEW `shell/plugins/src/utils/channels.ts`

---

### Phase 3: Low Priority

#### 7. Testing Harness Improvements

**Problem**:

- Must create full MockShell to test one namespace
- No spy/assertion helpers
- No fixture builders

**Solution**:

```typescript
// Partial mocking
const harness = createServicePluginHarness({
  mocks: {
    entityService: customMock,
    // Other services use defaults
  },
});

// Assertion helpers
expect(harness.jobs.enqueue).toHaveBeenCalledWith("type", expect.any(Object));

// Fixture builder
const entity = harness.fixtures.createEntity("note", { title: "Test" });
```

**Files**: `shell/plugins/test/harness/*.ts`, `shared/test-utils/`

---

### Later (Optional)

#### 8. Error Codes in PluginError

**Problem**: Only `PluginError` exists, no categorization

**Solution**: Add error codes for programmatic handling

```typescript
type PluginErrorCode =
  | "VALIDATION_ERROR"      // Bad input
  | "NOT_FOUND"             // Entity/resource missing
  | "PERMISSION_DENIED"     // Access control
  | "EXTERNAL_SERVICE"      // Third-party failure
  | "INTERNAL_ERROR";       // Plugin bug

class PluginError extends Error {
  constructor(
    message: string,
    public code: PluginErrorCode,
    public recoverable: boolean = false,
    public cause?: Error
  ) { ... }
}
```

**Files**: `shell/plugins/src/errors.ts`, all plugin error handling

---

## Dropped Items

| Item                      | Reason                                               |
| ------------------------- | ---------------------------------------------------- |
| Plugin discovery API      | No concrete use case, messaging handles coordination |
| Entity plugin builder     | 4 explicit lines is clear, builder adds indirection  |
| Job statistics API        | No current need for queue observability              |
| Other abstraction cleanup | Not causing problems, just underutilized             |

---

## Files to Modify

### Phase 1

| File                                      | Changes                                  |
| ----------------------------------------- | ---------------------------------------- |
| `shell/plugins/src/utils/tool-helpers.ts` | ToolResult type, auto-validation         |
| `shell/plugins/src/core/context.ts`       | IJobsWriteNamespace                      |
| `shell/plugins/src/service/context.ts`    | Use shared jobs type, add views.render() |
| `shell/plugins/src/interface/context.ts`  | Use shared jobs type                     |
| `shell/plugins/src/core/core-plugin.ts`   | Deprecate                                |
| `plugins/system/src/plugin.ts`            | Extend ServicePlugin                     |

### Phase 2

| File                                  | Changes                    |
| ------------------------------------- | -------------------------- |
| `shell/plugins/src/utils/channels.ts` | NEW - defineChannel helper |
| `shell/plugins/src/core/context.ts`   | Typed subscribe overload   |

### Phase 3

| File                              | Changes                   |
| --------------------------------- | ------------------------- |
| `shell/plugins/test/harness/*.ts` | Partial mocking, fixtures |
| `shared/test-utils/src/*.ts`      | Assertion helpers         |

---

## Success Criteria

1. All tool responses use consistent `ToolResult<T>` format
2. No duplicate schema validation in tool handlers
3. Only two plugin types: ServicePlugin and InterfacePlugin
4. `views.render()` replaces `views.getRenderService()`
5. Jobs write operations defined once, shared by Service and Interface
6. Test coverage maintained
