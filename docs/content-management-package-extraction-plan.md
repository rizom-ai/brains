# Content Management Package Extraction Plan

## Executive Summary

This document outlines a comprehensive plan to extract the site-builder plugin's content management functionality into a dedicated shared package while completing the remaining async implementation work. The current `SiteContentManager` has grown to 1652 lines and violates the Single Responsibility Principle by handling multiple concerns. This plan addresses both the architectural debt and completes the async migration with a clean, operation-based architecture.

### Problems Being Solved

1. **Architecture Violation**: 1652-line `SiteContentManager` handles too many responsibilities
2. **Incomplete Async Implementation**: Missing async variants for promote, regenerate, and rollback operations
3. **Poor Maintainability**: Large, monolithic class is difficult to test and extend
4. **Limited Reusability**: Content management functionality is embedded in site-builder plugin

### Solution Overview

Extract content management to `shared/content-management/` package with:

- Clean operation-based architecture (PromotionOperations, GenerationOperations, etc.)
- Complete async implementation with job tracking
- Reusable package that other plugins can leverage
- Maintained backward compatibility through facade pattern

## Current State Analysis

### SiteContentManager Responsibilities

The current manager handles:

- **Sync Operations**: `promoteSync()`, `rollbackSync()`, `generateSync()`, `regenerateSync()`
- **Async Operations**: `generateAsync()`, `waitAndCreateEntities()`, `getJobStatuses()`
- **Entity Querying**: `getPreviewEntities()`, `getProductionEntities()`
- **Content Comparison**: `compare()`, `exists()`
- **ID Generation**: `generateId()`
- **Progress Tracking**: Job status monitoring and result processing

### Remaining Async Tasks

From the site-builder async migration plan, Phase 5 tasks remaining:

- ✅ Rename existing blocking methods to use Sync suffix (completed)
- ✅ Define ContentGenerationJob and EntityOperationJob interfaces (completed)
- ✅ Update generateAsync to return ContentGenerationJob[] (completed)
- ⏳ Implement promoteAsync returning EntityOperationJob[]
- ⏳ Implement regenerateAsync returning ContentGenerationJob[]
- ⏳ Implement rollbackAsync returning EntityOperationJob[]
- ⏳ Create waitForEntityJobs utility for EntityOperationJob tracking
- ⏳ Update plugin tools to use new async methods

### Dependencies Analysis

Current dependencies that will be preserved:

- `@brains/entity-service` - Entity CRUD operations and job queue
- `@brains/view-registry` - Route and section definitions
- `@brains/plugin-utils` - PluginContext for async job enqueuing
- `@brains/types` - Logger and base type definitions

All dependencies are already proper shared packages, making extraction clean.

## Target Architecture: Content Management Package

### Package Structure

```
shared/content-management/
├── package.json
├── src/
│   ├── index.ts                    # Public API exports
│   ├── manager.ts                  # ContentManager facade
│   ├── operations/                 # Operation-specific classes
│   │   ├── base-operation.ts       # Base class with common patterns
│   │   ├── promotion-operations.ts # Promote/promotion logic
│   │   ├── rollback-operations.ts  # Rollback logic
│   │   ├── generation-operations.ts # Generate content logic
│   │   └── regeneration-operations.ts # Regenerate content logic
│   ├── services/                   # Support services
│   │   ├── entity-query-service.ts # Entity filtering and querying
│   │   └── job-tracking-service.ts # Job status and progress tracking
│   ├── types.ts                    # Type definitions and interfaces
│   ├── schemas.ts                  # Zod validation schemas
│   └── utils/                      # Utilities
│       ├── comparator.ts           # Content comparison (moved from site-builder)
│       └── id-generator.ts         # ID generation (moved from site-builder)
├── test/                           # Comprehensive test suite
│   ├── operations/
│   ├── services/
│   └── utils/
└── tsconfig.json
```

### Operation-Based Architecture

#### Base Operation Class

