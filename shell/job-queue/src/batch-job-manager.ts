import type { IJobQueueService } from "./types";
import type { BatchOperation, BatchJobStatus, JobStatusType } from "./schemas";
import { BatchJobStatusSchema, JOB_STATUS } from "./schemas";
import type { Logger } from "@brains/utils";
import type { JobOptions } from "@brains/db";

/**
 * Batch job manager for handling batch operations
 * 
 * This manager coordinates multiple related jobs and tracks their collective progress.
 * It's generic infrastructure that can handle any type of batch operation.
 */
export class BatchJobManager {
  private static instance: BatchJobManager | null = null;

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
   * Enqueue a batch of operations
   */
  async enqueueBatch(
    operations: BatchOperation[],
    options?: {
      userId?: string;
      priority?: number;
      maxRetries?: number;
    },
  ): Promise<string> {
    if (operations.length === 0) {
      throw new Error("Cannot enqueue empty batch");
    }

    try {
      // Create the batch job that tracks all operations
      const batchData = {
        operations,
        totalOperations: operations.length,
        completedOperations: 0,
        failedOperations: 0,
        errors: [] as string[],
        status: JOB_STATUS.PENDING,
        userId: options?.userId,
        startedAt: new Date().toISOString(),
      };

      const jobOptions: JobOptions = {};
      if (options?.priority !== undefined) {
        jobOptions.priority = options.priority;
      }
      if (options?.maxRetries !== undefined) {
        jobOptions.maxRetries = options.maxRetries;
      }

      const batchId = await this.jobQueue.enqueue(
        "batch-operation",
        batchData,
        jobOptions,
      );

      this.logger.info("Enqueued batch operation", {
        batchId,
        operationCount: operations.length,
        userId: options?.userId,
      });

      return batchId;
    } catch (error) {
      this.logger.error("Failed to enqueue batch operation", { error, operations });
      throw error;
    }
  }

  /**
   * Get batch status by batch ID
   */
  async getBatchStatus(batchId: string): Promise<BatchJobStatus | null> {
    try {
      const job = await this.jobQueue.getStatus(batchId);
      if (!job) {
        return null;
      }

      // If job has result data, parse it as BatchJobStatus
      if (job.result && typeof job.result === "object") {
        const parseResult = BatchJobStatusSchema.safeParse(job.result);
        if (parseResult.success) {
          return parseResult.data;
        }
      }

      // If job data contains batch info, construct status from it
      if (job.data && typeof job.data === "string") {
        try {
          const batchData = JSON.parse(job.data);
          if (batchData && typeof batchData === "object") {
            return {
              batchId,
              totalOperations: batchData.totalOperations ?? 0,
              completedOperations: batchData.completedOperations ?? 0,
              failedOperations: batchData.failedOperations ?? 0,
              errors: batchData.errors ?? [],
              status: this.mapJobStatusToBatchStatus(job.status),
              currentOperation: batchData.currentOperation,
            };
          }
        } catch {
          // JSON parse failed, fall through to basic status
        }
      }

      // Fallback: basic status based on job status
      return {
        batchId,
        totalOperations: 1,
        completedOperations: job.status === JOB_STATUS.COMPLETED ? 1 : 0,
        failedOperations: job.status === JOB_STATUS.FAILED ? 1 : 0,
        errors: job.lastError ? [job.lastError] : [],
        status: this.mapJobStatusToBatchStatus(job.status),
      };
    } catch (error) {
      this.logger.error("Failed to get batch status", { batchId, error });
      throw error;
    }
  }

  /**
   * Update batch progress (called by batch job handler)
   */
  async updateBatchProgress(
    batchId: string,
    update: {
      completedOperations?: number;
      failedOperations?: number;
      currentOperation?: string;
      errors?: string[];
    },
  ): Promise<void> {
    try {
      const currentStatus = await this.getBatchStatus(batchId);
      if (!currentStatus) {
        throw new Error(`Batch ${batchId} not found`);
      }

      const updatedStatus: BatchJobStatus = {
        ...currentStatus,
        ...update,
        errors: update.errors ? [...currentStatus.errors, ...update.errors] : currentStatus.errors,
      };

      // Determine final status
      if (updatedStatus.completedOperations + updatedStatus.failedOperations >= updatedStatus.totalOperations) {
        updatedStatus.status = updatedStatus.failedOperations > 0 ? JOB_STATUS.FAILED : JOB_STATUS.COMPLETED;
      } else {
        updatedStatus.status = JOB_STATUS.PROCESSING;
      }

      // Update the job with new status
      if (updatedStatus.status === JOB_STATUS.COMPLETED) {
        await this.jobQueue.complete(batchId, updatedStatus);
      } else if (updatedStatus.status === JOB_STATUS.FAILED) {
        await this.jobQueue.fail(batchId, new Error(`Batch failed: ${updatedStatus.failedOperations} operations failed`));
      }

      this.logger.debug("Updated batch progress", updatedStatus);
    } catch (error) {
      this.logger.error("Failed to update batch progress", { batchId, error });
      throw error;
    }
  }

  private mapJobStatusToBatchStatus(jobStatus: JobStatusType): JobStatusType {
    return jobStatus;
  }
}