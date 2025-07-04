# Site-Builder Async Content Generation Migration Plan

## Executive Summary

This document outlines the migration strategy for converting the site-builder plugin from synchronous to asynchronous content generation using the newly implemented job queue system. The migration follows the "Job-Result Processing Approach" (Option B) which maintains clean separation of concerns while enabling background content generation for improved performance and user experience.

## Current Architecture Analysis

### Synchronous Flow (Current)

```
Plugin Tool → SiteContentManager.generate(callback) → callback(route, section) → content → createEntity
```

**Key Components:**

1. **Plugin Tools** (`generate`, `generate-all`, `regenerate-content`, `regenerate-all`)
2. **SiteContentManager.generate()** - Orchestrates content generation
3. **Callback Function** - Calls `context.generateWithRoute()` synchronously
4. **Entity Creation** - Immediate entity creation with deterministic IDs

**Current Callback Pattern:**

```typescript
const generateCallback = async (
  route: RouteDefinition,
  section: SectionDefinition,
): Promise<{ content: string }> => {
  const formattedContent = await this.context.generateWithRoute(
    route,
    section,
    progressInfo,
    siteConfig,
  );
  return { content: formattedContent };
};
```

**Problems with Current Approach:**

- Blocks UI during content generation
- No background processing capability
- Large operations (`generate-all`) are not interruptible
- Limited progress reporting
- No job retry mechanism
- Sequential processing only

## Proposed Async Architecture

### Asynchronous Flow (Proposed)

```
Plugin Tool → SiteContentManager.generateAsync() → enqueue jobs → wait for results → process results → createEntities
```

**Key Components:**

1. **Job Tracking System** - Maps jobs to route/section metadata
2. **Async Content Generation** - Background job processing
3. **Result Processing** - Creates entities from job results
4. **Progress Tracking** - Real-time job status monitoring

### Job-Result Processing Approach (Option B)

**Benefits:**

- Clean separation: jobs only generate content, manager handles entities
- Proper error handling per section
- Progress tracking capability
- Same deterministic entity ID logic
- Can batch operations efficiently
- Maintains backward compatibility

## Technical Implementation Plan

### Step 1: Data Structure Extensions

#### Job Tracking Interface

```typescript
interface SiteContentJob {
  jobId: string;
  route: RouteDefinition;
  section: SectionDefinition;
  templateName: string;
  targetEntityType: "site-content-preview" | "site-content-production";
  page: string;
  sectionId: string;
}
```

#### Enhanced ContentGenerationRequest

The existing `ContentGenerationRequest` already supports the needed data structure:

```typescript
{
  templateName: string; // section.template (already prefixed)
  context: {
    prompt?: string;     // Generated prompt for the content
    data?: {             // Route/section metadata
      route: RouteDefinition;
      section: SectionDefinition;
      siteConfig: SiteConfig;
    };
  };
  userId?: string;
}
```

### Step 2: SiteContentManager Async Methods

#### Primary Async Methods

```typescript
class SiteContentManager {
  // Phase 1: Enqueue jobs for content generation
  async generateAsync(
    options: GenerateOptions,
    routes: RouteDefinition[],
    templateResolver: (section: SectionDefinition) => string,
    siteConfig?: Record<string, unknown>,
  ): Promise<{
    jobs: SiteContentJob[];
    totalSections: number;
    queuedSections: number;
  }>;

  // Phase 2: Wait for job completion and create entities
  async waitAndCreateEntities(
    jobs: SiteContentJob[],
    timeoutMs?: number,
  ): Promise<GenerateResult>;

  // Convenience method combining both phases
  async generateAsyncComplete(
    options: GenerateOptions,
    routes: RouteDefinition[],
    templateResolver: (section: SectionDefinition) => string,
    siteConfig?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<GenerateResult>;
}
```

#### Job Status Monitoring

```typescript
async getJobStatuses(jobIds: string[]): Promise<JobStatusSummary>;
async waitForJobCompletion(jobs: SiteContentJob[], timeoutMs: number): Promise<JobResult[]>;
```

