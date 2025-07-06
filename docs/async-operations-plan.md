# Async Operations & Job Queue Package Plan

## Overview

This document outlines the plan for:

1. Extracting job queue into a new shared package (`@brains/job-queue`)
2. Implementing non-blocking batch operations using the job queue
3. Updating interfaces (CLI, Matrix) to handle async operations with progress reporting
4. **[NEW]** Smart auto-detection of async operations without exposing sync/async choice to users

## Current State

Currently:

- Job queue components are embedded in entity-service package
- Batch operations are synchronous and blocking
- No batch promote/rollback operations exist
- CLI and Matrix interfaces freeze during long operations

## Core Design Principles (Updated)

1. **Smart Auto-Detection**: Tools automatically determine if an operation should be async based on workload
2. **Transparent Progress**: All tools leverage MCP's native progress notification support
3. **Consistent UX**: Same experience across CLI, Matrix, and MCP interfaces
4. **No Mode Switching**: Remove explicit async flags from user-facing APIs

## Phase 1: Job Queue Package Extraction (Day 1 Morning) ✅

### 1.1 Create New Package Structure ✅

```
shared/job-queue/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── job-queue-service.ts
│   ├── job-queue-worker.ts
│   ├── types.ts
│   ├── handlers/
│   │   └── base-handler.ts
│   └── utils/
│       └── job-tracking.ts
└── test/
    ├── job-queue-service.test.ts
    ├── job-queue-worker.test.ts
    └── utils/
```

### 1.2 Move Core Components ✅

From `shell/entity-service/src/job-queue/`:

- `jobQueueService.ts` → `shared/job-queue/src/job-queue-service.ts`
- `jobQueueWorker.ts` → `shared/job-queue/src/job-queue-worker.ts`
- `types.ts` → `shared/job-queue/src/types.ts`

Job handlers stay in their respective packages:

- Embedding handler remains in entity-service
- Content generation handler moves to content-management

### 1.3 Update Dependencies ✅

```json
// shell/job-queue/package.json
{
  "name": "@brains/job-queue",
  "dependencies": {
    "@brains/db": "workspace:*",
    "@brains/types": "workspace:*",
    "@brains/utils": "workspace:*",
    "@brains/messaging-service": "workspace:*"
  }
}
```

Update direct consumers (core services only):

- `@brains/entity-service` to depend on `@brains/job-queue` (for EmbeddingJobHandler)
- `@brains/core` to depend on `@brains/job-queue` (for Shell initialization)

**Important**: Plugins should NOT directly import from `@brains/job-queue`. They access job queue functionality through their plugin context.

## Phase 2: Plugin Context Updates (Day 1 Afternoon) ✅

### 2.1 Update Plugin Context Interface ✅

Add generic job queue operations to `shared/plugin-utils/src/interfaces.ts`:

**Important**: The plugin context interface is kept purely generic. No domain-specific job methods (like `enqueueContentGeneration`) are included. All job types use the generic `enqueueJob` method with appropriate type strings.

```typescript
export interface PluginContext {
  // ... existing methods ...

  // Generic job queue access (required)
  enqueueJob: (
    type: string,
    data: unknown,
    options?: {
      priority?: number;
      maxRetries?: number;
    },
  ) => Promise<string>;

  getJobStatus: (jobId: string) => Promise<{
    status: "pending" | "processing" | "completed" | "failed";
    result?: unknown;
    error?: string;
  } | null>;

  waitForJob: (jobId: string, timeoutMs?: number) => Promise<unknown>;

  // Batch operations (required)
  enqueueBatch: (
    operations: Array<{
      type: string;
      entityId?: string;
      entityType?: string;
      options?: Record<string, unknown>;
    }>,
    options?: {
      userId?: string;
      priority?: number;
      maxRetries?: number;
    },
  ) => Promise<string>;

  getBatchStatus: (batchId: string) => Promise<{
    batchId: string;
    totalOperations: number;
    completedOperations: number;
    failedOperations: number;
    currentOperation?: string;
    errors: string[];
    status: "pending" | "processing" | "completed" | "failed";
  } | null>;

  // Job handler registration (for plugins that process jobs)
  registerJobHandler?: (type: string, handler: JobHandler) => void;
}
```

