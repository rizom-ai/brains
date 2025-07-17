# PluginContext DX Improvement Plan

## Current State Analysis

The current `PluginContext` interface has **35+ methods** that provide comprehensive functionality but suffer from several Developer Experience (DX) issues that make it difficult for plugin developers to understand and use effectively.

Based on analysis of actual plugin usage in the codebase, **~40% of methods are never used**, indicating significant interface bloat.

## Method Usage Analysis

### ✅ **Essential Methods (used by multiple plugins):**

- **Core lifecycle**: `pluginId`, `logger`, `sendMessage`, `subscribe`
- **Entity management**: `registerEntityType`, `entityService` (heavily used by directory-sync, site-builder)
- **Template/Route registration**: `registerTemplate`, `registerTemplates`, `registerRoutes`
- **Job processing**: `enqueueJob`, `registerJobHandler`
- **Content generation**: `generateContent`

### 🟡 **Specialized Methods (used by specific plugin types):**

- **Site Builder only**: `listRoutes`, `listViewTemplates`, `getViewTemplate`
- **Interface plugins only**: `getAllCommands`, `getActiveJobs`, `getActiveBatches`, `getBatchStatus`
- **Directory sync only**: Heavy `entityService` usage (getEntity, createEntity, updateEntity, etc.)

### 🔴 **Rarely/Never Used Methods (~40% of interface):**

- **parseContent**, **formatContent** - not found in actual plugin usage
- **generateWithRoute** - not found in actual plugin usage
- **findRoute**, **findViewTemplate** - not found in actual plugin usage
- **validateRoute**, **validateTemplate** - not found in actual plugin usage
- **getPluginPackageName** - not found in actual plugin usage
- **registerDaemon** - not found in actual plugin usage
- **waitForJob**, **getJobStatus** - not found in actual plugin usage
- **enqueueBatch** - not found in actual plugin usage

## Core DX Problems

1. **Overwhelming Interface Size** - 35+ methods with 40% unused
2. **Inconsistent Grouping** - Related methods scattered throughout interface
3. **Mixed Abstraction Levels** - High-level and low-level methods mixed together
4. **Unclear Method Purposes** - Many methods lack clear use cases
5. **Critical Dependencies Hidden** - `entityService` access is essential but not obvious

## Key Insights from Usage Analysis

1. **Direct `entityService` access is critical** - Both directory-sync and site-builder plugins use it extensively for CRUD operations
2. **Interface plugins need monitoring methods** - MCP interface uses `getActiveJobs`/`getActiveBatches` for system monitoring
3. **Content plugins need template/route discovery** - Site builder uses `listRoutes`, `getViewTemplate` for building sites
4. **Job methods are underutilized** - Most job queue methods beyond basic `enqueueJob` are unused
5. **Content helper methods unused** - `parseContent`/`formatContent` are not used in practice

## Proposed Solutions

### Solution 1: Create Essential vs Advanced Interface Split

```typescript
// Essential interface - what 90% of plugins need
interface EssentialPluginContext {
  // Core lifecycle
  pluginId: string;
  logger: Logger;
  sendMessage: MessageSender;
  subscribe: <T, R>(type: string, handler: MessageHandler<T, R>) => (() => void);

  // Entity management (critical for most plugins)
  registerEntityType: <T extends BaseEntity>(entityType: string, schema: z.ZodType<T>, adapter: EntityAdapter<T>) => void;
  entityService: EntityService;

  // Template/Content
  registerTemplate: <T>(name: string, template: Template<T>) => void;
  registerTemplates: (templates: Record<string, Template>) => void;
  generateContent: GenerateContentFunction;

  // Job processing
  enqueueJob: (type: string, data: unknown, options: JobOptions) => Promise<string>;
  registerJobHandler: (type: string, handler: JobHandler) => void;

  // Routes (for content plugins)
  registerRoutes: (routes: RouteDefinition[], options?: { environment?: string }) => void;
}

// Advanced interface - for specialized use cases
interface AdvancedPluginContext {
  // Template/Route discovery (site builder)
  listRoutes: () => RouteDefinition[];
  listViewTemplates: () => ViewTemplate[];
  getViewTemplate: (name: string) => ViewTemplate | undefined;

  // System monitoring (interface plugins)
  getAllCommands: () => Promise<Command[]>;
  getActiveJobs: (types?: string[]) => Promise<JobQueue[]>;
  getActiveBatches: () => Promise<Array<{...}>>;
  getBatchStatus: (batchId: string) => Promise<BatchJobStatus | null>;

  // Advanced job operations
  waitForJob: (jobId: string, timeoutMs?: number) => Promise<unknown>;
  getJobStatus: (jobId: string) => Promise<{...} | null>;
  enqueueBatch: (operations: BatchOperation[], options: JobOptions) => Promise<string>;
}

// Main interface combines both
interface PluginContext extends EssentialPluginContext {
  // Advanced methods available when needed
  advanced: AdvancedPluginContext;
}
```