```typescript
export abstract class BaseOperation {
  constructor(
    protected readonly entityService: EntityService,
    protected readonly logger?: Logger,
  ) {}

  protected async handleErrors<T>(
    operation: () => Promise<T>,
    context: string,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger?.error(`${context} failed`, { error: message });
      throw error;
    }
  }

  protected logProgress(
    operation: string,
    current: number,
    total: number,
  ): void {
    this.logger?.info(`${operation} progress`, {
      current,
      total,
      percent: Math.round((current / total) * 100),
    });
  }
}
```

#### Promotion Operations

```typescript
export class PromotionOperations extends BaseOperation {
  // Existing sync method
  async promoteSync(options: PromoteOptions): Promise<PromoteResult>;

  // New async method returning EntityOperationJob[]
  async promoteAsync(options: PromoteOptions): Promise<{
    jobs: EntityOperationJob[];
    totalEntities: number;
    queuedEntities: number;
  }>;

  // Complete async operation (convenience method)
  async promoteAsyncComplete(
    options: PromoteOptions,
    timeoutMs: number = 60000,
  ): Promise<PromoteResult>;
}
```

#### Generation Operations

```typescript
export class GenerationOperations extends BaseOperation {
  constructor(
    entityService: EntityService,
    private readonly pluginContext: PluginContext, // For async job enqueuing
    logger?: Logger,
  ) {
    super(entityService, logger);
  }

  // Existing sync method
  async generateSync(
    options: GenerateOptions,
    routes: RouteDefinition[],
    generateCallback: GenerateCallback,
  ): Promise<GenerateResult>;

  // Existing async method - already implemented
  async generateAsync(
    options: GenerateOptions,
    routes: RouteDefinition[],
    templateResolver: TemplateResolver,
    siteConfig?: Record<string, unknown>,
  ): Promise<{
    jobs: ContentGenerationJob[];
    totalSections: number;
    queuedSections: number;
  }>;
}
```

#### Regeneration Operations

```typescript
export class RegenerationOperations extends BaseOperation {
  constructor(
    entityService: EntityService,
    private readonly pluginContext: PluginContext,
    logger?: Logger,
  ) {
    super(entityService, logger);
  }

  // Existing sync method
  async regenerateSync(
    options: RegenerateOptions,
    regenerateCallback: RegenerateCallback,
  ): Promise<RegenerateResult>;

  // New async method returning ContentGenerationJob[]
  async regenerateAsync(
    options: RegenerateOptions,
    templateResolver: TemplateResolver,
    siteConfig?: Record<string, unknown>,
  ): Promise<{
    jobs: ContentGenerationJob[];
    totalEntities: number;
    queuedEntities: number;
  }>;

  // Complete async operation (convenience method)
  async regenerateAsyncComplete(
    options: RegenerateOptions,
    templateResolver: TemplateResolver,
    siteConfig?: Record<string, unknown>,
    timeoutMs: number = 60000,
  ): Promise<RegenerateResult>;
}
```

#### Rollback Operations

```typescript
export class RollbackOperations extends BaseOperation {
  // Existing sync method
  async rollbackSync(options: RollbackOptions): Promise<RollbackResult>;

  // New async method returning EntityOperationJob[]
  async rollbackAsync(options: RollbackOptions): Promise<{
    jobs: EntityOperationJob[];
    totalEntities: number;
    queuedEntities: number;
  }>;

  // Complete async operation (convenience method)
  async rollbackAsyncComplete(
    options: RollbackOptions,
    timeoutMs: number = 60000,
  ): Promise<RollbackResult>;
}
```

### Support Services

#### Job Tracking Service