### 2.2 Update PluginContextFactory ✅

Implement the new methods in `shell/core/src/plugins/pluginContextFactory.ts` to properly expose job queue functionality to plugins.

**Implementation Notes**:

- Remove any domain-specific job methods (like `enqueueContentGeneration`)
- Implement only the generic job queue methods listed above
- All job types (content generation, embeddings, batch operations, etc.) go through the generic interface
- Example: Content generation would use `context.enqueueJob("content-generation", { templateName, context, userId })`

### 2.3 Removed Methods ✅

The following methods were removed from PluginContext to maintain a clean, generic interface:

1. **`enqueueContentGeneration`** - Replaced by `enqueueJob("content-generation", data)`
   - This was a domain-specific wrapper that added no value over the generic method
   - Plugins can achieve the same result with the generic `enqueueJob`

2. **Duplicate `getJobStatus`** - Consolidated into one generic method
   - Previously had both content-specific and generic versions
   - Now only the generic version remains

## Phase 3: Batch Operations Infrastructure (Day 1 Afternoon - continued) ✅

### 3.1 Create BatchJobManager ✅

Location: `shell/job-queue/src/batch-job-manager.ts`

```typescript
export interface BatchOperation {
  type: "generate" | "promote" | "rollback";
  entityId?: string;
  entityType?: string;
  options?: Record<string, unknown>;
}

export interface BatchStatus {
  batchId: string;
  totalOperations: number;
  completedOperations: number;
  failedOperations: number;
  currentOperation?: string;
  errors: string[];
  status: "pending" | "processing" | "completed" | "failed";
}

export class BatchJobManager {
  constructor(
    private jobQueue: IJobQueueService,
    private messageBus: MessageBus,
    private contentManager: ContentManager,
  ) {}

  async enqueueBatch(
    operations: BatchOperation[],
    userId?: string,
  ): Promise<string> {
    // Create parent batch job
    const batchId = await this.jobQueue.enqueue("batch-operation", {
      operations,
      userId,
      startedAt: new Date().toISOString(),
    });

    // Start progress tracking
    this.trackProgress(batchId, operations);

    return batchId;
  }

  async getBatchStatus(batchId: string): Promise<BatchStatus | null> {
    const job = await this.jobQueue.getStatus(batchId);
    if (!job) return null;

    // Parse job data to get batch status
    return this.parseBatchStatus(job);
  }

  private async trackProgress(batchId: string, operations: BatchOperation[]) {
    // Emit progress updates via MessageBus
    await this.messageBus.publish("batch-progress", {
      batchId,
      totalOperations: operations.length,
      completedOperations: 0,
      status: "processing",
    });
  }
}
```

### 3.2 Update ContentManager (REVISED - Async Only) ✅

After implementation review, we've decided to eliminate sync methods entirely for a cleaner, more consistent API:

**Benefits of Async-Only:**
- Single, consistent API - no confusion about which method to use
- Always non-blocking - better performance and UX
- Simpler codebase - no duplicate logic to maintain
- Built-in progress tracking for all operations
- Future-proof - scales naturally with workload

