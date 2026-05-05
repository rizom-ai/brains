import type { IJobQueueService, JobContext, JobOptions } from "./types";
import type { BatchOperation, BatchJobStatus, Batch } from "./batch-schemas";
import { JOB_STATUS } from "./schemas";
import type { Logger } from "@brains/utils";

const TERMINAL_BATCH_RETENTION_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

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
      // First Date.now() at which this batch was observed terminal via
      // getBatchStatus. Lets cleanup() decide on a batch without re-fetching
      // every job's status. Stays unset for batches nobody has observed.
      terminalAt?: number;
    }
  >();

  // Timer that sweeps terminal batches older than the retention window. Runs
  // independently of enqueue activity so the map stays bounded even when no
  // new batches are arriving.
  private cleanupTimer: NodeJS.Timeout | null = null;

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
   * Start the periodic cleanup timer. Idempotent — repeated calls reuse the
   * existing interval. The timer is `unref()`-ed so it never blocks process
   * exit on its own.
   */
  public start(intervalMs: number = CLEANUP_INTERVAL_MS): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.scheduleTerminalBatchCleanup();
    }, intervalMs);
    this.cleanupTimer.unref();
  }

  public stop(): void {
    if (!this.cleanupTimer) return;
    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  private scheduleTerminalBatchCleanup(): void {
    void this.cleanup(TERMINAL_BATCH_RETENTION_MS).catch((error) => {
      this.logger.warn("Failed to clean up terminal batch metadata", { error });
    });
  }

  private validateOperations(operations: BatchOperation[]): void {
    for (const operation of operations) {
      const handler = this.jobQueue.getHandler(operation.type);
      if (!handler) {
        throw new Error(
          `No handler registered for job type: ${operation.type}`,
        );
      }

      if (handler.validateAndParse(operation.data) === null) {
        throw new Error(`Invalid job data for type: ${operation.type}`);
      }
    }
  }

  /**
   * Enqueue a batch of operations as individual jobs
   */
  async enqueueBatch(
    operations: BatchOperation[],
    options: JobOptions,
    batchId: string,
    _pluginId?: string,
  ): Promise<string> {
    if (operations.length === 0) {
      throw new Error("Cannot enqueue empty batch");
    }

    this.validateOperations(operations);

    const jobIds: string[] = [];

    try {
      // Enqueue each operation as an individual job
      for (const operation of operations) {
        // Build job options for each individual job
        // Set rootJobId to batchId so CLI progress tracking works through inheritance
        const jobOptions: JobOptions = {
          ...options,
          rootJobId: batchId, // Individual jobs inherit from batch
          metadata: {
            ...options.metadata,
            operationTarget: operation.type,
          },
        };

        const jobId = await this.jobQueue.enqueue({
          type: operation.type,
          data: operation.data,
          options: jobOptions,
        });
        jobIds.push(jobId);
      }

      this.batches.set(batchId, {
        jobIds,
        operations,
        source: options.source,
        startedAt: new Date().toISOString(),
        metadata: {
          ...options.metadata,
          rootJobId: batchId,
        },
      });

      this.logger.debug("Enqueued batch operations", {
        batchId,
        operationCount: operations.length,
        jobIds,
        rootJobId: batchId,
      });

      this.scheduleTerminalBatchCleanup();

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
      let activeOperations = 0;
      const errors: string[] = [];

      for (const [index, job] of jobStatuses.entries()) {
        if (!job) {
          failedOperations++;
          const operation = batch.operations[index];
          const jobId = batch.jobIds[index] ?? "unknown";
          errors.push(
            `Missing job ${jobId}${operation ? ` for ${operation.type}` : ""}`,
          );
          continue;
        }

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
          case "pending":
            activeOperations++;
            break;
        }
      }

      let status: (typeof JOB_STATUS)[keyof typeof JOB_STATUS];
      if (activeOperations > 0) {
        status = JOB_STATUS.PROCESSING;
      } else if (failedOperations > 0) {
        status = JOB_STATUS.FAILED;
      } else {
        status = JOB_STATUS.COMPLETED;
      }

      if (
        batch.terminalAt === undefined &&
        (status === JOB_STATUS.COMPLETED || status === JOB_STATUS.FAILED)
      ) {
        batch.terminalAt = Date.now();
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
        // Include original batch metadata for routing context
        metadata: batch.metadata,
      };
    } catch (error) {
      this.logger.error("Failed to get batch status", { batchId, error });
      throw error;
    }
  }

  /**
   * Clean up old batch metadata.
   *
   * Fast path: batches whose terminal status was already observed via
   * `getBatchStatus` carry a `terminalAt` timestamp; we drop them as soon as
   * that timestamp is older than the cutoff, with no DB reads.
   *
   * Slow path: batches that nobody has ever observed fall back to fetching
   * status once they are at least cutoff-old, matching the pre-memoization
   * behavior. This keeps un-observed terminal batches from leaking forever.
   */
  async cleanup(olderThanMs: number): Promise<number> {
    const cutoffTime = Date.now() - olderThanMs;
    let cleaned = 0;

    for (const [batchId, batch] of this.batches.entries()) {
      if (batch.terminalAt !== undefined) {
        if (batch.terminalAt <= cutoffTime) {
          this.batches.delete(batchId);
          cleaned++;
        }
        continue;
      }

      const batchTime = new Date(batch.startedAt).getTime();
      if (batchTime <= cutoffTime) {
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
    this.batches.set(batchId, {
      jobIds,
      operations,
      source,
      startedAt: new Date().toISOString(),
      metadata,
    });

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