```typescript
export class JobTrackingService {
  constructor(
    private readonly pluginContext: PluginContext,
    private readonly logger?: Logger,
  ) {}

  // Specialized tracking for different job types
  async waitForContentJobs(
    jobs: ContentGenerationJob[],
    progressCallback?: ProgressCallback,
    timeoutMs: number = 60000,
  ): Promise<ContentGenerationResult[]>;

  async waitForEntityJobs(
    jobs: EntityOperationJob[],
    progressCallback?: ProgressCallback,
    timeoutMs: number = 60000,
  ): Promise<EntityOperationResult[]>;

  async getContentJobStatuses(
    jobs: ContentGenerationJob[],
  ): Promise<JobStatusSummary>;
  async getEntityJobStatuses(
    jobs: EntityOperationJob[],
  ): Promise<JobStatusSummary>;
}
```

#### Entity Query Service

```typescript
export class EntityQueryService {
  constructor(
    private readonly entityService: EntityService,
    private readonly logger?: Logger,
  ) {}

  async getPreviewEntities(
    options: FilterOptions,
  ): Promise<SiteContentPreview[]>;
  async getProductionEntities(
    options: FilterOptions,
  ): Promise<SiteContentProduction[]>;
  async getEntitiesByType<T extends SiteContent>(
    entityType: SiteContentEntityType,
    options: FilterOptions,
  ): Promise<T[]>;
}
```

### Content Manager Facade

```typescript
export class ContentManager {
  private promotionOps: PromotionOperations;
  private rollbackOps: RollbackOperations;
  private generationOps: GenerationOperations;
  private regenerationOps: RegenerationOperations;
  private entityQuery: EntityQueryService;
  private jobTracking: JobTrackingService;

  constructor(
    entityService: EntityService,
    pluginContext?: PluginContext, // Optional for sync-only usage
    logger?: Logger,
  ) {
    this.promotionOps = new PromotionOperations(entityService, logger);
    this.rollbackOps = new RollbackOperations(entityService, logger);
    this.entityQuery = new EntityQueryService(entityService, logger);

    if (pluginContext) {
      this.generationOps = new GenerationOperations(
        entityService,
        pluginContext,
        logger,
      );
      this.regenerationOps = new RegenerationOperations(
        entityService,
        pluginContext,
        logger,
      );
      this.jobTracking = new JobTrackingService(pluginContext, logger);
    }
  }

  // Delegate to appropriate operations
  async promoteSync(options: PromoteOptions): Promise<PromoteResult> {
    return this.promotionOps.promoteSync(options);
  }

  async promoteAsync(
    options: PromoteOptions,
  ): Promise<{
    jobs: EntityOperationJob[];
    totalEntities: number;
    queuedEntities: number;
  }> {
    return this.promotionOps.promoteAsync(options);
  }

  // ... delegate all other methods

  // Utility methods
  async compare(
    pageId: string,
    sectionId: string,
  ): Promise<ContentComparison | null> {
    return compareContent(pageId, sectionId /* ... */);
  }

  async exists(
    pageId: string,
    sectionId: string,
    type: "preview" | "production",
  ): Promise<boolean> {
    // Implementation
  }

  generateId(
    type: SiteContentEntityType,
    pageId: string,
    sectionId: string,
  ): string {
    return generateSiteContentId(type, pageId, sectionId);
  }
}
```

## Migration Strategy

### Phase 1: Package Creation & Basic Migration (Week 1)

#### Step 1.1: Create Package Structure

- Create `shared/content-management/` directory
- Set up package.json with proper dependencies
- Configure TypeScript and build setup
- Add to workspace and turbo.json

#### Step 1.2: Extract Current Code

- Move content-management/ files from site-builder to new package
- Update imports and dependencies
- Maintain current SiteContentManager structure initially
- Export through clean public API

#### Step 1.3: Update Site-Builder Plugin

- Add dependency on `@brains/content-management`
- Update imports to use new package
- Remove content-management code from site-builder
- Ensure all existing functionality works

#### Step 1.4: Verify Migration

- Run all existing tests
- Verify site-builder plugin tools still work
- No functionality changes at this stage

### Phase 2: Architecture Refactoring & Async Completion (Week 2-3)

