import type { IJobQueueService } from "./types";
import type { BatchOperation, BatchJobStatus, Batch } from "./schemas";
import { JOB_STATUS } from "./schemas";
import type { JobContext, JobOptions } from "./schema/job-queue";
import type { Logger } from "@brains/utils";
import { createBatchId } from "@brains/utils";

/**
 * Batch job manager for tracking groups of related jobs
 *
 * This manager tracks multiple related jobs as a logical batch without
 * creating a special "batch-operation" job type. Instead, it monitors
 * the individual jobs and provides aggregated status.
 */
export class BatchJobManager {
  private static instance: BatchJobManager | null = null;

  // In-memory tracking of batch metadata
  // In production, this could be stored in a database table
  private batches = new Map<
    string,
    {
      jobIds: string[];
      operations: BatchOperation[];
      source: string;
      startedAt: string;
      metadata: JobContext;
    }
  >();

  public static getInstance(
    jobQueue: IJobQueueService,
    logger: Logger,
  ): BatchJobManager {
    BatchJobManager.instance ??= new BatchJobManager(jobQueue, logger);
    return BatchJobManager.instance;
  }

  public static resetInstance(): void {
    BatchJobManager.instance = null;
  }

  public static createFresh(
    jobQueue: IJobQueueService,
    logger: Logger,
  ): BatchJobManager {
    return new BatchJobManager(jobQueue, logger);
  }

  private constructor(
    private jobQueue: IJobQueueService,
    private logger: Logger,
  ) {}

  /**
   * Enqueue a batch of operations as individual jobs
   */
  async enqueueBatch(
    operations: BatchOperation[],
    options: JobOptions,
    pluginId?: string,
  ): Promise<string> {
    if (operations.length === 0) {
      throw new Error("Cannot enqueue empty batch");
    }

    const batchId = createBatchId();
    const jobIds: string[] = [];

    try {
      // Enqueue each operation as an individual job
      for (const operation of operations) {
        // Build job options for each individual job
        // Set rootJobId to batchId so CLI progress tracking works through inheritance
        const jobOptions: Parameters<IJobQueueService["enqueue"]>[2] = {
          ...options,
          metadata: {
            ...options.metadata,
            rootJobId: batchId, // Individual jobs inherit from batch
            operationTarget: operation.type,
          },
        };

        const jobId = await this.jobQueue.enqueue(
          operation.type,
          operation.data,
          jobOptions,
          pluginId,
        );
        jobIds.push(jobId);
      }

      // Store batch metadata
      // Store the full BatchOperation type
      const batchMetadata: {
        jobIds: string[];
        operations: BatchOperation[];
        source: string;
        startedAt: string;
        metadata: JobContext;
      } = {
        jobIds,
        operations: operations,
        source: options.source,
        startedAt: new Date().toISOString(),
        metadata: options.metadata,
      };

      this.batches.set(batchId, batchMetadata);

      this.logger.debug("Enqueued batch operations", {
        batchId,
        operationCount: operations.length,
        jobIds,
        rootJobId: options.metadata.rootJobId,
      });

      return batchId;
    } catch (error) {
      this.logger.error("Failed to enqueue batch operations", {
        error,
        operationCount: operations.length,
        enqueuedJobs: jobIds.length,
      });
      throw error;
    }
  }

  /**
   * Get batch status by aggregating individual job statuses
   */
  async getBatchStatus(batchId: string): Promise<BatchJobStatus | null> {
    const batch = this.batches.get(batchId);
    if (!batch) {
      return null;
    }

    try {
      // Get status of all jobs in the batch
      const jobStatuses = await Promise.all(
        batch.jobIds.map((jobId) => this.jobQueue.getStatus(jobId)),
      );

      // Count statuses
      let completedOperations = 0;
      let failedOperations = 0;
      let pendingOperations = 0;
      let processingOperations = 0;
      const errors: string[] = [];

      for (const job of jobStatuses) {
        if (!job) continue;

        switch (job.status) {
          case "completed":
            completedOperations++;
            break;
          case "failed":
            failedOperations++;
            if (job.lastError) {
              errors.push(job.lastError);
            }
            break;
          case "processing":
            processingOperations++;
            break;
          case "pending":
            pendingOperations++;
            break;
        }
      }

      // Determine overall batch status
      let status: (typeof JOB_STATUS)[keyof typeof JOB_STATUS];
      if (processingOperations > 0 || pendingOperations > 0) {
        status = JOB_STATUS.PROCESSING;
      } else if (failedOperations > 0) {
        status = JOB_STATUS.FAILED;
      } else {
        status = JOB_STATUS.COMPLETED;
      }

      // Find current operation (first non-completed job)
      let currentOperation: string | undefined;
      for (let i = 0; i < batch.jobIds.length; i++) {
        const job = jobStatuses[i];
        if (job && job.status !== "completed" && job.status !== "failed") {
          const operation = batch.operations[i];
          if (operation) {
            currentOperation = `Processing ${operation.type}`;
          }
          break;
        }
      }

      return {
        batchId,
        totalOperations: batch.operations.length,
        completedOperations,
        failedOperations,
        errors,
        status,
        currentOperation,
      };
    } catch (error) {
      this.logger.error("Failed to get batch status", { batchId, error });
      throw error;
    }
  }

  /**
   * Clean up old batch metadata
   */
  async cleanup(olderThanMs: number): Promise<number> {
    const cutoffTime = Date.now() - olderThanMs;
    let cleaned = 0;

    for (const [batchId, batch] of this.batches.entries()) {
      const batchTime = new Date(batch.startedAt).getTime();
      if (batchTime < cutoffTime) {
        // Check if all jobs are completed
        const status = await this.getBatchStatus(batchId);
        if (
          status &&
          (status.status === JOB_STATUS.COMPLETED ||
            status.status === JOB_STATUS.FAILED)
        ) {
          this.batches.delete(batchId);
          cleaned++;
        }
      }
    }

    this.logger.debug("Cleaned up batch metadata", { cleaned });
    return cleaned;
  }

  /**
   * Register batch metadata for tracking (used when jobs are enqueued separately)
   */
  public registerBatch(
    batchId: string,
    jobIds: string[],
    operations: BatchOperation[],
    source: string,
    metadata: JobContext,
  ): void {
    const batchMetadata: {
      jobIds: string[];
      operations: BatchOperation[];
      source: string;
      startedAt: string;
      metadata: JobContext;
    } = {
      jobIds,
      operations,
      source,
      startedAt: new Date().toISOString(),
      metadata,
    };

    this.batches.set(batchId, batchMetadata);

    this.logger.debug("Registered batch metadata", {
      batchId,
      operationCount: operations.length,
      jobIds,
    });
  }

  /**
   * Get all active batches (pending or processing)
   */
  async getActiveBatches(): Promise<Batch[]> {
    const activeBatches: Batch[] = [];

    try {
      // Check each batch's status
      for (const [batchId, metadata] of this.batches) {
        const status = await this.getBatchStatus(batchId);

        if (
          status &&
          (status.status === "pending" || status.status === "processing")
        ) {
          activeBatches.push({
            batchId,
            status,
            metadata: {
              operations: metadata.operations,
              source: metadata.source,
              startedAt: metadata.startedAt,
              metadata: metadata.metadata,
            },
          });
        }
      }

      this.logger.debug("Retrieved active batches", {
        count: activeBatches.length,
      });

      return activeBatches;
    } catch (error) {
      this.logger.error("Failed to get active batches", { error });
      throw error;
    }
  }
}
