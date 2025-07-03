import type { DrizzleDB } from "@brains/db";
import { entities, eq, embeddingQueue } from "@brains/db";
import type { IEmbeddingService } from "@brains/embedding-service";
import { Logger } from "@brains/utils";
import type { EmbeddingQueueService } from "./embeddingQueueService";

/**
 * Options for the embedding queue worker
 */
export interface EmbeddingQueueWorkerOptions {
  /**
   * Poll interval in milliseconds (default: 100ms)
   */
  pollInterval?: number;

  /**
   * Batch size for processing (default: 1)
   */
  batchSize?: number;

  /**
   * Max processing time before considering job stuck (default: 5 minutes)
   */
  maxProcessingTime?: number;

  /**
   * Cleanup interval for old completed jobs (default: 1 hour)
   */
  cleanupInterval?: number;

  /**
   * How old completed jobs should be before cleanup (default: 24 hours)
   */
  cleanupAge?: number;
}

/**
 * Worker that processes the embedding queue in the background
 * Implements Component Interface Standardization pattern
 */
export class EmbeddingQueueWorker {
  private static instance: EmbeddingQueueWorker | null = null;

  private db: DrizzleDB;
  private queueService: EmbeddingQueueService;
  private embeddingService: IEmbeddingService;
  private logger: Logger;
  private options: Required<EmbeddingQueueWorkerOptions>;

  private running = false;
  private processingLoop: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private stuckJobInterval: NodeJS.Timeout | null = null;

  /**
   * Get the singleton instance
   */
  public static getInstance(
    db: DrizzleDB,
    queueService: EmbeddingQueueService,
    embeddingService: IEmbeddingService,
    options?: EmbeddingQueueWorkerOptions,
    logger?: Logger,
  ): EmbeddingQueueWorker {
    EmbeddingQueueWorker.instance ??= new EmbeddingQueueWorker(
      db,
      queueService,
      embeddingService,
      options,
      logger ?? Logger.getInstance(),
    );
    return EmbeddingQueueWorker.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    if (EmbeddingQueueWorker.instance) {
      EmbeddingQueueWorker.instance.stop();
    }
    EmbeddingQueueWorker.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    db: DrizzleDB,
    queueService: EmbeddingQueueService,
    embeddingService: IEmbeddingService,
    options?: EmbeddingQueueWorkerOptions,
    logger?: Logger,
  ): EmbeddingQueueWorker {
    return new EmbeddingQueueWorker(
      db,
      queueService,
      embeddingService,
      options,
      logger ?? Logger.getInstance(),
    );
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    db: DrizzleDB,
    queueService: EmbeddingQueueService,
    embeddingService: IEmbeddingService,
    options?: EmbeddingQueueWorkerOptions,
    logger?: Logger,
  ) {
    this.db = db;
    this.queueService = queueService;
    this.embeddingService = embeddingService;
    this.logger = (logger ?? Logger.getInstance()).child(
      "EmbeddingQueueWorker",
    );

    this.options = {
      pollInterval: options?.pollInterval ?? 100,
      batchSize: options?.batchSize ?? 1,
      maxProcessingTime: options?.maxProcessingTime ?? 5 * 60 * 1000, // 5 minutes
      cleanupInterval: options?.cleanupInterval ?? 60 * 60 * 1000, // 1 hour
      cleanupAge: options?.cleanupAge ?? 24 * 60 * 60 * 1000, // 24 hours
    };
  }