```typescript
class ContentManager {
  constructor(
    private context: PluginContext,  // Injected during plugin registration
    // ... other dependencies
  ) {}

  // All operations are now async-only
  async generate(options: GenerateOptions): Promise<string> {
    const operations = await this.buildGenerateOperations(options);
    return this.context.enqueueBatch(operations, {
      userId: options.userId,
      priority: options.priority
    });
  }

  async promote(ids: string[], options?: BatchOptions): Promise<string> {
    const operations = ids.map(id => ({
      type: 'content-promote' as const,
      entityId: id,
      entityType: 'site-content-preview'
    }));
    return this.context.enqueueBatch(operations, options);
  }

  async rollback(ids: string[], options?: BatchOptions): Promise<string> {
    const operations = ids.map(id => ({
      type: 'content-rollback' as const,
      entityId: id,
      entityType: 'site-content-production'
    }));
    return this.context.enqueueBatch(operations, options);
  }

  // Check batch status
  async getBatchStatus(batchId: string): Promise<BatchStatus | null> {
    return this.context.getBatchStatus(batchId);
  }

  // Helper to wait for batch completion (useful for tests/scripts)
  async waitForBatch(batchId: string, timeoutMs = 60000): Promise<BatchStatus> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const status = await this.getBatchStatus(batchId);
      if (status && (status.status === 'completed' || status.status === 'failed')) {
        return status;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error(`Batch ${batchId} timed out after ${timeoutMs}ms`);
  }
}
```

### 3.3 Job Handler Registration Pattern

Plugins register their job handlers during the registration phase:

```typescript
// plugins/site-builder/src/plugin.ts
export class SiteBuilderPlugin extends BasePlugin {
  async register(context: PluginContext): Promise<PluginCapabilities> {
    // Create content-specific job handlers
    const generateHandler = new ContentGenerationJobHandler(
      context,
      this.contentManager,
    );
    const promoteHandler = new ContentPromotionJobHandler(
      context,
      this.contentManager,
    );

    // Register handlers if the plugin processes jobs
    if (context.registerJobHandler) {
      context.registerJobHandler("content-generate", generateHandler);
      context.registerJobHandler("content-promote", promoteHandler);
      context.registerJobHandler("content-rollback", rollbackHandler);
    }

    // ... rest of plugin registration
  }
}
```

The generic batch operation handler in job-queue will delegate to these registered handlers based on operation type.

## Phase 4: Simplified Async-Only API Design

### 4.1 ContentManager API Simplification

Remove all sync methods and create a clean, consistent async-only API:

```typescript
// BEFORE: Confusing dual APIs
class ContentManager {
  async generateSync(options, routes, callback): Promise<GenerateResult>
  async generateAsync(options, routes, templateResolver): Promise<{ jobs: Job[] }>
  async generateAllAsync(options, routes, templateResolver): Promise<string>
  async promoteSync(options): Promise<PromoteResult>
  async promoteAsync(ids): Promise<string>
  async rollbackSync(options): Promise<RollbackResult>
  async rollbackAsync(ids): Promise<string>
}

// AFTER: Clean, consistent API
class ContentManager {
  async generate(options: GenerateOptions, routes: RouteDefinition[]): Promise<string>
  async promote(ids: string[], options?: BatchOptions): Promise<string>
  async rollback(ids: string[], options?: BatchOptions): Promise<string>
  async getBatchStatus(batchId: string): Promise<BatchStatus | null>
  async waitForBatch(batchId: string, timeoutMs?: number): Promise<BatchStatus>
}
```

### 4.2 Tool Implementation Pattern

All tools follow the same pattern - immediate return with batch ID:

```typescript
// Generate tool (single or multiple sections)
this.createTool(
  "generate",
  "Generate content for pages",
  {
    page: z.string().optional(),
    section: z.string().optional(),
    dryRun: z.boolean().default(false),
  },
  async (input) => {
    const batchId = await this.contentManager.generate(
      input,
      this.context.listRoutes()
    );
    
    const sectionCount = calculateSections(input);
    return {
      status: "queued",
      message: `Generating ${sectionCount} section(s).`,
      batchId,
      tip: "This operation is running in the background."
    };
  }
);
```

## Phase 5: Smart Tool Design Pattern (REVISED)

### 5.1 Always-Async Pattern

After implementation review, we've decided to use an "always-async" approach for better consistency:

