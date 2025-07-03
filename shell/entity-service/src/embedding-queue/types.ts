import type { Entity, EmbeddingQueue, QueueOptions } from "@brains/db";

/**
 * Entity data without embedding - used for queue operations
 */
export type EntityWithoutEmbedding = Omit<Entity, "embedding">;

/**
 * Queue job result
 */
export interface QueueJobResult {
  jobId: string;
  entityId: string;
  status: "completed" | "failed";
  error?: string;
}

/**
 * Queue service interface
 */
export interface IEmbeddingQueueService {
  /**
   * Enqueue an entity for embedding generation
   */
  enqueue(
    entity: EntityWithoutEmbedding,
    options?: QueueOptions,
  ): Promise<string>;

  /**
   * Get next job to process (marks as processing)
   */
  dequeue(): Promise<EmbeddingQueue | null>;

  /**
   * Mark job as completed
   */
  complete(jobId: string): Promise<void>;

  /**
   * Mark job as failed and handle retry
   */
  fail(jobId: string, error: Error): Promise<void>;

  /**
   * Check job status by entity ID
   */
  getStatusByEntityId(entityId: string): Promise<EmbeddingQueue | null>;

  /**
   * Get queue statistics
   */
  getStats(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    completed: number;
    total: number;
  }>;

  /**
   * Clean up old completed jobs
   */
  cleanup(olderThanMs: number): Promise<number>;
}
