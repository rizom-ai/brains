# Async Operations & Job Queue Package Plan

## Overview

This document outlines the plan for:

1. Extracting job queue into a new shared package (`@brains/job-queue`)
2. Implementing non-blocking batch operations using the job queue
3. Updating interfaces (CLI, Matrix) to handle async operations with progress reporting

## Current State

Currently:

- Job queue components are embedded in entity-service package
- Batch operations are synchronous and blocking
- No batch promote/rollback operations exist
- CLI and Matrix interfaces freeze during long operations

## Phase 1: Job Queue Package Extraction (Day 1 Morning)

### 1.1 Create New Package Structure

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

### 1.2 Move Core Components

From `shell/entity-service/src/job-queue/`:

- `jobQueueService.ts` → `shared/job-queue/src/job-queue-service.ts`
- `jobQueueWorker.ts` → `shared/job-queue/src/job-queue-worker.ts`
- `types.ts` → `shared/job-queue/src/types.ts`

Job handlers stay in their respective packages:

- Embedding handler remains in entity-service
- Content generation handler moves to content-management

### 1.3 Update Dependencies

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

## Phase 2: Plugin Context Updates (Day 1 Afternoon)

### 2.1 Update Plugin Context Interface

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

### 2.2 Update PluginContextFactory

Implement the new methods in `shell/core/src/plugins/pluginContextFactory.ts` to properly expose job queue functionality to plugins.

**Implementation Notes**:

- Remove any domain-specific job methods (like `enqueueContentGeneration`)
- Implement only the generic job queue methods listed above
- All job types (content generation, embeddings, batch operations, etc.) go through the generic interface
- Example: Content generation would use `context.enqueueJob("content-generation", { templateName, context, userId })`

### 2.3 Removed Methods

The following methods were removed from PluginContext to maintain a clean, generic interface:

1. **`enqueueContentGeneration`** - Replaced by `enqueueJob("content-generation", data)`
   - This was a domain-specific wrapper that added no value over the generic method
   - Plugins can achieve the same result with the generic `enqueueJob`

2. **Duplicate `getJobStatus`** - Consolidated into one generic method
   - Previously had both content-specific and generic versions
   - Now only the generic version remains

## Phase 3: Batch Operations Infrastructure (Day 1 Afternoon - continued)

### 3.1 Create BatchJobManager

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

### 3.2 Update ContentManager

ContentManager should use job queue through plugin context, not direct imports:

```typescript
class ContentManager {
  constructor(
    private context: PluginContext,  // Injected during plugin registration
    // ... other dependencies
  ) {}

  // Existing sync methods remain unchanged
  async generateSync(...): Promise<T>
  async promoteSync(...): Promise<T>
  async deriveSync(...): Promise<T>

  // New async batch operations using plugin context
  async generateAllAsync(options: GenerateAllOptions): Promise<string> {
    const operations = await this.buildGenerateOperations(options);
    return this.context.enqueueBatch(operations, {
      userId: options.userId,
      priority: options.priority
    });
  }

  async promoteAsync(ids: string[], userId?: string): Promise<string> {
    const operations = ids.map(id => ({
      type: 'promote' as const,
      entityId: id,
      entityType: 'site-content'
    }));
    return this.context.enqueueBatch(operations, { userId });
  }

  async rollbackAsync(ids: string[], userId?: string): Promise<string> {
    const operations = ids.map(id => ({
      type: 'rollback' as const,
      entityId: id,
      entityType: 'site-content'
    }));
    return this.context.enqueueBatch(operations, { userId });
  }

  // Check batch status
  async getBatchStatus(batchId: string): Promise<BatchStatus | null> {
    return this.context.getBatchStatus(batchId);
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

## Phase 3: Interface Updates (Day 2 Morning)

### 3.1 CLI Interface

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

### 3.2 Matrix Interface

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

### 3.3 MCP Tools

Update tools to support async operations:

```typescript
{
  name: "generate-all",
  description: "Generate all content (async)",
  inputSchema: {
    async: z.boolean().optional().describe("Use async processing"),
    // ... other params
  },
  handler: async (input) => {
    if (input.async) {
      const jobId = await contentManager.generateAllAsync(input);
      return {
        jobId,
        message: "Batch generation started. Use get-job-status to track progress."
      };
    } else {
      // Legacy sync behavior (will be deprecated)
      return await generateAllSync(input);
    }
  }
}
```

## Phase 4: Testing & Migration (Day 2 Afternoon)

### 4.1 Testing Strategy

1. **Unit Tests**:
   - BatchJobManager logic
   - Job handlers for each operation type
   - Progress tracking

2. **Integration Tests**:
   - End-to-end batch operations
   - Progress message flow
   - Error handling and recovery

3. **Interface Tests**:
   - CLI progress bar rendering
   - Matrix message editing
   - MCP async tool handling

### 4.2 Migration Path

1. **Step 1**: Deploy with both sync and async methods available
2. **Step 2**: Update all consumers to use async methods
3. **Step 3**: Mark sync batch methods as deprecated
4. **Step 4**: Remove sync batch methods in next major version

### 4.3 Documentation Updates

- Update API documentation for new async methods
- Add examples for each interface
- Document migration from sync to async

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

## Timeline

- **Day 1 Morning** (4 hours): Extract job queue package
- **Day 1 Afternoon** (4 hours): Implement batch operations
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