### Solution 2: Remove Unused Methods

**Remove these unused methods entirely:**

- `parseContent` - no actual usage found
- `formatContent` - no actual usage found
- `generateWithRoute` - no actual usage found
- `findRoute` - no actual usage found
- `findViewTemplate` - no actual usage found
- `validateRoute` - no actual usage found
- `validateTemplate` - no actual usage found
- `getPluginPackageName` - no actual usage found
- `registerDaemon` - no actual usage found

**Keep but move to advanced:**

- `waitForJob`, `getJobStatus`, `enqueueBatch` - potentially useful but unused
- `getAllCommands`, `getActiveJobs`, `getActiveBatches` - used by interface plugins
- `listRoutes`, `listViewTemplates`, `getViewTemplate` - used by site builder

### Solution 3: Improve Documentation with Real Examples

Add comprehensive JSDoc comments based on actual usage patterns:

````typescript
/**
 * Direct access to the entity service for CRUD operations
 *
 * @example Directory Sync Plugin
 * ```typescript
 * // Check if entity exists
 * const existing = await context.entityService.getEntity(entityType, id);
 *
 * // Create new entity
 * if (!existing) {
 *   await context.entityService.createEntity({
 *     entityType,
 *     id,
 *     data: entityData,
 *     ...
 *   });
 * }
 * ```
 *
 * @example Site Builder Plugin
 * ```typescript
 * // Get entity for site content
 * const entity = await context.entityService.getEntity(
 *   "site-content-preview",
 *   pageId
 * );
 * ```
 */
entityService: EntityService;
````

### Solution 4: Create Plugin Type Guidance

```typescript
// Plugin type guidance utilities
namespace PluginTypes {
  // Essential methods every plugin needs
  export type Essential = Pick<
    PluginContext,
    | "pluginId"
    | "logger"
    | "entityService"
    | "registerEntityType"
    | "registerTemplate"
    | "generateContent"
    | "enqueueJob"
  >;

  // Content plugins (like site-builder)
  export type ContentPlugin = Essential &
    Pick<PluginContext, "registerRoutes" | "listRoutes" | "getViewTemplate">;

  // Sync plugins (like directory-sync)
  export type SyncPlugin = Essential &
    Pick<PluginContext, "registerJobHandler">;

  // Interface plugins (like CLI, Matrix, MCP)
  export type InterfacePlugin = Essential &
    Pick<
      PluginContext,
      "getAllCommands" | "getActiveJobs" | "getActiveBatches"
    >;
}
```

## Implementation Strategy

### Priority Phase: Move Complex Logic Back to Services

**Goal**: Move business logic from pluginContextFactory back to services before other DX improvements.

**Current Problem**: The pluginContextFactory contains ~500 lines with complex business logic that should live in services:

- **Job queue operations** - polling logic, timeout handling, shell job type checking, batch management
- **Template namespacing** - `ensureNamespaced` helper and namespacing logic in generateContent/formatContent
- **Route processing** - complex route transformation with section mapping and plugin prefixing
- **Message response formatting** - result transformation and response formatting for different result types
- **Job handler management** - plugin tracking and scoping logic with internal tracking maps

**Solution**: Add pluginId parameters to existing service methods instead of creating new methods.

**Service Enhancements**:

```typescript
// JobQueueService enhancements
interface IJobQueueService {
  waitForJob(
    jobId: string,
    timeoutMs?: number,
    pluginId?: string,
  ): Promise<unknown>;
  enqueue(
    type: string,
    data: unknown,
    options: JobOptions,
    pluginId?: string,
  ): Promise<string>;
  enqueueBatch(
    operations: BatchOperation[],
    options: JobOptions,
    pluginId?: string,
  ): Promise<string>;
  getBatchStatus(
    batchId: string,
    pluginId?: string,
  ): Promise<BatchJobStatus | null>;
  registerHandler(type: string, handler: JobHandler, pluginId?: string): void;
}

// ContentGenerator enhancements
interface IContentGenerator {
  generateContent<T>(
    config: ContentGenerationConfig,
    pluginId?: string,
  ): Promise<T>;
  formatContent<T>(
    templateName: string,
    data: T,
    options?: { truncate?: number },
    pluginId?: string,
  ): string;
}

// ViewRegistry enhancements
interface IViewRegistry {
  registerRoutes(
    routes: RouteDefinition[],
    options?: { environment?: string; pluginId?: string },
  ): void;
}

// MessageBus enhancements
interface IMessageBus {
  send<T, R>(
    type: string,
    payload: T,
    pluginId?: string,
  ): Promise<{ success: boolean; data?: R; error?: string }>;
}
```

