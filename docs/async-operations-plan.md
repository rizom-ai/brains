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
// shared/job-queue/package.json
{
  "name": "@brains/job-queue",
  "dependencies": {
    "@brains/db": "workspace:*",
    "@brains/types": "workspace:*",
    "@brains/utils": "workspace:*"
  }
}
```

Update consumers:
- `@brains/entity-service` to depend on `@brains/job-queue`
- `@brains/content-management` to depend on `@brains/job-queue`

## Phase 2: Batch Operations Infrastructure (Day 1 Afternoon)

### 2.1 Create BatchJobManager

Location: `shared/content-management/src/operations/batch-job-manager.ts`

```typescript
export interface BatchOperation {
  type: 'generate' | 'promote' | 'rollback';
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
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export class BatchJobManager {
  constructor(
    private jobQueue: IJobQueueService,
    private messageBus: MessageBus,
    private contentManager: ContentManager
  ) {}

  async enqueueBatch(
    operations: BatchOperation[],
    userId?: string
  ): Promise<string> {
    // Create parent batch job
    const batchId = await this.jobQueue.enqueue('batch-operation', {
      operations,
      userId,
      startedAt: new Date().toISOString()
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
    await this.messageBus.publish('batch-progress', {
      batchId,
      totalOperations: operations.length,
      completedOperations: 0,
      status: 'processing'
    });
  }
}
```

### 2.2 Update ContentManager

Add async batch methods:

```typescript
class ContentManager {
  // Existing sync methods remain unchanged
  async generateSync(...): Promise<T>
  async promoteSync(...): Promise<T>
  async deriveSync(...): Promise<T>
  
  // New async batch operations
  async generateAllAsync(options: GenerateAllOptions): Promise<string> {
    const operations = await this.buildGenerateOperations(options);
    return this.batchJobManager.enqueueBatch(operations, options.userId);
  }
  
  async promoteAsync(ids: string[], userId?: string): Promise<string> {
    const operations = ids.map(id => ({
      type: 'promote' as const,
      entityId: id
    }));
    return this.batchJobManager.enqueueBatch(operations, userId);
  }
  
  async rollbackAsync(ids: string[], userId?: string): Promise<string> {
    const operations = ids.map(id => ({
      type: 'rollback' as const,
      entityId: id
    }));
    return this.batchJobManager.enqueueBatch(operations, userId);
  }
}
```

### 2.3 Job Handlers

Create new job handlers in content-management:

```typescript
// shared/content-management/src/job-handlers/batch-operation-handler.ts
export class BatchOperationHandler implements JobHandler<'batch-operation'> {
  async process(data: BatchOperationData): Promise<BatchOperationResult> {
    const results = [];
    
    for (const [index, operation] of data.operations.entries()) {
      try {
        // Emit progress
        await this.messageBus.publish('batch-progress', {
          batchId: data.batchId,
          currentOperation: `${operation.type} ${operation.entityId}`,
          completedOperations: index,
          totalOperations: data.operations.length
        });
        
        // Process operation
        const result = await this.processOperation(operation);
        results.push({ success: true, result });
        
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    
    return { results };
  }
}
```

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

## Benefits

1. **Clean Architecture**: Job queue as a reusable package
2. **Non-blocking Operations**: No more frozen interfaces
3. **Progress Visibility**: Real-time updates for long operations
4. **Scalability**: Easy to add new job types
5. **Testability**: Isolated components with clear responsibilities

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