**Benefits of Always-Async:**
- Consistent user experience - always returns immediately
- Never blocks the interface, even for small operations  
- Simpler implementation - no threshold logic needed
- Unified progress tracking for all operations
- Users can always continue working

**Implementation Pattern:**

```typescript
// Example: generate-all tool in site-builder
this.createTool(
  "generate-all",
  "Generate content for all sections across all pages",
  {
    dryRun: z
      .boolean()
      .optional()
      .default(false)
      .describe("Preview changes without executing"),
  },
  async (input, context) => {
    const routes = this.context.listRoutes();
    const totalSections = countTotalSections(routes);

    // Always use async for consistent UX
    const batchId = await this.contentManager.generateAllAsync(
      { dryRun: input.dryRun },
      routes,
      templateResolver,
      "site-content-preview",
      this.config.siteConfig,
    );

    // Return user-friendly response
    return {
      status: "queued",
      message: `Generating ${totalSections} sections.`,
      batchId,
      totalSections,
      tip: totalSections > 0
        ? "This operation is running in the background."
        : "No sections to generate.",
    };
  },
);
```

### 4.2 Unified Status Tool

Add a single, user-friendly tool for checking all background operations:

```typescript
this.createTool(
  "status",
  "Check status of background operations",
  {},
  async (input, context) => {
    // Get all active operations across the system
    const batches = await this.context.getActiveBatches();

    if (batches.length === 0) {
      return {
        message: "No background operations running.",
        operations: [],
      };
    }

    return {
      message: `${batches.length} operation(s) in progress`,
      operations: batches.map((batch) => ({
        type: humanizeOperationType(batch.type),
        status: batch.status,
        progress: `${batch.completedOperations}/${batch.totalOperations}`,
        percentComplete: Math.round(
          (batch.completedOperations / batch.totalOperations) * 100,
        ),
        currentTask: batch.currentOperation,
        startedAt: new Date(batch.startedAt).toRelativeTime(),
        estimatedCompletion: estimateCompletion(batch),
      })),
    };
  },
);
```

## Phase 5: Interface Updates

### 5.1 CLI Interface

Update CLI to show progress bars:

```typescript
// interfaces/cli/src/components/BatchProgress.tsx
export function BatchProgress({ batchId, onComplete }) {
  const [status, setStatus] = useState<BatchStatus>();

  useEffect(() => {
    const unsubscribe = messageBus.subscribe('batch-progress', (msg) => {
      if (msg.batchId === batchId) {
        setStatus(msg);
        if (msg.status === 'completed') {
          onComplete(msg);
        }
      }
    });
    return unsubscribe;
  }, [batchId]);

  if (!status) return <Text>Starting batch operation...</Text>;

  return (
    <Box flexDirection="column">
      <Text>{status.currentOperation || 'Processing...'}</Text>
      <ProgressBar
        percent={status.completedOperations / status.totalOperations * 100}
      />
      <Text dimColor>
        {status.completedOperations} / {status.totalOperations} operations
      </Text>
    </Box>
  );
}
```

### 5.2 Matrix Interface

Implement message editing for progress:

```typescript
// interfaces/matrix/src/matrix-interface.ts
private async handleBatchOperation(
  command: string,
  args: string[],
  context: MessageContext
): Promise<void> {
  // Send initial message
  const progressMessage = await this.client.sendMessage(
    context.channelId,
    "Starting batch operation..."
  );

  // Start operation
  const batchId = await this.executeBatchCommand(command, args);

  // Subscribe to progress
  const unsubscribe = this.messageBus.subscribe('batch-progress', async (msg) => {
    if (msg.batchId === batchId) {
      // Edit message with progress
      await this.client.editMessage(
        context.channelId,
        progressMessage.event_id,
        `Progress: ${msg.completedOperations}/${msg.totalOperations}\n` +
        `Current: ${msg.currentOperation}`
      );

      if (msg.status === 'completed') {
        unsubscribe();
        await this.client.editMessage(
          context.channelId,
          progressMessage.event_id,
          `✅ Batch operation completed: ${msg.completedOperations} operations`
        );
      }
    }
  });
}
```

