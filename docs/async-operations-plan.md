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
    private context: PluginContext, // Injected during plugin registration
    // ... other dependencies
  ) {}

  // All operations are now async-only
  async generate(options: GenerateOptions): Promise<string> {
    const operations = await this.buildGenerateOperations(options);
    return this.context.enqueueBatch(operations, {
      userId: options.userId,
      priority: options.priority,
    });
  }

  async promote(ids: string[], options?: BatchOptions): Promise<string> {
    const operations = ids.map((id) => ({
      type: "content-promote" as const,
      entityId: id,
      entityType: "site-content-preview",
    }));
    return this.context.enqueueBatch(operations, options);
  }

  async rollback(ids: string[], options?: BatchOptions): Promise<string> {
    const operations = ids.map((id) => ({
      type: "content-rollback" as const,
      entityId: id,
      entityType: "site-content-production",
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
      if (
        status &&
        (status.status === "completed" || status.status === "failed")
      ) {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
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
  async generateSync(options, routes, callback): Promise<GenerateResult>;
  async generateAsync(
    options,
    routes,
    templateResolver,
  ): Promise<{ jobs: Job[] }>;
  async generateAllAsync(options, routes, templateResolver): Promise<string>;
  async promoteSync(options): Promise<PromoteResult>;
  async promoteAsync(ids): Promise<string>;
  async rollbackSync(options): Promise<RollbackResult>;
  async rollbackAsync(ids): Promise<string>;
}

// AFTER: Clean, consistent API
class ContentManager {
  async generate(
    options: GenerateOptions,
    routes: RouteDefinition[],
  ): Promise<string>;
  async promote(ids: string[], options?: BatchOptions): Promise<string>;
  async rollback(ids: string[], options?: BatchOptions): Promise<string>;
  async getBatchStatus(batchId: string): Promise<BatchStatus | null>;
  async waitForBatch(batchId: string, timeoutMs?: number): Promise<BatchStatus>;
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
      this.context.listRoutes(),
    );

    const sectionCount = calculateSections(input);
    return {
      status: "queued",
      message: `Generating ${sectionCount} section(s).`,
      batchId,
      tip: "This operation is running in the background.",
    };
  },
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
      tip:
        totalSections > 0
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

### Phase 2: API Simplification ✅

1. ~~Remove all sync methods from ContentManager~~ ✅
2. ~~Update all tools to use async-only API~~ ✅
3. ~~Ensure consistent return format (batch ID + status message)~~ ✅
4. ~~Update tests to work with async-only operations~~ ✅

### Phase 3: MCP Compatibility & User Experience

**Critical Issues Discovered During MCP Testing:**

#### 3.1 Generate Tool Blocking Behavior (HIGH PRIORITY) 🔴

**Problem**: Generate tool still blocks despite async refactoring

- Uses `waitForContentJobs()` with 60-second timeout
- Inconsistent with promote/rollback tools that return batch IDs immediately
- Creates confusing LLM experience (some tools async, some blocking)

**Solution**:

- Remove blocking `waitForContentJobs()` call from generate tool
- Return batch ID immediately like other tools
- Ensure consistent async behavior across all tools

#### 3.2 Missing rollbackAll Feature (HIGH PRIORITY) 🔴

**Problem**: Incomplete feature parity

- `promoteAll()` method and `promote-all` tool exist
- No equivalent `rollbackAll()` method or `rollback-all` tool
- LLMs can promote all but can't rollback all

**Solution**:

- Add `rollbackAll()` method to SiteOperations class
- Add `rollback-all` tool to plugin (parallel to `promote-all`)
- Follow same pattern as promoteAll: calls `rollback({ dryRun: false })`

#### 3.3 Missing Unified Status Tool (HIGH PRIORITY) 🔴

**Problem**: No unified way to check job/batch operation status

- Tools say "Use the status tool to check progress" but no status tool exists
- Current plugin-specific status tools (directory-sync:status) are for domain-specific info, not job status
- No way to see all active operations across the system

**Architectural Insight**: Job status is an infrastructure concern

- Job queue is managed at shell level, status should be too
- Plugin-specific status tools create redundancy and inconsistency
- Users need one place to check all background operations

**Solution**: Implement shell-level status tool

1. Add to JobQueueService:
   - `getActiveJobs(types?: string[])` - Query active jobs by type
   - `getJobsByStatus(status: JobStatus)` - Get jobs by status

2. Add to BatchJobManager:
   - `getActiveBatches()` - Return active batch metadata
   - Track which plugin initiated each batch

3. Create shell:status tool:
   - Registered by shell itself, not plugins
   - Shows all active operations across all plugins
   - Unified format for consistent UX
   - Filterable by plugin, type, or status

#### 3.4 User Experience Improvements (MEDIUM PRIORITY) 🟡

1. Implement CLI progress bars for batch operations
2. Add Matrix message editing for progress updates
3. Update tool descriptions for clarity
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

6. **Status as Infrastructure**: Job and batch status reporting is an infrastructure concern that belongs at the shell level. The shell manages the job queue, so it should also provide unified status reporting. Plugin-specific status tools should only report domain-specific information, not job queue status.

## Infrastructure vs Domain Concerns

### Infrastructure (Shell-Level):

- Job queue management
- Batch operation tracking
- Status reporting for jobs/batches
- Progress notifications
- Operation timing and estimates

### Domain (Plugin-Level):

- Business logic and rules
- Domain-specific formatting
- Entity-specific operations
- Domain-specific status (e.g., "sync conflicts" for directory-sync)

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

## Example User Flows (Fixed Async-Only)

### MCP LLM Experience (After Fixes)

```
LLM: generate --page landing
System: {
  "status": "queued",
  "batchId": "batch-123",
  "message": "Generating 3 sections",
  "tip": "Use the status tool to check progress"
}

LLM: promote-all
System: {
  "status": "queued",
  "batchId": "batch-456",
  "message": "Promoting 12 sections to production",
  "tip": "Use the status tool to check progress"
}

LLM: rollback-all
System: {
  "status": "queued",
  "batchId": "batch-789",
  "message": "Rolling back 8 production sections",
  "tip": "Use the status tool to check progress"
}

LLM: shell:status
System: {
  "message": "3 background operations in progress",
  "operations": [
    {
      "batchId": "batch-123",
      "plugin": "site-builder",
      "type": "content-generation",
      "progress": "3/3 sections (100%)",
      "status": "completed",
      "startedAt": "2 minutes ago"
    },
    {
      "batchId": "batch-456",
      "plugin": "site-builder",
      "type": "content-promotion",
      "progress": "8/12 sections (67%)",
      "status": "processing",
      "currentTask": "Promoting about:team",
      "startedAt": "30 seconds ago"
    },
    {
      "batchId": "batch-789",
      "plugin": "site-builder",
      "type": "content-rollback",
      "progress": "2/8 sections (25%)",
      "status": "processing",
      "startedAt": "10 seconds ago"
    }
  ]
}
```

### CLI/Matrix Experience (Consistent)

```
User: generate --page landing --section hero
System: Queued generation of 1 section.
        This operation is running in the background.
        Use 'status' to check progress.

User: promote-all
System: Queued promotion of 12 sections to production.
        This operation is running in the background.
        Use 'status' to check progress.

User: rollback-all
System: Queued rollback of 8 production sections.
        This operation is running in the background.
        Use 'status' to check progress.

User: status
System: 3 background operations in progress:
        - [site-builder] content-generation [batch-123]: 1/1 sections (100%) - completed
        - [site-builder] content-promotion [batch-456]: 8/12 sections (67%) - promoting about:team
        - [site-builder] content-rollback [batch-789]: 2/8 sections (25%) - processing
```

## Timeline

- **Day 1 Morning** (4 hours): Extract job queue package ✅
- **Day 1 Afternoon** (4 hours): Implement batch operations ✅
- **Day 2 Morning** (4 hours): Update interfaces
- **Day 2 Afternoon** (4 hours): Testing and migration
- **Total**: 2 days (16 hours)

## Phase 6: Plugin-Specific Job Handlers (NEW)

### 6.1 Problem Statement

Currently, all job handlers are registered directly in the shell, which:
- Violates plugin boundaries (shell shouldn't know about plugin-specific jobs)
- Prevents plugins from defining truly custom background operations
- Limits extensibility of the job queue system

### 6.2 Solution: Dynamic Job Handler Registration

#### 6.2.1 Enable PluginJobDefinitions Augmentation

Plugins can augment the job type definitions:

```typescript
// plugins/site-builder/src/types.ts
declare module "@brains/db" {
  interface PluginJobDefinitions {
    "site-build": {
      input: SiteBuildJobData;
      output: BuildResult;
    };
  }
}

export interface SiteBuildJobData {
  outputDir: string;
  siteConfig?: SiteConfig;
  workingDir?: string;
  clean?: boolean;
}

export interface BuildResult {
  success: boolean;
  routesBuilt: number;
  errors: string[];
  warnings: string[];
  outputDir: string;
}
```

#### 6.2.2 Implement registerJobHandler in PluginContextFactory

Update `shell/core/src/plugins/pluginContextFactory.ts`:

```typescript
export class PluginContextFactory {
  // Track plugin-specific handlers
  private pluginHandlers = new Map<string, Map<string, JobHandler>>();

  createContext(pluginId: string): PluginContext {
    return {
      // ... existing methods ...

      registerJobHandler: (type: string, handler: JobHandler) => {
        // Scope handler to plugin
        const scopedType = `${pluginId}:${type}`;
        
        // Track for cleanup
        if (!this.pluginHandlers.has(pluginId)) {
          this.pluginHandlers.set(pluginId, new Map());
        }
        this.pluginHandlers.get(pluginId)!.set(scopedType, handler);
        
        // Register with job queue
        this.jobQueueService.registerHandler(scopedType, handler);
        
        this.logger.debug(`Registered job handler ${scopedType}`);
      },
    };
  }

  // Clean up handlers when plugin is unloaded
  cleanupPlugin(pluginId: string): void {
    const handlers = this.pluginHandlers.get(pluginId);
    if (handlers) {
      for (const [type, _handler] of handlers) {
        this.jobQueueService.unregisterHandler(type);
      }
      this.pluginHandlers.delete(pluginId);
    }
  }
}
```

#### 6.2.3 Update JobQueueService for Dynamic Registration

Add handler unregistration support:

```typescript
export class JobQueueService implements IJobQueueService {
  private handlers = new Map<string, JobHandler>();

  // Existing method
  public registerHandler(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  // New method for cleanup
  public unregisterHandler(type: string): void {
    this.handlers.delete(type);
    this.logger.debug(`Unregistered handler for job type: ${type}`);
  }

  // Update getRegisteredTypes to show all types
  public getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}
```

### 6.3 Trial Case: Site Builder Build Job

#### 6.3.1 Create SiteBuildJobHandler

```typescript
// plugins/site-builder/src/handlers/siteBuildJobHandler.ts
export class SiteBuildJobHandler implements JobHandler<"site-builder:site-build"> {
  constructor(
    private siteBuilder: SiteBuilder,
    private logger: Logger,
  ) {}

  async process(
    data: SiteBuildJobData,
    jobId: string,
  ): Promise<BuildResult> {
    this.logger.info("Starting site build job", { jobId, outputDir: data.outputDir });

    try {
      // Use existing build method with progress callback
      const result = await this.siteBuilder.build(
        {
          outputDir: data.outputDir,
          siteConfig: data.siteConfig,
          workingDir: data.workingDir,
          clean: data.clean ?? true,
        },
        (message, current, total) => {
          // Could emit progress events here
          this.logger.debug("Build progress", { message, current, total });
        },
      );

      this.logger.info("Site build completed", {
        jobId,
        routesBuilt: result.routesBuilt,
        success: result.errors.length === 0,
      });

      return result;
    } catch (error) {
      this.logger.error("Site build failed", { jobId, error });
      throw error;
    }
  }

  validateAndParse(data: unknown): SiteBuildJobData | null {
    try {
      return siteBuildJobDataSchema.parse(data);
    } catch (error) {
      this.logger.warn("Invalid site build job data", { data, error });
      return null;
    }
  }

  async onError(error: Error, data: SiteBuildJobData, jobId: string): Promise<void> {
    this.logger.error("Site build job error handler", {
      jobId,
      outputDir: data.outputDir,
      error: error.message,
    });
  }
}
```

#### 6.3.2 Register Handler in Plugin

Update `plugins/site-builder/src/plugin.ts`:

```typescript
export class SiteBuilderPlugin extends BasePlugin {
  async register(context: PluginContext): Promise<PluginCapabilities> {
    // ... existing registration ...

    // Register job handler if supported
    if (context.registerJobHandler && this.siteBuilder) {
      const buildHandler = new SiteBuildJobHandler(
        this.siteBuilder,
        this.logger,
      );
      context.registerJobHandler("site-build", buildHandler);
    }

    return {
      tools: await this.getTools(),
      resources: await this.getResources(),
    };
  }

  protected override async getTools(): Promise<PluginTool[]> {
    const tools = await super.getTools();

    // Add build-site tool
    if (this.siteBuilder) {
      tools.push(
        this.createTool(
          "build-site",
          "Build static site from content",
          {
            outputDir: z.string().describe("Output directory for built site"),
            clean: z.boolean().optional().default(true).describe("Clean output directory first"),
          },
          async (input) => {
            // Queue the build job
            const jobId = await this.context.enqueueJob(
              `${this.metadata.id}:site-build`,
              {
                outputDir: input.outputDir,
                siteConfig: this.config.siteConfig,
                clean: input.clean,
              },
            );

            return {
              status: "queued",
              message: "Site build queued",
              jobId,
              tip: "Use the status tool to check build progress",
            };
          },
          "admin", // Building sites is an admin operation
        ),
      );
    }

    return tools;
  }
}
```

### 6.4 Benefits of Plugin Job Handlers

1. **True Plugin Extensibility**: Plugins can define any background operation
2. **Clean Architecture**: Shell doesn't need to know about plugin-specific jobs
3. **Type Safety**: Plugins augment PluginJobDefinitions for full type support
4. **Lifecycle Management**: Handlers are automatically cleaned up when plugins unload
5. **Namespacing**: Plugin job types are automatically scoped to prevent conflicts

### 6.5 Usage Pattern

```typescript
// Plugin defines job type
"site-builder:site-build"

// User triggers via tool
> build-site --output-dir ./dist

// System response
{
  "status": "queued",
  "jobId": "job-xyz",
  "message": "Site build queued",
  "tip": "Use the status tool to check build progress"
}

// Check status
> shell:status
{
  "operations": [{
    "jobId": "job-xyz",
    "type": "site-builder:site-build",
    "status": "processing",
    "plugin": "site-builder",
    "progress": "Building route: /about"
  }]
}
```

### 6.6 Implementation Checklist

- [ ] Update PluginContext interface to make `registerJobHandler` required
- [ ] Implement `registerJobHandler` in PluginContextFactory
- [ ] Add `unregisterHandler` to JobQueueService
- [ ] Create SiteBuildJobHandler in site-builder plugin
- [ ] Add build-site tool to site-builder plugin
- [ ] Update plugin cleanup to unregister handlers
- [ ] Test handler lifecycle (register, process, unregister)
- [ ] Document pattern for other plugins to follow

## Appendix: Completed Work Details

### Phase 1: Job Queue Package Extraction ✅

Successfully extracted job queue from entity-service into `@brains/job-queue` package with proper dependency boundaries.

### Phase 2: Plugin Context Updates ✅

Implemented generic job queue methods in PluginContext, removing all domain-specific methods for cleaner architecture.

### Phase 3: Batch Operations Infrastructure ✅

Created BatchJobManager and converted ContentManager to async-only API with consistent batch operation support.

### Phase 4: MCP Compatibility Fixes ✅

- Fixed generate tool blocking behavior
- Added missing rollbackAll feature
- Implemented shell-level status tool

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
10. Plugin-specific job queues with isolation
