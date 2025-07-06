import type { IJobQueueService } from "./types";
import type { BatchOperation, BatchJobStatus } from "./schemas";
import {
  BatchJobStatusSchema,
  BatchJobDataSchema,
  JOB_STATUS,
} from "./schemas";
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
      this.logger.error("Failed to enqueue batch operation", {
        error,
        operations,
      });
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
      if (job.data) {
        try {
          const batchData = BatchJobDataSchema.parse(job.data);

          // Determine status based on progress and job status
          let status = job.status;
          if (
            job.status === JOB_STATUS.PENDING &&
            (batchData.completedOperations > 0 ||
              batchData.failedOperations > 0)
          ) {
            // If job is still pending but we have progress, we're processing
            status = JOB_STATUS.PROCESSING;
          }
          // If job has completed or failed, use that status

          return {
            batchId,
            totalOperations: batchData.operations.length,
            completedOperations: batchData.completedOperations,
            failedOperations: batchData.failedOperations,
            errors: batchData.errors,
            status,
            currentOperation: batchData.currentOperation,
          };
        } catch {
          // Data doesn't match batch schema, fall through to basic status
        }
      }

      // Fallback: basic status based on job status
      return {
        batchId,
        totalOperations: 1,
        completedOperations: job.status === JOB_STATUS.COMPLETED ? 1 : 0,
        failedOperations: job.status === JOB_STATUS.FAILED ? 1 : 0,
        errors: job.lastError ? [job.lastError] : [],
        status: job.status,
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
      const job = await this.jobQueue.getStatus(batchId);
      if (!job) {
        throw new Error(`Batch ${batchId} not found`);
      }

      // Parse current batch data
      const batchData = BatchJobDataSchema.parse(job.data);

      // Update batch data with new progress
      const updatedData = {
        ...batchData,
        completedOperations:
          update.completedOperations !== undefined
            ? update.completedOperations
            : batchData.completedOperations,
        failedOperations:
          update.failedOperations !== undefined
            ? update.failedOperations
            : batchData.failedOperations,
        currentOperation:
          update.currentOperation !== undefined
            ? update.currentOperation
            : batchData.currentOperation,
        errors: update.errors
          ? [...batchData.errors, ...update.errors]
          : batchData.errors,
      };

      // Determine if batch is complete
      const totalProcessed =
        updatedData.completedOperations + updatedData.failedOperations;
      const isComplete = totalProcessed >= batchData.operations.length;

      if (isComplete) {
        // Build final status for completed/failed jobs
        const finalStatus: BatchJobStatus = {
          batchId,
          totalOperations: batchData.operations.length,
          completedOperations: updatedData.completedOperations,
          failedOperations: updatedData.failedOperations,
          errors: updatedData.errors,
          status:
            updatedData.failedOperations > 0
              ? JOB_STATUS.FAILED
              : JOB_STATUS.COMPLETED,
          currentOperation: updatedData.currentOperation,
        };

        if (updatedData.failedOperations > 0) {
          // Store the batch status as result before failing
          await this.jobQueue.update(batchId, updatedData);
          await this.jobQueue.fail(
            batchId,
            new Error(
              `Batch failed: ${updatedData.failedOperations} operations failed`,
            ),
          );
        } else {
          await this.jobQueue.complete(batchId, finalStatus);
        }
      } else {
        // Update job data for in-progress jobs
        await this.jobQueue.update(batchId, updatedData);
      }

      this.logger.debug("Updated batch progress", {
        batchId,
        ...updatedData,
      });
    } catch (error) {
      this.logger.error("Failed to update batch progress", { batchId, error });
      throw error;
    }
  }
}
