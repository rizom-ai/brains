# Generic Job Queue Implementation Plan

## Background & Problem Statement

**Current State:**
- Embedding queue exists for async embedding generation
- Content generation methods are synchronous and blocking (5-30 seconds per AI call)
- Bulk operations (site generation) block interface for 2-10 minutes
- User concern: "hesitant to create a new queue for each background task"

**Goal:** 
Create a single, extensible job queue that handles all background tasks without proliferation of specialized queues.

## Architecture: Generic Job Queue

### **Core Design Principles:**
1. **Single Infrastructure:** One queue table, one worker, one monitoring system
2. **Type Safety:** TypeScript discriminated unions for job types
3. **Extensibility:** Easy to add new job types via handler registration
4. **Plugin Support:** Plugins can register custom job handlers easily
5. **Maintainability:** Simple to debug, monitor, and extend

### **Job Type System:**
```typescript
// Core job definitions
type CoreJobDefinitions = {
  'embedding': { 
    input: EntityWithoutEmbedding; 
    output: void;
  };
  'content-generation': { 
    input: ContentGenerationRequest; 
    output: string;
  };
}

// Plugin augmentation pattern
declare module '@brains/job-queue' {
  interface PluginJobDefinitions {
    'web-scraping': { input: WebScrapingRequest; output: ScrapedContent };
    'image-generation': { input: ImageRequest; output: string };
    'pdf-export': { input: ExportRequest; output: Buffer };
  }
}

type AllJobDefinitions = CoreJobDefinitions & PluginJobDefinitions;
```

## Implementation Plan

### **Phase 1: Refactor Existing Embedding Queue (1-2 sessions)**

1. **Replace Database Schema:**
   - Replace `embeddingQueue` table with new `jobQueue` table
   - Include `type` field in initial design
   - Migrate existing embedding jobs to type 'embedding'

2. **Create Generic Queue Service:**
   - Replace `EmbeddingQueueService` with `JobQueueService`
   - Implement type-safe `enqueue<T>()` method with discriminated unions
   - Add `registerHandler()` method for plugin extension
   - Clean API designed for generic jobs from start

3. **Create Job Handler System:**
   - Abstract `JobHandler<TInput, TOutput>` interface
   - Implement `EmbeddingJobHandler` for existing embedding logic
   - Job registry for handler lookup by type

### **Phase 2: Generic Worker Implementation (1 session)**

1. **Replace Worker:**
   - Replace `EmbeddingQueueWorker` with `JobQueueWorker`
   - Dynamic handler dispatch based on job type
   - Shared retry logic, error handling, cleanup

2. **Update Shell Integration:**
   - Single worker in Shell initialization
   - Handles multiple job types through handler registry
   - Unified monitoring and health checks

### **Phase 3: Add Content Generation Support (1 session)**

1. **Create Content Generation Handler:**
   - `ContentGenerationJobHandler` implements `JobHandler`
   - Handles AI API calls, retries, and formatting
   - Integrates with existing `ContentGenerator`

2. **Update ContentGenerator:**
   - Add `generateContentAsync()` using job queue
   - Add `getGenerationJobStatus()` for progress tracking
   - Maintain existing sync methods for compatibility

### **Phase 4: Migrate Site-Builder (1 session)**

1. **Update Bulk Operations:**
   - Site content generation uses `generateContentAsync()`
   - Progress tracking via job status
   - Non-blocking bulk operations

2. **Add Job Management:**
   - Cancellation support for long-running operations
   - Progress reporting for multi-section generation

## Plugin Extension Support

### **Plugin Registration Pattern:**
```typescript
class LinkPlugin extends Plugin {
  async register() {
    // Register job handler during plugin initialization
    this.context.jobQueue.registerHandler(
      'web-scraping',
      new WebScrapingJobHandler(this.logger, this.config)
    );
  }
  
  // Plugin tool that uses the job queue
  private async scrapeTool(input: { url: string }) {
    const jobId = await this.context.jobQueue.enqueue('web-scraping', {
      url: input.url,
      timeout: 30000,
      extractionRules: this.config.defaultRules
    });
    
    return { jobId, message: 'Scraping started' };
  }
}
```

### **Handler Implementation:**
```typescript
class WebScrapingJobHandler implements JobHandler<WebScrapingRequest, ScrapedContent> {
  async process(data: WebScrapingRequest): Promise<ScrapedContent> {
    // Plugin-specific logic
    const response = await fetch(data.url);
    const content = await this.extractContent(response);
    return { title: content.title, text: content.text };
  }
  
  async onError(error: Error, data: WebScrapingRequest): Promise<void> {
    // Plugin-specific error handling
    this.logger.error('Web scraping failed', { url: data.url, error });
  }
}
```

## Benefits

### **Immediate:**
- ✅ Non-blocking content generation (2-10 min → immediate response)
- ✅ Single queue infrastructure (no proliferation)
- ✅ Type-safe job handling

### **Long-term:**
- ✅ Easy to add new background task types
- ✅ Plugin-extensible job system
- ✅ Unified monitoring and debugging
- ✅ Consistent async patterns across codebase
- ✅ Minimal maintenance overhead

## Future Extensibility Examples

**Core Team Adding New Job Type:**
```typescript
// Add to core definitions and register handler
type CoreJobDefinitions = {
  // ... existing
  'data-export': { input: ExportRequest; output: Buffer };
}
```

**Plugin Adding New Job Type:**
```typescript
// Plugin augments type system and registers handler
declare module '@brains/job-queue' {
  interface PluginJobDefinitions {
    'image-generation': { input: ImageRequest; output: string };
  }
}

// Registration happens in plugin.register()
jobQueue.registerHandler('image-generation', new ImageGenerationHandler());
```

## Migration Strategy

### **Clean Refactor (No Backward Compatibility):**
- Direct refactor of existing embedding queue to generic job queue
- Update all call sites immediately to use new API
- Clean database schema designed for generic jobs from start

### **Database Migration:**
- Replace `embeddingQueue` table with new `jobQueue` table
- Include `type` field in initial schema design
- Migrate existing embedding jobs to type 'embedding'

## Estimated Effort
- **Total:** 3-4 development sessions (reduced due to no backward compatibility)
- **Phase 1:** 1-2 sessions (clean refactor of existing queue)
- **Phase 2:** 1 session (worker infrastructure)
- **Phase 3:** 1 session (add content generation)
- **Phase 4:** 1 session (migrate site-builder)
- **Result:** Single, extensible queue system that prevents proliferation

## Success Criteria
1. ✅ All background tasks use single job queue
2. ✅ Type-safe job definitions and handlers  
3. ✅ Non-blocking bulk content generation
4. ✅ Easy to add new job types (< 30 lines of code)
5. ✅ Plugins can register custom job handlers easily
6. ✅ Single monitoring/debugging surface for all async work