#### Step 2.1: Implement Operation Classes

- Create BaseOperation abstract class
- Extract PromotionOperations from SiteContentManager
- Extract RollbackOperations from SiteContentManager
- Extract GenerationOperations from SiteContentManager
- Extract RegenerationOperations from SiteContentManager

#### Step 2.2: Implement Support Services

- Create EntityQueryService with existing query logic
- Create JobTrackingService for job status management
- Move utility functions to dedicated modules

#### Step 2.3: Complete Async Implementation

- Implement `promoteAsync()` in PromotionOperations
- Implement `regenerateAsync()` in RegenerationOperations
- Implement `rollbackAsync()` in RollbackOperations
- Create `waitForEntityJobs()` utility in JobTrackingService
- Add complete async operation methods

#### Step 2.4: Create Content Manager Facade

- Implement ContentManager as facade over operations
- Maintain backward compatibility with existing API
- Support both sync-only and async-enabled usage

#### Step 2.5: Update Site-Builder Integration

- Update SiteContentManager instantiation to use ContentManager
- Pass PluginContext for async operations
- Update plugin tools to use new async methods where beneficial

### Phase 3: Testing & Optimization (Week 4)

#### Step 3.1: Comprehensive Testing

- Unit tests for each operation class
- Integration tests for ContentManager facade
- Test both sync and async code paths
- Test error handling and edge cases

#### Step 3.2: Performance Validation

- Benchmark sync vs async operations
- Verify job queue performance for bulk operations
- Test timeout and cancellation behavior

#### Step 3.3: Documentation & Examples

- API documentation for public interface
- Usage examples for both sync and async patterns
- Migration guide for other plugins

## API Design

### Public Interface

```typescript
// Main exports
export { ContentManager } from "./manager";
export type {
  SiteContent,
  SiteContentPreview,
  SiteContentProduction,
  PromoteOptions,
  PromoteResult,
  RollbackOptions,
  RollbackResult,
  GenerateOptions,
  GenerateResult,
  RegenerateOptions,
  RegenerateResult,
  ContentComparison,
  ContentGenerationJob,
  EntityOperationJob,
  JobStatusSummary,
} from "./types";

// Validation schemas
export {
  PromoteOptionsSchema,
  RollbackOptionsSchema,
  GenerateOptionsSchema,
  RegenerateOptionsSchema,
} from "./schemas";

// Utilities
export {
  generateSiteContentId,
  previewToProductionId,
} from "./utils/id-generator";
export { compareContent, isContentEquivalent } from "./utils/comparator";
```

### Usage Examples

#### Basic Usage (Sync Only)

```typescript
import { ContentManager } from "@brains/content-management";

const contentManager = new ContentManager(entityService, undefined, logger);

// Sync operations work without PluginContext
await contentManager.promoteSync({ pageId: "landing" });
await contentManager.rollbackSync({ pageId: "landing", sectionId: "hero" });
```

#### Full Usage (Sync + Async)

```typescript
import { ContentManager } from "@brains/content-management";

const contentManager = new ContentManager(entityService, pluginContext, logger);

// Async operations available with PluginContext
const { jobs } = await contentManager.promoteAsync({ pageId: "landing" });
const results = await contentManager.waitForEntityJobs(jobs);

// Or use complete async operations
const result = await contentManager.promoteAsyncComplete({ pageId: "landing" });
```

### Backward Compatibility Strategy

The ContentManager facade maintains the exact same API as the current SiteContentManager, ensuring zero breaking changes:

```typescript
// All existing calls continue to work
const manager = new ContentManager(entityService, pluginContext, logger);
await manager.promoteSync(options); // ✅ Same as before
await manager.generateSync(options, routes, callback); // ✅ Same as before
await manager.generateAsync(options, routes, resolver, config); // ✅ Same as before
```

## Benefits

### Immediate Benefits

