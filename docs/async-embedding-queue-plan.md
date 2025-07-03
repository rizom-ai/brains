# Async Embedding Generation with Box Pattern Queue - Implementation Status

## Overview

Implement a persisted queue using a "box pattern" where queue items contain the complete entity data as a field, along with queue metadata. This provides maximum flexibility and clean separation of concerns.

## Core Concept

The queue table is a generic job queue that "boxes" entities until their embeddings are generated.

## Critical Insight: Thread Blocking Issue

**Problem**: The current synchronous `createEntity()` method blocks the thread during embedding generation (~100-500ms). This makes interfaces (Matrix, CLI) unresponsive during entity creation.

**Solution**: Make async entity creation the default behavior, with an explicit `createEntitySync()` for cases that need immediate availability.

## Implementation Status

### ✅ Completed Components

#### 1. Database Schema (DONE)
- Created `embedding_queue` table in `shell/db/src/schema/embedding-queue.ts`
- Implemented box pattern with complete entity storage
- Added appropriate indexes for queue operations
- Refactored database schema into modular directory structure

#### 2. Queue Service (DONE)
- Implemented `EmbeddingQueueService` in `shell/entity-service/src/embedding-queue/`
- Features implemented:
  - `enqueue()` - Add entities to queue
  - `dequeue()` - Atomic job retrieval with retry logic for SQLite busy errors
  - `complete()` - Mark jobs as completed
  - `fail()` - Handle failures with exponential backoff
  - `getStatusByEntityId()` - Check job status
  - `getStats()` - Queue statistics
  - `cleanup()` - Remove old completed jobs
  - `resetStuckJobs()` - Recover stuck processing jobs

#### 3. Queue Worker (DONE)
- Implemented `EmbeddingQueueWorker` for background processing
- Features:
  - Continuous polling with configurable interval
  - Embedding generation and entity storage in transaction
  - Retry logic with exponential backoff
  - Periodic cleanup and stuck job recovery
  - Graceful shutdown support

#### 4. Tests (DONE)
- Comprehensive test suite for queue operations
- Concurrent operation tests
- Failure and retry scenarios
- WAL mode enabled for better concurrency

### 🚧 Remaining Implementation

#### 1. EntityService Methods
```typescript
// Rename existing method to make sync behavior explicit
createEntitySync() // Current createEntity() renamed

// New async method (will become the default createEntity)
createEntityAsync<T extends BaseEntity>(
  entity: Omit<T, "id" | "created" | "updated">,
  options?: { priority?: number; maxRetries?: number }
): Promise<{ entityId: string; jobId: string }>

// Check job status
getAsyncJobStatus(jobId: string): Promise<{
  status: "pending" | "processing" | "completed" | "failed";
  entityId?: string;
  error?: string;
} | null>
```

#### 2. Shell Integration
- Start EmbeddingQueueWorker during shell initialization
- Configure worker options (poll interval, batch size, etc.)
- Ensure graceful shutdown

#### 3. Interface Updates
- Update Matrix interface to use async creation
- Update CLI interface to use async creation
- Update directory-sync plugin for bulk imports

## Benefits of Box Pattern

1. **Clean Separation**: Queue logic completely separate from entity structure
2. **Flexibility**: Can queue any entity type without schema changes
3. **Extensibility**: Easy to add queue features (priority, delays, etc.)
4. **Generic**: Could be reused for other async processing needs
5. **Debugging**: Can inspect queued entities as JSON
6. **Atomic Operations**: Entity only exists in one place at a time

## Queue Management Features (Implemented)

```typescript
interface QueueManagement {
  // Stats
  getStats(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    completed: number;
  }>;

  // Operations
  resetStuckJobs(stuckAfterMs?: number): Promise<number>;
  cleanup(olderThanMs: number): Promise<number>;

  // Monitoring
  getStatusByEntityId(entityId: string): Promise<QueueItem | null>;
}
```

## Configuration

```typescript
interface QueueConfig {
  pollInterval: number; // Ms between polls (default: 100)
  batchSize: number; // Jobs per batch (default: 1)
  maxProcessingTime: number; // Ms before job considered stuck (default: 5 min)
  cleanupInterval: number; // Cleanup frequency (default: 1 hour)
  cleanupAge: number; // Age of completed jobs to clean (default: 24 hours)
}
```

## Testing Strategy (Completed)

1. **Unit Tests**: Queue operations (enqueue, dequeue, retry) ✅
2. **Integration Tests**: Full entity creation flow ✅
3. **Failure Tests**: Embedding failures, retries, timeouts ✅
4. **Concurrency Tests**: Multiple workers, race conditions ✅
5. **Performance Tests**: SQLite busy handling with WAL mode ✅

## Migration Strategy

1. **Phase 1**: Rename `createEntity` to `createEntitySync`
2. **Phase 2**: Implement `createEntityAsync` 
3. **Phase 3**: Create new `createEntity` that uses async by default
4. **Phase 4**: Update all interfaces to use async creation
5. **Phase 5**: Deprecate `createEntitySync` for most use cases

This approach ensures responsive interfaces while maintaining backward compatibility!