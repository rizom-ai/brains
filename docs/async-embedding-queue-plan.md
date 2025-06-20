# Async Embedding Generation with Box Pattern Queue - Final Plan

## Overview

Implement a persisted queue using a "box pattern" where queue items contain the complete entity data as a field, along with queue metadata. This provides maximum flexibility and clean separation of concerns.

## Core Concept

The queue table is a generic job queue that "boxes" entities until their embeddings are generated.

## Proposed Solution

### Database Schema

#### Generic Embedding Queue Table

```sql
CREATE TABLE embedding_queue (
  -- Queue item ID (not entity ID)
  id TEXT PRIMARY KEY,

  -- Boxed entity data (complete entity without embedding)
  entityData TEXT NOT NULL, -- JSON containing the entity

  -- Queue metadata
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'processing' | 'completed' | 'failed'
  priority INTEGER NOT NULL DEFAULT 0, -- Higher = more important
  retryCount INTEGER NOT NULL DEFAULT 0,
  maxRetries INTEGER NOT NULL DEFAULT 3,
  lastError TEXT,

  -- Timestamps
  createdAt INTEGER NOT NULL,
  scheduledFor INTEGER NOT NULL, -- When to process (for delays/backoff)
  startedAt INTEGER,
  completedAt INTEGER
);

CREATE INDEX idx_queue_ready ON embedding_queue(status, priority DESC, scheduledFor);
CREATE INDEX idx_queue_entity ON embedding_queue(json_extract(entityData, '$.id'));
```

### Implementation

#### Step 1: Queue Types

```typescript
// packages/shell/src/embedding/embeddingQueue.types.ts

interface EntityWithoutEmbedding extends Omit<Entity, "embedding"> {
  // All entity fields except embedding
}

interface QueueItem {
  id: string; // Queue job ID
  entityData: EntityWithoutEmbedding; // Boxed entity
  status: "pending" | "processing" | "completed" | "failed";
  priority: number;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  createdAt: Date;
  scheduledFor: Date; // For retry delays
  startedAt: Date | null;
  completedAt: Date | null;
}

interface QueueOptions {
  priority?: number; // Job priority
  maxRetries?: number; // Override default
  delayMs?: number; // Initial delay
}
```

#### Step 2: Database Schema

```typescript
// packages/db/src/schema.ts
export const embeddingQueue = sqliteTable("embedding_queue", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),

  // Boxed entity (JSON)
  entityData: text("entityData", { mode: "json" })
    .$type<EntityWithoutEmbedding>()
    .notNull(),

  // Queue fields
  status: text("status").notNull().default("pending"),
  priority: integer("priority").notNull().default(0),
  retryCount: integer("retryCount").notNull().default(0),
  maxRetries: integer("maxRetries").notNull().default(3),
  lastError: text("lastError"),

  // Timestamps
  createdAt: integer("createdAt")
    .notNull()
    .$defaultFn(() => Date.now()),
  scheduledFor: integer("scheduledFor")
    .notNull()
    .$defaultFn(() => Date.now()),
  startedAt: integer("startedAt"),
  completedAt: integer("completedAt"),
});
```

#### Step 3: Queue Service

```typescript
// packages/shell/src/embedding/embeddingQueueService.ts
export class EmbeddingQueueService {
  /**
   * Enqueue an entity for embedding generation
   */
  async enqueue(
    entity: EntityWithoutEmbedding,
    options: QueueOptions = {},
  ): Promise<string> {
    const jobId = createId();

    await this.db.insert(embeddingQueue).values({
      id: jobId,
      entityData: entity,
      priority: options.priority ?? 0,
      maxRetries: options.maxRetries ?? 3,
      scheduledFor: Date.now() + (options.delayMs ?? 0),
    });

    return jobId;
  }

  /**
   * Get next job to process (highest priority, ready to run)
   */
  async dequeue(): Promise<QueueItem | null> {
    const now = Date.now();

    // Atomic update and select
    const result = await this.db
      .update(embeddingQueue)
      .set({
        status: "processing",
        startedAt: now,
      })
      .where(
        and(
          eq(embeddingQueue.status, "pending"),
          lte(embeddingQueue.scheduledFor, now),
        ),
      )
      .orderBy(desc(embeddingQueue.priority), asc(embeddingQueue.scheduledFor))
      .limit(1)
      .returning();

    return result[0] ?? null;
  }

  /**
   * Check job status by entity ID
   */
  async getStatusByEntityId(entityId: string): Promise<QueueItem | null> {
    const result = await this.db
      .select()
      .from(embeddingQueue)
      .where(sql`json_extract(entityData, '$.id') = ${entityId}`)
      .limit(1);

    return result[0] ?? null;
  }
}
```

#### Step 4: Modified EntityService