**Expected Result**: Factory reduces from 500+ lines to ~200 lines of simple delegation:

```typescript
const context: PluginContext = {
  pluginId,
  logger: this.logger.child(`Plugin:${pluginId}`),

  // Simple delegations to enhanced services
  sendMessage: (type, payload) => messageBus.send(type, payload, pluginId),
  generateContent: (config) =>
    contentGenerator.generateContent(config, pluginId),
  formatContent: (templateName, data, options) =>
    contentGenerator.formatContent(templateName, data, options, pluginId),
  registerRoutes: (routes, options) =>
    viewRegistry.registerRoutes(routes, { ...options, pluginId }),

  // Job operations become simple delegations
  waitForJob: (jobId, timeoutMs) =>
    jobQueueService.waitForJob(jobId, timeoutMs, pluginId),
  enqueueJob: (type, data, options) =>
    jobQueueService.enqueue(type, data, options, pluginId),
  enqueueBatch: (operations, options) =>
    jobQueueService.enqueueBatch(operations, options, pluginId),
  getBatchStatus: (batchId) =>
    jobQueueService.getBatchStatus(batchId, pluginId),
  registerJobHandler: (type, handler) =>
    jobQueueService.registerHandler(type, handler, pluginId),

  // Direct service access (no changes needed)
  entityService,
  // ... other simple delegations
};
```

**Implementation Order**: JobQueueService → ContentGenerator → ViewRegistry → MessageBus → Factory cleanup

**Benefits**:

- Cleaner service APIs with optional pluginId parameters
- Backward compatibility (existing service calls continue to work)
- Better testing (services can be unit tested independently)
- Consistent error handling within services
- Reduced factory complexity
- Service ownership of plugin integration concerns

---

### Phase 1: Remove Unused Methods (Breaking Changes) ✅ COMPLETED

1. **Remove never-used methods** like `parseContent`, `formatContent`, etc.
2. **Provide migration guide** for the few cases where they might be needed
3. **Update plugin templates** to use new patterns

### Phase 2: Interface Restructure (Backward Compatible)

1. **Create EssentialPluginContext** interface with core methods
2. **Group advanced methods** under `context.advanced.*`
3. **Maintain backward compatibility** - all existing method calls work
4. **Add migration guide** for new recommended patterns

### Phase 3: Immediate DX Improvements (No Breaking Changes)

1. **Add comprehensive JSDoc** with real usage examples from existing plugins
2. **Create plugin type guidance** utilities to help developers understand what they need
3. **Mark unused methods as deprecated** with clear migration guidance

### Phase 4: Advanced Features (Optional)

1. **Add TypeScript utilities** for plugin type checking
2. **Create plugin scaffolding** tools that generate the right interface subset
3. **Add runtime validation** to catch incorrect usage patterns

## Expected Outcomes

### Developer Experience Improvements

- **Clearer mental model** - developers focus on essential methods first
- **Better discoverability** - related methods grouped together
- **Reduced cognitive load** - 40% fewer methods to understand initially
- **Improved documentation** - real examples from actual plugin usage

### Technical Benefits

- **Smaller bundle size** - fewer unused methods
- **Better type safety** - focused interfaces prevent misuse
- **Easier testing** - essential methods are easier to mock
- **Future extensibility** - clear separation of concerns

### Migration Impact

- **Phase 1: Breaking changes** - remove unused methods (minimal impact since unused)
- **Phase 2: Backward compatible** - existing code continues to work
- **Phase 3: Zero breaking changes** - pure documentation and guidance improvements
- **Clear upgrade path** - comprehensive migration guide and tooling

## Success Metrics

1. **Reduced onboarding time** - New plugin developers can create basic plugins faster
2. **Increased essential method usage** - More plugins use `entityService` effectively
3. **Better documentation engagement** - More developers read and follow the docs
4. **Fewer support questions** - Less confusion about which methods to use
5. **Plugin quality improvement** - Plugins use appropriate methods for their use cases

## Critical Finding: EntityService Access

The analysis reveals that **direct `entityService` access is absolutely essential** and heavily used by:

- Directory Sync Plugin (getEntity, createEntity, updateEntity, listEntities, getEntityTypes, deserializeEntity)
- Site Builder Plugin (getEntity for content retrieval)
- MCP Interface Plugin (search, getEntity, getEntityTypes)

This contradicts the original security boundary plan. The `entityService` should remain as a first-class citizen in the interface, not be restricted.

## Recommendation

**Focus on DX improvements over security restrictions**. The interface should:

1. Make essential methods (including `entityService`) more discoverable
2. Group advanced methods to reduce cognitive load
3. Remove genuinely unused methods
4. Provide clear guidance for different plugin types

This approach improves developer experience while maintaining the powerful functionality that plugins actually need.
