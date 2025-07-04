# Content Management Package Extraction Plan

## Executive Summary

This document outlines a comprehensive plan to extract the site-builder plugin's content management functionality into a dedicated shared package while completing the remaining async implementation work. The current `SiteContentManager` has grown to 1652 lines and violates the Single Responsibility Principle by handling multiple concerns. This plan addresses both the architectural debt and completes the async migration with a clean, operation-based architecture.

### Problems Being Solved

1. **Architecture Violation**: 1652-line `SiteContentManager` handles too many responsibilities
2. **Incomplete Async Implementation**: Missing async variants for regenerate operations
3. **Poor Maintainability**: Large, monolithic class is difficult to test and extend
4. **Limited Reusability**: Core content management functionality is embedded in site-builder plugin

### Solution Overview

Extract **core content management** to `shared/content-management/` package with:

- Clean operation-based architecture for generation and query operations
- Complete async implementation for content generation workflows
- Reusable package that other plugins can leverage for content operations
- Site-builder specific operations (promote/rollback) remain in the plugin
- Maintained backward compatibility through facade pattern

## Current State Analysis

### SiteContentManager Responsibilities

The current manager handles:

**Operations to Extract (Core Content Management):**

- **Generation Operations**: `generateSync()`, `generateAsync()`, `regenerateSync()`
- **Entity Querying**: `getPreviewEntities()`, `getProductionEntities()`, content queries
- **Content Utilities**: `compare()`, `exists()`, `generateId()`
- **Job Tracking**: Job status monitoring and result processing for content generation

**Operations Remaining in Site-Builder:**

- **Promotion Operations**: `promoteSync()`, `promoteAsync()` - Site-builder specific workflow
- **Rollback Operations**: `rollbackSync()`, `rollbackAsync()` - Site-builder specific workflow
- **Site Building Integration**: Template resolution, build pipeline integration

### Remaining Implementation Tasks

**Content Management Package (Shared):**

- ✅ Extract GenerationOperations class (completed)
- ✅ Extract EntityQueryService class (completed)
- ✅ Create types and schemas (completed)
- ⏳ Implement regenerateAsync returning ContentGenerationJob[]
- ⏳ Create JobTrackingService for async job monitoring
- ⏳ Create ContentManager facade class

**Site-Builder Plugin (Specific):**

- ⏳ Keep promoteAsync and rollbackAsync in site-builder (site-specific operations)
- ⏳ Integrate shared content management package
- ⏳ Update plugin tools to use shared package for generation operations
- ⏳ Maintain promote/rollback operations as site-builder exclusive features

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

### Support Services

#### Job Tracking Service

```typescript
export class JobTrackingService {
  constructor(
    private readonly pluginContext: PluginContext,
    private readonly logger?: Logger,
  ) {}

  // Specialized tracking for content generation jobs
  async waitForContentJobs(
    jobs: ContentGenerationJob[],
    progressCallback?: ProgressCallback,
    timeoutMs: number = 60000,
  ): Promise<ContentGenerationResult[]>;

  async getContentJobStatuses(
    jobs: ContentGenerationJob[],
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
  private generationOps: GenerationOperations;
  private regenerationOps: RegenerationOperations;
  private entityQuery: EntityQueryService;
  private jobTracking: JobTrackingService;

  constructor(
    entityService: EntityService,
    pluginContext?: PluginContext, // Optional for sync-only usage
    logger?: Logger,
  ) {
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

  // Content generation operations
  async generateSync(options: GenerateOptions): Promise<GenerateResult> {
    return this.generationOps.generateSync(options);
  }

  async generateAsync(options: GenerateOptions): Promise<{
    jobs: ContentGenerationJob[];
    totalSections: number;
    queuedSections: number;
  }> {
    return this.generationOps.generateAsync(options);
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

#### Basic Usage (Query Operations)

```typescript
import { ContentManager } from "@brains/content-management";

const contentManager = new ContentManager(entityService, undefined, logger);

// Query operations work without PluginContext
const previewContent = await contentManager.getPreviewEntities({
  pageId: "landing",
});
const exists = await contentManager.exists("landing", "hero", "preview");
```

#### Full Usage (Generation + Async)

```typescript
import { ContentManager } from "@brains/content-management";

const contentManager = new ContentManager(entityService, pluginContext, logger);

// Async content generation available with PluginContext
const { jobs } = await contentManager.generateAsync(
  { pageId: "landing" },
  routes,
  resolver,
);
const results = await contentManager.waitForContentJobs(jobs);

// Or use sync generation
const result = await contentManager.generateSync(
  { pageId: "landing" },
  routes,
  callback,
);
```

### Backward Compatibility Strategy

The ContentManager facade maintains the exact same API as the current SiteContentManager, ensuring zero breaking changes:

```typescript
// All existing content generation calls continue to work
const manager = new ContentManager(entityService, pluginContext, logger);
await manager.generateSync(options, routes, callback); // ✅ Same as before
await manager.generateAsync(options, routes, resolver, config); // ✅ Same as before
await manager.regenerateSync(options, callback); // ✅ Same as before

// Site-builder will maintain its own promote/rollback operations
// These remain in SiteContentManager for site-specific workflows
```

## Benefits

### Immediate Benefits

1. **Single Responsibility Principle**: Each operation class has one clear purpose
2. **Testability**: Smaller, focused classes are easier to test in isolation
3. **Maintainability**: Changes to generation logic only affect GenerationOperations
4. **Reusability**: Other plugins can use core content management functionality
5. **Complete Async Implementation**: Content generation operations have async variants with job tracking

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
