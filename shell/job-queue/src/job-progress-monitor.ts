import type { Logger } from "@brains/utils/logger";
import { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import type {
  IJobProgressMonitor,
  ProgressNotification,
} from "@brains/utils/progress";
import type { MessageBus } from "@brains/messaging-service";
import type { IBatchJobManager, IJobQueueService, JobInfo } from "./types";
import { JobContextSchema, type JobContext } from "./schema/types";
import type { BatchJobStatus } from "./batch-schemas";
import type { JobProgressEventSchema } from "./schemas";

const jobResultRecordSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    return JSON.parse(value);
  },
  z.record(z.string(), z.unknown()),
);

/**
 * Progress event emitted by the monitor
 */
export type JobProgressEvent = z.output<typeof JobProgressEventSchema>;

/**
 * Simplified service that emits job and batch progress events
 *
 * This service provides a simple event-driven approach to progress monitoring
 * without complex polling or state tracking.
 */
export class JobProgressMonitor implements IJobProgressMonitor {
  private jobQueueService: IJobQueueService;
  private messageBus: MessageBus;
  private batchJobManager: IBatchJobManager;
  private logger: Logger;
  private static instance: JobProgressMonitor | null = null;

  /**
   * Get the singleton instance
   */
  public static getInstance(
    jobQueueService: IJobQueueService,
    messageBus: MessageBus,
    batchJobManager: IBatchJobManager,
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
    batchJobManager: IBatchJobManager,
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
    jobQueueService: IJobQueueService,
    messageBus: MessageBus,
    batchJobManager: IBatchJobManager,
    logger: Logger,
  ) {
    this.jobQueueService = jobQueueService;
    this.messageBus = messageBus;
    this.batchJobManager = batchJobManager;
    this.logger = logger;
  }

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

      await this.messageBus.send({
        type: "job-progress",
        payload: event,
        sender: "job-progress-monitor",
        broadcast: true,
      });

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

  private isBatchChild(jobId: string, rootJobId: string | undefined): boolean {
    return !!rootJobId && rootJobId !== jobId;
  }

  private async broadcastEvent(event: JobProgressEvent): Promise<void> {
    await this.messageBus.send({
      type: "job-progress",
      payload: event,
      sender: "job-progress-monitor",
      broadcast: true,
    });
  }

  private async emitJobProgress(
    jobId: string,
    progress: ProgressNotification,
  ): Promise<void> {
    try {
      const job = await this.jobQueueService.getStatus(jobId);
      if (!job) {
        this.logger.warn("Job not found for progress update", { jobId });
        return;
      }

      if (job.metadata.silent) {
        return;
      }

      if (this.isBatchChild(jobId, job.metadata.rootJobId)) {
        this.logger.debug(
          "Skipping individual job progress for batch operation",
          { jobId, rootJobId: job.metadata.rootJobId },
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

      if (total > 0) {
        event.progress = {
          current: progress.progress,
          total,
          percentage: Math.round((progress.progress / total) * 100),
        };
      }

      await this.broadcastEvent(event);
    } catch (error) {
      this.logger.error("Error emitting job progress", { jobId, error });
    }
  }

  public async emitJobCompletion(jobId: string): Promise<void> {
    await this.emitJobStatusEvent(jobId, "completed");
  }

  public async emitJobFailure(jobId: string): Promise<void> {
    await this.emitJobStatusEvent(jobId, "failed");
  }

  private async emitJobStatusEvent(
    jobId: string,
    status: "completed" | "failed",
  ): Promise<void> {
    try {
      const job = await this.jobQueueService.getStatus(jobId);
      if (!job) {
        this.logger.warn(`Cannot emit ${status} for unknown job`, { jobId });
        return;
      }

      if (job.metadata.silent) {
        return;
      }

      if (this.isBatchChild(jobId, job.metadata.rootJobId)) {
        this.logger.debug(
          `Skipping individual job ${status} for batch operation`,
          { jobId, rootJobId: job.metadata.rootJobId },
        );
        return;
      }

      const event: JobProgressEvent = {
        id: jobId,
        type: "job",
        status,
        message: this.extractStatusMessage(job, status),
        metadata: job.metadata,
        jobDetails: {
          jobType: job.type,
          priority: job.priority,
          retryCount: job.retryCount,
        },
      };

      await this.broadcastEvent(event);
      this.logger.debug(`Emitted job ${status} event`, { jobId });
    } catch (error) {
      this.logger.error(`Error emitting job ${status} event`, {
        jobId,
        error,
      });
    }
  }

  private extractStatusMessage(
    job: JobInfo,
    status: "completed" | "failed",
  ): string | undefined {
    if (status === "failed") {
      return job.lastError ?? undefined;
    }

    if (!job.result) {
      return undefined;
    }

    try {
      const result = jobResultRecordSchema.parse(job.result);
      const message = result["message"];
      if (message) {
        return String(message);
      }
      const routesBuilt = result["routesBuilt"];
      if (routesBuilt !== undefined) {
        return `${routesBuilt} routes built`;
      }
    } catch {
      // Ignore parsing errors
    }

    return undefined;
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
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const parsedMetadata = metadata
      ? JobContextSchema.safeParse(metadata)
      : undefined;
    const jobMetadata = parsedMetadata?.success
      ? parsedMetadata.data
      : undefined;

    if (jobMetadata?.silent) {
      return;
    }

    try {
      await this.emitJobStatusEvent(jobId, status);

      if (jobMetadata && this.isBatchChild(jobId, jobMetadata.rootJobId)) {
        try {
          const rootJobId = jobMetadata.rootJobId;
          const batchStatus =
            await this.batchJobManager.getBatchStatus(rootJobId);
          if (batchStatus) {
            const batchMetadata = batchStatus.metadata ?? jobMetadata;
            await this.emitBatchProgress(rootJobId, batchStatus, batchMetadata);
          }
        } catch (error) {
          this.logger.warn("Failed to emit batch progress", {
            jobId,
            rootJobId: jobMetadata.rootJobId,
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