### Step 3: Template Resolution Strategy

**Current:** `context.generateWithRoute(route, section, progress, siteConfig)`
**New:**

- Use `section.template` (already prefixed by plugin) as `templateName`
- Pass `{ route, section, siteConfig }` as `context.data`
- ContentGenerator will format content same as current `generateWithRoute`

**Template Resolution Function:**

```typescript
const templateResolver = (section: SectionDefinition): string => {
  if (!section.template) {
    throw new Error(`Section ${section.id} has no template specified`);
  }
  return section.template; // Already prefixed with plugin ID
};
```

### Step 4: Plugin Tool Updates

#### Generate Tool (Async Version)

```typescript
async handler(config) {
  // Option 1: Fully async with progress tracking
  const { jobs } = await this.siteContentManager.generateAsync(
    config, routes, templateResolver, siteConfig
  );

  // Return job IDs for progress tracking
  return {
    success: true,
    message: `Queued ${jobs.length} content generation jobs`,
    jobs: jobs.map(j => ({ jobId: j.jobId, section: j.sectionId }))
  };

  // Option 2: Complete async operation
  const result = await this.siteContentManager.generateAsyncComplete(
    config, routes, templateResolver, siteConfig, 60000
  );

  return result;
}
```

#### Progress Tracking Tool

```typescript
// New tool for monitoring async operations
this.createTool(
  "check-generation-status",
  "Check status of async content generation jobs",
  { jobIds: z.array(z.string()) },
  async ({ jobIds }) => {
    const statuses = await this.siteContentManager.getJobStatuses(jobIds);
    return statuses;
  },
);
```

### Step 5: Error Handling Strategy

#### Job-Level Error Handling

- Individual job failures don't stop entire operation
- Failed jobs are logged with specific error messages
- Retry mechanism through job queue (configurable retries)

#### Operation-Level Error Handling

- Partial success results include both successful and failed sections
- Clear error reporting per section
- Rollback capability for failed operations

## API Design

### New SiteContentManager Constructor

```typescript
constructor(
  private readonly entityService: EntityService,
  private readonly logger?: Logger,
  private readonly pluginContext?: PluginContext, // Required for async operations
) {}
```

### Job Status Response Format

```typescript
interface JobStatusSummary {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  jobs: Array<{
    jobId: string;
    sectionId: string;
    status: "pending" | "processing" | "completed" | "failed";
    error?: string;
  }>;
}
```

### Enhanced GenerateResult

```typescript
interface GenerateResult {
  success: boolean;
  sectionsGenerated: number;
  totalSections: number;
  generated: Array<{
    page: string;
    section: string;
    entityId: string;
    entityType: string;
    jobId?: string; // Added for async tracking
  }>;
  skipped: Array<{
    page: string;
    section: string;
    reason: string;
  }>;
  errors?: string[];
  jobIds?: string[]; // Added for async operations
}
```

## Data Flow Diagrams

### Current Synchronous Flow

```
[Plugin Tool]
    ↓ (calls generate)
[SiteContentManager.generate]
    ↓ (for each section)
[Callback Function]
    ↓ (calls generateWithRoute)
[ContentGenerator.generateWithRoute]
    ↓ (synchronous)
[AI Service]
    ↓ (returns content)
[Entity Creation]
    ↓
[Database Storage]
```

### Proposed Asynchronous Flow

```
[Plugin Tool]
    ↓ (calls generateAsync)
[SiteContentManager.generateAsync]
    ↓ (for each section)
[Job Queue]
    ↓ (enqueue content-generation jobs)
[JobQueueWorker]
    ↓ (background processing)
[ContentGenerationJobHandler]
    ↓ (calls ContentGenerator)
[AI Service]
    ↓ (returns content)
[Job Result Storage]
    ↓
[SiteContentManager.waitAndCreateEntities]
    ↓ (processes results)
[Entity Creation]
    ↓
[Database Storage]
```

## Migration Strategy

### Phase 1: Infrastructure (Completed)

- ✅ Generic job queue system
- ✅ ContentGenerationJobHandler
- ✅ PluginContext async methods