```typescript
export class EntityService {
  private queueService: EmbeddingQueueService;

  /**
   * Create entity (sync - waits for embedding)
   */
  async createEntity<T extends BaseEntity>(
    entity: Omit<T, "id" | "created" | "updated">,
  ): Promise<T> {
    const prepared = this.prepareEntityData(entity);
    const jobId = await this.queueService.enqueue(prepared);

    // Wait for completion with timeout
    const completed = await this.waitForJob(jobId, 30000); // 30s timeout
    if (!completed) {
      throw new Error("Embedding generation timed out");
    }

    return this.getEntity(prepared.entityType, prepared.id);
  }

  /**
   * Create entity (async - returns immediately)
   */
  async createEntityAsync<T extends BaseEntity>(
    entity: Omit<T, "id" | "created" | "updated">,
  ): Promise<{ entityId: string; jobId: string }> {
    const prepared = this.prepareEntityData(entity);
    const jobId = await this.queueService.enqueue(prepared, {
      priority: entity.priority ?? 0,
    });

    return { entityId: prepared.id, jobId };
  }

  /**
   * Prepare entity data (without embedding)
   */
  private prepareEntityData<T extends BaseEntity>(
    entity: Omit<T, "id" | "created" | "updated">,
  ): EntityWithoutEmbedding {
    const now = new Date().toISOString();
    const withDefaults = {
      ...entity,
      id: createId(),
      created: now,
      updated: now,
    } as T;

    // Validate
    const validated = this.entityRegistry.validateEntity(
      entity.entityType,
      withDefaults,
    );

    // Convert to storage format
    const adapter = this.entityRegistry.getAdapter(validated.entityType);
    const markdown = adapter.toMarkdown(validated);
    const metadata = adapter.extractMetadata(validated);
    const { contentWeight } = extractIndexedFields(markdown, validated.id);

    return {
      id: validated.id,
      entityType: validated.entityType,
      content: markdown,
      metadata,
      contentWeight,
      created: new Date(validated.created).getTime(),
      updated: new Date(validated.updated).getTime(),
    };
  }
}
```

#### Step 5: Queue Worker

```typescript
export class EmbeddingQueueWorker {
  private running = false;

  async start(): Promise<void> {
    this.running = true;
    while (this.running) {
      await this.processNext();
      await this.sleep(100); // Small delay between jobs
    }
  }

  private async processNext(): Promise<void> {
    const job = await this.queueService.dequeue();
    if (!job) return;

    try {
      // Generate embedding
      const embedding = await this.embeddingService.generateEmbedding(
        job.entityData.content,
      );

      // Save entity with embedding
      await this.db.transaction(async (tx) => {
        // Insert complete entity
        await tx.insert(entities).values({
          ...job.entityData,
          embedding,
        });

        // Mark job complete
        await tx
          .update(embeddingQueue)
          .set({
            status: "completed",
            completedAt: Date.now(),
          })
          .where(eq(embeddingQueue.id, job.id));
      });

      // Clean up completed job after delay
      setTimeout(() => this.cleanupJob(job.id), 60000); // 1 minute
    } catch (error) {
      await this.handleJobFailure(job, error);
    }
  }

  private async handleJobFailure(job: QueueItem, error: Error): Promise<void> {
    const shouldRetry = job.retryCount < job.maxRetries;

    if (shouldRetry) {
      // Exponential backoff: 1s, 2s, 4s, 8s...
      const delayMs = Math.pow(2, job.retryCount) * 1000;

      await this.db
        .update(embeddingQueue)
        .set({
          status: "pending",
          retryCount: job.retryCount + 1,
          lastError: error.message,
          scheduledFor: Date.now() + delayMs,
        })
        .where(eq(embeddingQueue.id, job.id));
    } else {
      // Mark as permanently failed
      await this.db
        .update(embeddingQueue)
        .set({
          status: "failed",
          lastError: error.message,
          completedAt: Date.now(),
        })
        .where(eq(embeddingQueue.id, job.id));
    }
  }
}
```

## Benefits of Box Pattern

1. **Clean Separation**: Queue logic completely separate from entity structure
2. **Flexibility**: Can queue any entity type without schema changes
3. **Extensibility**: Easy to add queue features (priority, delays, etc.)
4. **Generic**: Could be reused for other async processing needs
5. **Debugging**: Can inspect queued entities as JSON
6. **Atomic Operations**: Entity only exists in one place at a time

## Queue Management Features

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
  retryFailed(): Promise<number>;
  reprocessStuck(): Promise<number>; // Reset "processing" that are stuck
  purgeCompleted(olderThan: Date): Promise<number>;

  // Monitoring
  getFailedJobs(limit?: number): Promise<QueueItem[]>;
  getJobHistory(entityId: string): Promise<QueueItem[]>;
}
```

## Configuration

```typescript
interface QueueConfig {
  workerCount: number; // Concurrent workers
  pollInterval: number; // Ms between polls
  completedRetention: number; // Hours to keep completed jobs
  maxProcessingTime: number; // Ms before job considered stuck
}
```

## Testing Strategy

1. **Unit Tests**: Queue operations (enqueue, dequeue, retry)
2. **Integration Tests**: Full entity creation flow
3. **Failure Tests**: Embedding failures, retries, timeouts
4. **Concurrency Tests**: Multiple workers, race conditions
5. **Performance Tests**: Queue throughput under load

This box pattern design provides maximum flexibility while maintaining clean separation between queuing and entity concerns!
