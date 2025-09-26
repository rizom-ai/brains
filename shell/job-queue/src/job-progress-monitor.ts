import { ProgressReporter } from "@brains/utils";
import type {
  Logger,
  IJobProgressMonitor,
  ProgressNotification,
} from "@brains/utils";
import type { MessageBus } from "@brains/messaging-service";
import type { IJobQueueService } from "./types";
import type { BatchJobManager } from "./batch-job-manager";
import type { BatchJobStatus } from "./batch-schemas";
import type { z } from "@brains/utils";
import type { JobProgressEventSchema } from "./schemas";
import type { JobContext } from "./types";

/**
 * Progress event emitted by the monitor
 */
export type JobProgressEvent = z.infer<typeof JobProgressEventSchema>;

/**
 * Simplified service that emits job and batch progress events
 *
 * This service provides a simple event-driven approach to progress monitoring
 * without complex polling or state tracking.
 */
export class JobProgressMonitor implements IJobProgressMonitor {
  private static instance: JobProgressMonitor | null = null;

  /**
   * Get the singleton instance
   */
  public static getInstance(
    jobQueueService: IJobQueueService,
    messageBus: MessageBus,
    batchJobManager: BatchJobManager,
    logger: Logger,
  ): JobProgressMonitor {
    JobProgressMonitor.instance ??= new JobProgressMonitor(
      jobQueueService,
      messageBus,
      batchJobManager,
      logger,
    );
    return JobProgressMonitor.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    JobProgressMonitor.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    jobQueueService: IJobQueueService,
    messageBus: MessageBus,
    batchJobManager: BatchJobManager,
    logger: Logger,
  ): JobProgressMonitor {
    return new JobProgressMonitor(
      jobQueueService,
      messageBus,
      batchJobManager,
      logger,
    );
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    private jobQueueService: IJobQueueService,
    private messageBus: MessageBus,
    private batchJobManager: BatchJobManager,
    private logger: Logger,
  ) {}

  /**
   * Start monitoring - now a no-op since we're event-driven
   */
  public start(): void {
    this.logger.debug("Job progress monitor ready (event-driven mode)");
  }

  /**
   * Stop monitoring - now a no-op since no polling
   */
  public stop(): void {
    this.logger.debug("Job progress monitor stopped");
  }

  /**
   * Create a ProgressReporter for a specific job
   */
  public createProgressReporter(jobId: string): ProgressReporter {
    const reporter = ProgressReporter.from(async (notification) => {
      await this.emitJobProgress(jobId, notification);
    });

    if (!reporter) {
      // This should never happen since we always provide a callback
      throw new Error("Failed to create ProgressReporter");
    }

    return reporter;
  }

  /**
   * Emit batch progress event
   */
  public async emitBatchProgress(
    batchId: string,
    status: BatchJobStatus,
    metadata: JobContext,
  ): Promise<void> {
    try {
      const batchDetails: JobProgressEvent["batchDetails"] = {
        totalOperations: status.totalOperations,
        completedOperations: status.completedOperations,
        failedOperations: status.failedOperations,
        currentOperation: status.currentOperation ?? "Processing batch...",
        errors: status.errors,
      };

      const event: JobProgressEvent = {
        id: batchId,
        type: "batch",
        status: status.status,
        metadata,
        batchDetails,
      };

      // Calculate overall batch progress
      if (status.totalOperations > 0) {
        event.progress = {
          current: status.completedOperations,
          total: status.totalOperations,
          percentage: Math.round(
            (status.completedOperations / status.totalOperations) * 100,
          ),
        };
      }

      await this.messageBus.send(
        "job-progress",
        event,
        "job-progress-monitor",
        undefined, // no target - use metadata for routing
        undefined,
        true, // broadcast to all subscribers
      );

      this.logger.debug("Emitted batch progress update", {
        batchId,
        status: status.status,
        progress: `${status.completedOperations}/${status.totalOperations}`,
      });
    } catch (error) {
      this.logger.error("Error emitting batch progress update", {
        batchId,
        error,
      });
    }
  }