### Phase 2: SiteContentManager Async Methods

- Add async content generation methods
- Implement job tracking and result processing
- Add error handling and progress monitoring

### Phase 3: Plugin Tool Migration

- Update existing tools to support async operations
- Add progress tracking capabilities
- Maintain backward compatibility options

### Phase 4: User Experience Enhancements (COMPLETED)

- ✅ Add job status monitoring tools
- ✅ Implement operation cancellation
- ✅ Add progress indicators for long-running operations

### Phase 5: Long-Running Operations Async Migration

#### Problem Statement

Current methods like `promote`, `generate`, `regenerate`, and `generateAll` use async entity operations but execute them sequentially with `await`, making the overall operations blocking. For large datasets (100+ entities), this blocks the interface and prevents progress monitoring.

#### Solution: True Async Pattern

**Step 1: Rename Existing Methods (Add Sync Suffix)**

```typescript
// Current blocking methods become explicit sync variants
promote() → promoteSync()
generate() → generateSync()
regenerate() → regenerateSync()
generateAll() → generateAllSync()
```

**Step 2: Design Specialized Job Interfaces**

After analysis, different operations require different job tracking information:

```typescript
// For AI-based content operations (generate/regenerate)
interface ContentGenerationJob {
  jobId: string; // Content generation job ID
  entityId: string; // Target entity ID (deterministic)
  entityType: "site-content-preview" | "site-content-production";
  operation: "generate" | "regenerate";
  page: string;
  section: string;
  templateName: string; // For AI generation
  route: RouteDefinition; // For AI context
  sectionDefinition: SectionDefinition; // For AI context
  mode?: "leave" | "new" | "with-current"; // For regenerate only
}

// For entity management operations (promote/rollback)
interface EntityOperationJob {
  jobId: string; // Entity operation job ID
  entityId: string; // Source entity ID
  targetEntityId?: string; // For promote (production entity ID)
  entityType: "site-content-preview" | "site-content-production";
  operation: "promote" | "rollback";
  page: string;
  section: string;
}
```

**Step 3: Create True Async Variants (Operation-Specific Types)**

```typescript
// Content generation operations return ContentGenerationJob[]
generateAsync() → Promise<{jobs: ContentGenerationJob[], ...}> // Already exists
regenerateAsync() → Promise<{jobs: ContentGenerationJob[], ...}>
generateAllAsync() → Promise<{jobs: ContentGenerationJob[], ...}>

// Entity operations return EntityOperationJob[]
promoteAsync() → Promise<{jobs: EntityOperationJob[], ...}>
rollbackAsync() → Promise<{jobs: EntityOperationJob[], ...}>
```

**Step 4: Add Progress Tracking Infrastructure**

```typescript
// Content generation job utilities
waitForContentJobs(jobs: ContentGenerationJob[], progressCallback) → Promise<Result>
getContentJobStatuses(jobs: ContentGenerationJob[]) → Promise<JobStatusSummary>

// Entity operation job utilities
waitForEntityJobs(jobs: EntityOperationJob[], progressCallback) → Promise<Result>
getEntityJobStatuses(jobs: EntityOperationJob[]) → Promise<JobStatusSummary>

// Complete variants for convenience
promoteAsyncComplete() → Promise<Result>
regenerateAsyncComplete() → Promise<Result>
rollbackAsyncComplete() → Promise<Result>
generateAllAsyncComplete() → Promise<Result>
```

**Step 5: Update Plugin Tools**

- Update all plugin tools to use new async methods with `Async` suffix
- Provide both sync and async variants for different use cases
- Add progress reporting to long-running operations
- Handle both ContentGenerationJob and EntityOperationJob types appropriately

#### Benefits

- **Non-blocking**: Operations return immediately with job tracking
- **Progress Monitoring**: Real-time status updates during processing
- **Scalability**: Handle large datasets without blocking UI
- **Type Safety**: Operation-specific job interfaces provide better type checking
- **Consistency**: All async methods follow established `Async` suffix pattern
- **Separation of Concerns**: Content generation vs entity operations use appropriate metadata

