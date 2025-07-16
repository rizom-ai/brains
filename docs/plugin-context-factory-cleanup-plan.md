# PluginContextFactory Cleanup Plan - Using Existing Error Infrastructure

## Analysis Results

### 1. **Does it expose too much?** - YES
- Direct EntityService access (line 355)
- 12 ViewRegistry methods (lines 312-347)
- System monitoring methods (getActiveJobs, getActiveBatches)
- Cross-plugin metadata access

### 2. **Does it expose things consistently?** - NO
- Mixed namespacing patterns
- Inconsistent error handling
- Different method signatures (some Promise, some sync)
- Mixed logging levels

### 3. **Is it DRY?** - NO
- Repeated try-catch patterns (15+ times)
- Repeated service resolution (`shell.getJobQueueService()`)
- Repeated BatchJobManager instantiation (4 times)
- Repeated namespacing logic

## Cleanup Plan - Leveraging Existing Error Infrastructure

### Phase 1: Replace Custom Error Handling with Existing Standards (1 day)

**Current State Analysis:**
- PluginContextFactory uses custom error classes: `EntityRegistrationError`, `ContentGenerationError`, `TemplateRegistrationError`, `RouteRegistrationError`
- These ALL exist in `@brains/utils/errors.ts` already!
- The code is duplicating error handling patterns instead of using existing infrastructure

**Tasks:**
1. **Remove duplicate try-catch patterns** - Replace with existing error classes
2. **Use existing `ErrorUtils.wrapError()`** for consistent error wrapping
3. **Leverage existing specific error types** instead of generic Error throws

**Before:**
```typescript
try {
  // operation
} catch (error) {
  this.logger.error("Failed to register entity type", error);
  throw new EntityRegistrationError(entityType, error);
}
```

**After:**
```typescript
// Use existing error infrastructure
return ErrorUtils.wrapError(
  () => this.entityRegistry.registerEntityType(entityType, schema, adapter),
  `Failed to register entity type ${entityType}`,
  "ENTITY_REGISTRATION_FAILED",
  { entityType, pluginId }
);
```

### Phase 2: Extract Service Resolution Layer (1 day)

**Problem:** Repeated service resolution patterns
**Solution:** Create `PluginServiceResolver` utility

```typescript
// utils/PluginServiceResolver.ts
class PluginServiceResolver {
  constructor(private serviceRegistry: ServiceRegistry, private logger: Logger) {}
  
  private _shell?: Shell;
  private _jobQueueService?: JobQueueService;
  private _batchJobManager?: BatchJobManager;
  
  get shell() { return this._shell ??= this.serviceRegistry.resolve<Shell>("shell"); }
  get jobQueueService() { return this._jobQueueService ??= this.shell.getJobQueueService(); }
  get batchJobManager() { 
    return this._batchJobManager ??= BatchJobManager.getInstance(this.jobQueueService, this.logger);
  }
}
```

### Phase 3: Split into Focused Context Builders (2 days)

**Current:** 674 lines doing everything
**Target:** Focused builders for each concern

```typescript
// contexts/JobContextBuilder.ts (~150 lines)
class JobContextBuilder {
  constructor(private resolver: PluginServiceResolver, private pluginId: string) {}
  
  build(): JobContext {
    return {
      enqueueJob: this.createEnqueueJob(),
      waitForJob: this.createWaitForJob(),
      enqueueBatch: this.createEnqueueBatch(),
      getBatchStatus: this.createGetBatchStatus(),
      // Remove monitoring methods (security)
    };
  }
}

// contexts/ContentContextBuilder.ts (~120 lines) 
class ContentContextBuilder {
  constructor(private resolver: PluginServiceResolver, private pluginId: string) {}
  
  build(): ContentContext {
    return {
      generateContent: this.createGenerateContent(),
      parseContent: this.createParseContent(),
      formatContent: this.createFormatContent(),
      registerTemplate: this.createRegisterTemplate(),
    };
  }
}
```

### Phase 4: Implement Security Boundaries (1 day)

**Remove dangerous exposures:**
- `getActiveJobs()` - system monitoring
- `getActiveBatches()` - system monitoring  
- `getAllCommands()` - security exposure
- Cross-plugin metadata access

**Add plugin-scoped filters:**
- EntityService operations scoped to plugin entities
- ViewRegistry operations scoped to plugin templates
- Job operations scoped to plugin jobs

### Phase 5: Standardize Method Signatures (1 day)

**Make consistent:**
- All async methods return `Promise<T>`
- Consistent parameter patterns
- Standardized options objects
- Auto-namespace ALL template operations

## Expected Outcomes

### Before:
```typescript
// 674 lines with:
try {
  // operation
} catch (error) {
  this.logger.error("Failed to ...", error);
  throw new SomeError(...);
}
// Repeated 15+ times
```

### After:
```typescript
// ~200 lines with:
// No repeated error handling - use existing infrastructure
// Focused context builders
// Consistent method signatures
// Plugin-scoped security
```

### File Structure:
```
plugins/
├── pluginContextFactory.ts (~200 lines)
├── contexts/
│   ├── JobContextBuilder.ts
│   ├── ContentContextBuilder.ts
│   └── ViewContextBuilder.ts
└── utils/
    ├── PluginServiceResolver.ts
    └── namespacing.ts
```

## Timeline: 6 days total
- Phase 1: 1 day (use existing errors)
- Phase 2: 1 day (service resolution)
- Phase 3: 2 days (context builders)
- Phase 4: 1 day (security)
- Phase 5: 1 day (consistency)

This leverages the existing error infrastructure you already have and focuses on the core issues: size, security, and consistency.