  /**
   * Emit job progress event
   */
  private async emitJobProgress(
    jobId: string,
    progress: ProgressNotification,
  ): Promise<void> {
    try {
      // Get job to extract metadata for routing
      const job = await this.jobQueueService.getStatus(jobId);
      if (!job) {
        this.logger.warn("Job not found for progress update", { jobId });
        return;
      }

      // Skip individual job progress for batch operations
      // Only show individual job progress for standalone jobs (where rootJobId === jobId)
      const rootJobId = job.metadata.rootJobId;
      if (rootJobId && rootJobId !== jobId) {
        // This is part of a batch operation - skip individual job progress
        // The batch progress will be emitted separately by handleJobStatusChange
        this.logger.debug(
          "Skipping individual job progress for batch operation",
          {
            jobId,
            rootJobId,
          },
        );
        return;
      }

      const total = progress.total ?? 0;
      const event: JobProgressEvent = {
        id: jobId,
        type: "job",
        status: "processing",
        metadata: job.metadata,
        message: progress.message,
      };

      // Add progress info if we have totals
      if (total > 0) {
        event.progress = {
          current: progress.progress,
          total: total,
          percentage: Math.round((progress.progress / total) * 100),
        };
      }

      await this.messageBus.send(
        "job-progress",
        event,
        "job-progress-monitor",
        undefined, // no target - use metadata for routing
        undefined,
        true, // broadcast to all subscribers
      );
    } catch (error) {
      this.logger.error("Error emitting job progress", {
        jobId,
        error,
      });
    }
  }

  /**
   * Emit job completion event
   */
  public async emitJobCompletion(jobId: string): Promise<void> {
    try {
      const job = await this.jobQueueService.getStatus(jobId);
      if (!job) {
        this.logger.warn("Cannot emit completion for unknown job", { jobId });
        return;
      }

      // Skip individual job completion for batch operations
      const rootJobId = job.metadata.rootJobId;
      if (rootJobId && rootJobId !== jobId) {
        this.logger.debug(
          "Skipping individual job completion for batch operation",
          {
            jobId,
            rootJobId,
          },
        );
        return;
      }

      const event: JobProgressEvent = {
        id: jobId,
        type: "job",
        status: "completed",
        metadata: job.metadata,
        jobDetails: {
          jobType: job.type,
          priority: job.priority,
          retryCount: job.retryCount,
        },
      };

      await this.messageBus.send(
        "job-progress",
        event,
        "job-progress-monitor",
        undefined,
        undefined,
        true,
      );

      this.logger.debug("Emitted job completion event", { jobId });
    } catch (error) {
      this.logger.error("Error emitting job completion event", {
        jobId,
        error,
      });
    }
  }

  /**
   * Emit job failure event
   */
  public async emitJobFailure(jobId: string): Promise<void> {
    try {
      const job = await this.jobQueueService.getStatus(jobId);
      if (!job) {
        this.logger.warn("Cannot emit failure for unknown job", { jobId });
        return;
      }

      // Skip individual job failure for batch operations
      const rootJobId = job.metadata.rootJobId;
      if (rootJobId && rootJobId !== jobId) {
        this.logger.debug(
          "Skipping individual job failure for batch operation",
          {
            jobId,
            rootJobId,
          },
        );
        return;
      }

      const event: JobProgressEvent = {
        id: jobId,
        type: "job",
        status: "failed",
        message: job.lastError ?? undefined,
        metadata: job.metadata,
        jobDetails: {
          jobType: job.type,
          priority: job.priority,
          retryCount: job.retryCount,
        },
      };

      await this.messageBus.send(
        "job-progress",
        event,
        "job-progress-monitor",
        undefined,
        undefined,
        true,
      );

      this.logger.debug("Emitted job failure event", { jobId });
    } catch (error) {
      this.logger.error("Error emitting job failure event", {
        jobId,
        error,
      });
    }
  }

  /**
   * Get monitoring statistics
   */
  public getStats(): {
    isRunning: boolean;
  } {
    return {
      isRunning: true, // Always running in event-driven mode
    };
  }

  /**
   * Handle job status changes - emits individual job events and batch progress if applicable
   * This is the main entry point for job completion/failure notifications
   */
  public async handleJobStatusChange(
    jobId: string,
    status: "completed" | "failed",
    metadata?: JobContext,
  ): Promise<void> {
    try {
      // Emit individual job status event
      if (status === "completed") {
        await this.emitJobCompletion(jobId);
      } else {
        // status === "failed"
        await this.emitJobFailure(jobId);
      }

      // Check if this job is part of a batch and emit batch progress
      const rootJobId = metadata?.rootJobId;
      if (rootJobId && rootJobId !== jobId) {
        try {
          const batchStatus =
            await this.batchJobManager.getBatchStatus(rootJobId);
          if (batchStatus) {
            await this.emitBatchProgress(rootJobId, batchStatus, metadata);
          }
        } catch (error) {
          this.logger.warn("Failed to emit batch progress", {
            jobId,
            rootJobId,
            error,
          });
        }
      }
    } catch (error) {
      this.logger.error("Failed to handle job status change", {
        jobId,
        status,
        error,
      });
    }
  }
}