### 5.3 MCP Interface

MCP interface leverages native progress support - no special handling needed.

## Migration Strategy (REVISED)

### Phase 1: Core Infrastructure ✅
1. ~~Extract job queue package~~ ✅
2. ~~Implement batch operations~~ ✅
3. ~~Always-async pattern for all tools~~ ✅

### Phase 2: API Simplification (NEW)
1. Remove all sync methods from ContentManager
2. Update all tools to use async-only API
3. Ensure consistent return format (batch ID + status message)
4. Update tests to work with async-only operations

### Phase 3: User Experience
1. Implement unified status checking tool
2. Enhance CLI progress displays  
3. Improve Matrix message formatting
4. Add operation time estimates

### Phase 4: Documentation & Polish
1. Update all tool documentation for async-only
2. Create user guide for background operations
3. Add integration tests for async flows
4. Deploy and gather feedback

## Architectural Principles

1. **Plugin Context Boundary**: Plugins should NEVER directly import from core services like `@brains/job-queue`. All system interaction goes through the plugin context.

2. **Generic Infrastructure Only**: Plugin context provides only generic infrastructure methods. Domain-specific job types (content generation, embeddings, etc.) are handled through the generic `enqueueJob` with appropriate type strings. This keeps the plugin boundary clean and extensible.

3. **Job Handler Registration**: Plugins that process jobs register their handlers during the `register()` phase, not by importing job queue directly.

4. **Dependency Flow**:
   - Core services (shell/\*) can import from each other
   - Plugins can only import from shared/\* packages
   - Plugins access shell services through their context

5. **Batch Operations as Core Infrastructure**: BatchJobManager lives in shell/job-queue because it's generic infrastructure, not domain-specific logic.

## Benefits

1. **Clean Architecture**: Job queue as a reusable package with proper boundaries
2. **Non-blocking Operations**: No more frozen interfaces
3. **Progress Visibility**: Real-time updates for long operations
4. **Scalability**: Easy to add new job types
5. **Testability**: Isolated components with clear responsibilities
6. **Plugin Isolation**: Plugins remain decoupled from core infrastructure
7. **Better UX**: No confusing async/sync choice for users
8. **Simpler API**: Tools have fewer parameters
9. **Smarter System**: Automatic optimization based on workload

## Example User Flows (Async-Only)

### All Operations (Consistent Experience)

```
User: generate-all
System: Queued generation of 5 sections.
        This operation is running in the background.

User: generate --page landing --section hero  
System: Queued generation of 1 section.
        This operation is running in the background.

User: promote-all
System: Queued promotion of 12 sections to production.
        This operation is running in the background.

User: status
System: 3 operations in progress:
        - Content Generation: 5/5 sections (100%) - completing...
        - Content Generation: 1/1 sections (100%) - completed
        - Content Promotion: 8/12 sections (67%)
          Currently: Promoting about/team
          Started: 30 seconds ago
```

### Single vs Batch - Same Experience

```
# Single section
User: generate --page landing --section hero
System: Queued generation of 1 section.
        This operation is running in the background.

# All sections  
User: generate-all
System: Queued generation of 47 sections.
        This operation is running in the background.

# Both return immediately, both trackable via status
```

## Timeline

- **Day 1 Morning** (4 hours): Extract job queue package ✅
- **Day 1 Afternoon** (4 hours): Implement batch operations ✅
- **Day 2 Morning** (4 hours): Update interfaces
- **Day 2 Afternoon** (4 hours): Testing and migration
- **Total**: 2 days (16 hours)

## Future Enhancements

1. Job cancellation support
2. Job priority levels
3. Resource throttling (max concurrent operations)
4. Persistent job history
5. Web UI for job monitoring
6. Distributed job processing
7. WebSocket support for real-time updates
8. Batch operation templates
9. Scheduled operations