  /**
   * Start the worker
   */
  public async start(): Promise<void> {
    if (this.running) {
      this.logger.warn("Worker already running");
      return;
    }

    this.running = true;
    this.logger.info("Starting embedding queue worker", {
      pollInterval: this.options.pollInterval,
      batchSize: this.options.batchSize,
    });

    // Start processing loop
    this.startProcessingLoop();

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      void this.performCleanup();
    }, this.options.cleanupInterval);

    // Start stuck job recovery interval
    this.stuckJobInterval = setInterval(() => {
      void this.recoverStuckJobs();
    }, 60000); // Check every minute

    // Perform initial cleanup and recovery
    await Promise.all([this.performCleanup(), this.recoverStuckJobs()]);
  }

  /**
   * Stop the worker
   */
  public stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    this.logger.info("Stopping embedding queue worker");

    // Clear all intervals
    if (this.processingLoop) {
      clearInterval(this.processingLoop);
      this.processingLoop = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.stuckJobInterval) {
      clearInterval(this.stuckJobInterval);
      this.stuckJobInterval = null;
    }
  }

  /**
   * Check if worker is running
   */
  public isRunning(): boolean {
    return this.running;
  }

  /**
   * Start the processing loop
   */
  private startProcessingLoop(): void {
    this.processingLoop = setInterval(() => {
      if (this.running) {
        void this.processNext();
      }
    }, this.options.pollInterval);
  }

  /**
   * Process the next job in the queue
   */
  private async processNext(): Promise<void> {
    try {
      const job = await this.queueService.dequeue();
      if (!job) {
        return; // No jobs to process
      }

      this.logger.debug("Processing job", {
        jobId: job.id,
        entityId: job.entityData.id,
        entityType: job.entityData.entityType,
      });

      try {
        // Generate embedding
        const startTime = Date.now();
        const embedding = await this.embeddingService.generateEmbedding(
          job.entityData.content,
        );
        const generationTime = Date.now() - startTime;

        // Save entity with embedding in a transaction
        await this.db.transaction(async (tx) => {
          // Insert complete entity with all required fields
          await tx.insert(entities).values({
            id: job.entityData.id,
            entityType: job.entityData.entityType,
            content: job.entityData.content,
            contentWeight: job.entityData.contentWeight,
            created: job.entityData.created,
            updated: job.entityData.updated,
            metadata: job.entityData.metadata as Record<string, unknown>,
            embedding,
          });

          // Mark job complete (using the queue service)
          // Note: In a real implementation, we'd need to pass tx to the service
          // For now, we'll update directly
          await tx
            .update(embeddingQueue)
            .set({
              status: "completed",
              completedAt: Date.now(),
            })
            .where(eq(embeddingQueue.id, job.id));
        });

        this.logger.info("Successfully processed embedding job", {
          jobId: job.id,
          entityId: job.entityData.id,
          generationTimeMs: generationTime,
        });
      } catch (error) {
        this.logger.error("Failed to process job", {
          jobId: job.id,
          entityId: job.entityData.id,
          error,
        });

        // Mark job as failed
        await this.queueService.fail(job.id, error as Error);
      }
    } catch (error) {
      this.logger.error("Error in processing loop", error);
    }
  }

  /**
   * Perform cleanup of old completed jobs
   */
  private async performCleanup(): Promise<void> {
    try {
      const deletedCount = await this.queueService.cleanup(
        this.options.cleanupAge,
      );
      if (deletedCount > 0) {
        this.logger.debug("Cleaned up completed jobs", { count: deletedCount });
      }
    } catch (error) {
      this.logger.error("Failed to perform cleanup", error);
    }
  }

  /**
   * Recover stuck jobs
   */
  private async recoverStuckJobs(): Promise<void> {
    try {
      const resetCount = await this.queueService.resetStuckJobs(
        this.options.maxProcessingTime,
      );
      if (resetCount > 0) {
        this.logger.warn("Recovered stuck jobs", { count: resetCount });
      }
    } catch (error) {
      this.logger.error("Failed to recover stuck jobs", error);
    }
  }

  /**
   * Get worker statistics
   */
  public async getStats(): Promise<{
    running: boolean;
    queueStats: Awaited<ReturnType<EmbeddingQueueService["getStats"]>>;
  }> {
    const queueStats = await this.queueService.getStats();
    return {
      running: this.running,
      queueStats,
    };
  }
}
