import type { DrizzleDB } from "@brains/db";
import {
  embeddingQueue,
  eq,
  and,
  sql,
  desc,
  asc,
  lte,
  createId,
  type QueueOptions,
  type EmbeddingQueue,
} from "@brains/db";
import { Logger } from "@brains/utils";
import type { IEmbeddingQueueService, EntityWithoutEmbedding } from "./types";

/**
 * Service for managing the embedding generation queue
 * Implements Component Interface Standardization pattern
 */
export class EmbeddingQueueService implements IEmbeddingQueueService {
  private static instance: EmbeddingQueueService | null = null;
  private db: DrizzleDB;
  private logger: Logger;

  /**
   * Get the singleton instance
   */
  public static getInstance(
    db: DrizzleDB,
    logger?: Logger,
  ): EmbeddingQueueService {
    EmbeddingQueueService.instance ??= new EmbeddingQueueService(
      db,
      logger ?? Logger.getInstance(),
    );
    return EmbeddingQueueService.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    EmbeddingQueueService.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    db: DrizzleDB,
    logger?: Logger,
  ): EmbeddingQueueService {
    return new EmbeddingQueueService(db, logger ?? Logger.getInstance());
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(db: DrizzleDB, logger: Logger) {
    this.db = db;
    this.logger = logger.child("EmbeddingQueueService");
  }

  /**
   * Enqueue an entity for embedding generation
   */
  public async enqueue(
    entity: EntityWithoutEmbedding,
    options: QueueOptions = {},
  ): Promise<string> {
    const jobId = createId();

    try {
      await this.db.insert(embeddingQueue).values({
        id: jobId,
        entityData: entity,
        priority: options.priority ?? 0,
        maxRetries: options.maxRetries ?? 3,
        scheduledFor: Date.now() + (options.delayMs ?? 0),
      });

      this.logger.debug("Enqueued entity for embedding generation", {
        jobId,
        entityId: entity.id,
        entityType: entity.entityType,
        priority: options.priority,
      });

      return jobId;
    } catch (error) {
      this.logger.error("Failed to enqueue entity", {
        entityId: entity.id,
        error,
      });
      throw error;
    }
  }

  /**
   * Get next job to process (atomically marks as processing)
   */
  public async dequeue(): Promise<EmbeddingQueue | null> {
    const now = Date.now();
    const maxRetries = 3;
    let lastError: Error | null = null;

    // Retry logic for handling SQLite busy errors
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Use a transaction to atomically update and select
        const result = await this.db.transaction(async (tx) => {
          // Find the next pending job
          const [job] = await tx
            .select()
            .from(embeddingQueue)
            .where(
              and(
                eq(embeddingQueue.status, "pending"),
                lte(embeddingQueue.scheduledFor, now),
              ),
            )
            .orderBy(
              desc(embeddingQueue.priority),
              asc(embeddingQueue.scheduledFor),
            )
            .limit(1);

          if (!job) {
            return null;
          }

          // Mark it as processing
          await tx
            .update(embeddingQueue)
            .set({
              status: "processing",
              startedAt: now,
            })
            .where(eq(embeddingQueue.id, job.id));

          // Return the updated job
          return {
            ...job,
            status: "processing" as const,
            startedAt: now,
          };
        });

        if (result) {
          this.logger.debug("Dequeued job for processing", {
            jobId: result.id,
            entityId: result.entityData.id,
          });
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        // If it's a SQLite busy error and we have retries left, wait and retry
        if (error instanceof Error && 'code' in error && error.code === "SQLITE_BUSY" && attempt < maxRetries - 1) {
          this.logger.debug("Database busy, retrying dequeue", {
            attempt: attempt + 1,
            maxRetries,
          });
          // Wait with exponential backoff
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 10),
          );
          continue;
        }

        // For other errors or final attempt, throw
        throw error;
      }
    }

    // Should never reach here, but for TypeScript
    throw lastError ?? new Error("Failed to dequeue after retries");
  }

  /**
   * Mark job as completed
   */
  public async complete(jobId: string): Promise<void> {
    try {
      await this.db
        .update(embeddingQueue)
        .set({
          status: "completed",
          completedAt: Date.now(),
        })
        .where(eq(embeddingQueue.id, jobId));

      this.logger.debug("Marked job as completed", { jobId });
    } catch (error) {
      this.logger.error("Failed to mark job as completed", { jobId, error });
      throw error;
    }
  }

  /**
   * Mark job as failed and handle retry
   */
  public async fail(jobId: string, error: Error): Promise<void> {
    try {
      const [job] = await this.db
        .select()
        .from(embeddingQueue)
        .where(eq(embeddingQueue.id, jobId))
        .limit(1);

      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

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
            startedAt: null,
          })
          .where(eq(embeddingQueue.id, jobId));

        this.logger.warn("Job failed, scheduling retry", {
          jobId,
          retryCount: job.retryCount + 1,
          delayMs,
          error: error.message,
        });
      } else {
        // Mark as permanently failed
        await this.db
          .update(embeddingQueue)
          .set({
            status: "failed",
            lastError: error.message,
            completedAt: Date.now(),
          })
          .where(eq(embeddingQueue.id, jobId));

        this.logger.error("Job permanently failed after max retries", {
          jobId,
          entityId: job.entityData.id,
          retries: job.retryCount,
          error: error.message,
        });
      }
    } catch (updateError) {
      this.logger.error("Failed to update failed job", {
        jobId,
        error: updateError,
      });
      throw updateError;
    }
  }

  /**
   * Check job status by entity ID
   */
  public async getStatusByEntityId(
    entityId: string,
  ): Promise<EmbeddingQueue | null> {
    try {
      const [result] = await this.db
        .select()
        .from(embeddingQueue)
        .where(sql`json_extract(entityData, '$.id') = ${entityId}`)
        .orderBy(desc(embeddingQueue.createdAt))
        .limit(1);

      return result ?? null;
    } catch (error) {
      this.logger.error("Failed to get job status by entity ID", {
        entityId,
        error,
      });
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  public async getStats(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    completed: number;
    total: number;
  }> {
    try {
      const stats = await this.db
        .select({
          status: embeddingQueue.status,
          count: sql<number>`count(*)`,
        })
        .from(embeddingQueue)
        .groupBy(embeddingQueue.status);

      const result = {
        pending: 0,
        processing: 0,
        failed: 0,
        completed: 0,
        total: 0,
      };

      for (const row of stats) {
        const count = Number(row.count);
        result[row.status] = count;
        result.total += count;
      }

      return result;
    } catch (error) {
      this.logger.error("Failed to get queue stats", error);
      throw error;
    }
  }

  /**
   * Clean up old completed jobs
   */
  public async cleanup(olderThanMs: number): Promise<number> {
    const cutoffTime = Date.now() - olderThanMs;

    try {
      const result = await this.db
        .delete(embeddingQueue)
        .where(
          and(
            eq(embeddingQueue.status, "completed"),
            lte(embeddingQueue.completedAt, cutoffTime),
          ),
        )
        .returning({ id: embeddingQueue.id });

      const deletedCount = result.length;

      if (deletedCount > 0) {
        this.logger.info("Cleaned up old completed jobs", {
          count: deletedCount,
          olderThanHours: olderThanMs / (1000 * 60 * 60),
        });
      }

      return deletedCount;
    } catch (error) {
      this.logger.error("Failed to cleanup old jobs", error);
      throw error;
    }
  }

  /**
   * Reset stuck processing jobs (for recovery)
   */
  public async resetStuckJobs(stuckAfterMs: number = 300000): Promise<number> {
    const cutoffTime = Date.now() - stuckAfterMs;

    try {
      const result = await this.db
        .update(embeddingQueue)
        .set({
          status: "pending",
          startedAt: null,
        })
        .where(
          and(
            eq(embeddingQueue.status, "processing"),
            lte(embeddingQueue.startedAt, cutoffTime),
          ),
        )
        .returning({ id: embeddingQueue.id });

      const resetCount = result.length;

      if (resetCount > 0) {
        this.logger.warn("Reset stuck processing jobs", {
          count: resetCount,
          stuckAfterMinutes: stuckAfterMs / (1000 * 60),
        });
      }

      return resetCount;
    } catch (error) {
      this.logger.error("Failed to reset stuck jobs", error);
      throw error;
    }
  }
}