### Backward Compatibility

- Keep existing synchronous methods
- Add feature flags for async vs sync operation
- Gradual migration of tools to async versions

## Testing Strategy

### Unit Tests

- SiteContentManager async methods
- Job tracking and result processing
- Error handling for partial failures
- Template resolution logic

### Integration Tests

- End-to-end async content generation
- Plugin tool async operations
- Job queue integration
- Entity creation with async results

### Performance Tests

- Bulk content generation benchmarks
- Memory usage during large operations
- Job queue throughput testing
- Progress tracking accuracy

### User Experience Tests

- Progress tracking during operations
- Error reporting clarity
- Operation cancellation functionality
- Recovery from failed operations

## Performance Considerations

### Expected Improvements

- **Non-blocking Operations**: UI remains responsive during content generation
- **Parallel Processing**: Multiple content generation jobs can run concurrently
- **Resource Optimization**: Better memory usage for large operations
- **Progress Visibility**: Real-time status updates for users

### Trade-offs

- **Complexity**: More complex error handling and state management
- **Latency**: Small overhead for job queue operations
- **Storage**: Additional job tracking data
- **Debugging**: More complex debugging with async operations

### Benchmarks

- Target: 10x faster for bulk operations (parallel processing)
- Memory: 50% reduction for large content generation runs
- Responsiveness: UI remains responsive during all operations

## Risk Assessment

### High Risk Items

1. **Job-to-Entity Mapping**: Complex tracking of async results
   - **Mitigation**: Deterministic job tracking with comprehensive tests

2. **Template Resolution**: Ensuring async jobs use correct templates
   - **Mitigation**: Explicit template validation and testing

3. **Partial Failures**: Handling mixed success/failure scenarios
   - **Mitigation**: Robust error handling and clear user feedback

### Medium Risk Items

1. **Performance Regression**: Async overhead for small operations
   - **Mitigation**: Keep sync methods for small operations

2. **Data Consistency**: Race conditions in concurrent operations
   - **Mitigation**: Proper locking and atomic operations

### Low Risk Items

1. **User Experience**: Learning curve for new async operations
   - **Mitigation**: Clear documentation and gradual rollout

## Implementation Timeline

### Week 1: Core Infrastructure (COMPLETED)

- ✅ Implement SiteContentManager async methods
- ✅ Add job tracking system
- ✅ Create basic error handling

### Week 2: Plugin Integration (COMPLETED)

- ✅ Update plugin tools for async operations
- ✅ Add progress tracking
- ✅ Implement status monitoring

### Week 3: Long-Running Operations (Phase 5)

- ✅ Rename existing blocking methods to use Sync suffix
- Define ContentGenerationJob and EntityOperationJob interfaces
- Update generateAsync to return ContentGenerationJob[]
- Implement promoteAsync returning EntityOperationJob[]
- Implement regenerateAsync returning ContentGenerationJob[]
- Implement rollbackAsync returning EntityOperationJob[]
- Create waitForEntityJobs and waitForContentJobs utilities
- Update plugin tools to use new async methods

### Week 4: Testing & Polish

- Comprehensive testing suite
- Performance optimization
- Documentation and examples

### Week 4: Rollout & Monitoring

- Gradual feature rollout
- Monitor performance metrics
- User feedback integration

## Success Criteria

1. **Functionality**: All existing site-builder operations work with async implementation
2. **Performance**: 5x improvement in bulk operation responsiveness
3. **Reliability**: 99.9% job completion rate with proper error handling
4. **User Experience**: Clear progress tracking and error reporting
5. **Compatibility**: Zero breaking changes to existing API
6. **Maintainability**: Clean code with comprehensive test coverage

## Next Steps

1. Create SiteContentJob tracking interfaces
2. Implement SiteContentManager async methods
3. Update plugin constructor to pass PluginContext
4. Add job status monitoring capabilities
5. Create comprehensive test suite
6. Update plugin tools for async operations

This migration will significantly improve the site-builder plugin's performance and user experience while maintaining compatibility with existing workflows.