1. **Single Responsibility Principle**: Each operation class has one clear purpose
2. **Testability**: Smaller, focused classes are easier to test in isolation
3. **Maintainability**: Changes to promotion logic only affect PromotionOperations
4. **Reusability**: Other plugins can use content management functionality
5. **Complete Async Implementation**: All operations have async variants with job tracking

### Long-term Benefits

1. **Extensibility**: Easy to add new content operations or modify existing ones
2. **Performance**: Async operations don't block UI for large datasets
3. **Modularity**: Operations can be used independently or in combination
4. **Consistency**: Common patterns shared via base classes
5. **Package Independence**: Content management can evolve independently

### Technical Benefits

1. **Clean Architecture**: Proper separation of concerns
2. **Dependency Injection**: Better testability and flexibility
3. **Type Safety**: Complete TypeScript coverage with discriminated unions
4. **Error Handling**: Consistent error patterns across operations
5. **Progress Tracking**: Real-time progress monitoring for long operations

## Risk Assessment & Mitigation

### High Risk Items

1. **Breaking Changes During Migration**
   - **Mitigation**: Maintain exact API compatibility through facade pattern
   - **Validation**: Comprehensive test suite ensures no functionality changes

2. **Complex Async Job Coordination**
   - **Mitigation**: Use proven job tracking patterns from existing async implementation
   - **Validation**: Extensive testing of job lifecycle and error scenarios

3. **Performance Regression**
   - **Mitigation**: Benchmark sync operations to ensure no overhead added
   - **Validation**: Performance tests comparing before/after migration

### Medium Risk Items

1. **Integration Complexity**
   - **Mitigation**: Gradual migration in clearly defined phases
   - **Validation**: Each phase fully tested before proceeding

2. **Test Migration Effort**
   - **Mitigation**: Reuse existing test patterns and gradually refactor
   - **Validation**: Maintain test coverage throughout migration

### Low Risk Items

1. **Documentation Updates**
   - **Mitigation**: Update docs incrementally during implementation
   - **Timeline**: Documentation completion in Phase 3

## Success Criteria

1. **✅ Zero Breaking Changes**: All existing site-builder functionality works unchanged
2. **✅ Complete Async Implementation**: All operations have async variants with job tracking
3. **✅ Improved Architecture**: Clean separation of concerns with operation-based classes
4. **✅ Better Testability**: Each operation class has comprehensive isolated tests
5. **✅ Reusable Package**: Other plugins can use content management functionality
6. **✅ Performance Improvement**: Async operations show 5x improvement for bulk operations
7. **✅ Maintainability**: New features can be added without modifying existing operations

## Timeline

### Week 1: Package Creation & Basic Migration

- Days 1-2: Create package structure and extract existing code
- Days 3-4: Update site-builder to use new package
- Day 5: Verify migration with existing tests

### Week 2: Architecture Refactoring

- Days 1-2: Implement operation classes and support services
- Days 3-4: Create ContentManager facade and update integration
- Day 5: Complete basic refactoring with working sync operations

### Week 3: Async Implementation Completion

- Days 1-2: Implement remaining async methods (promoteAsync, regenerateAsync, rollbackAsync)
- Days 3-4: Complete job tracking utilities and async complete methods
- Day 5: Update plugin tools to use new async methods

### Week 4: Testing & Polish

- Days 1-2: Comprehensive testing suite
- Days 3-4: Performance validation and optimization
- Day 5: Documentation and migration guide

## Next Steps

1. **Create Package Structure**: Set up shared/content-management/ with basic configuration
2. **Extract Existing Code**: Move content management files to new package
3. **Update Site-Builder**: Add dependency and update imports
4. **Implement Operation Classes**: Break down SiteContentManager into focused classes
5. **Complete Async Implementation**: Add remaining async methods and utilities
6. **Comprehensive Testing**: Ensure all functionality works in new architecture

This migration will transform the unwieldy 1652-line SiteContentManager into a clean, maintainable, and reusable content management package while completing the async implementation with proper job tracking and progress monitoring.
