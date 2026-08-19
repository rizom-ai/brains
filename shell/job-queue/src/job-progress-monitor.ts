import { JOB_CHANNELS } from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import type {
  IJobProgressMonitor,
  ProgressNotification,
} from "@brains/utils/progress";
import type { IMessageBus } from "@brains/messaging-service";
import type { IBatchJobManager, IJobQueueService, JobInfo } from "./types";
import { JobContextSchema, type JobContext } from "./schema/types";
import type { BatchJobStatus } from "./batch-schemas";
import type { JobProgressEvent } from "./schemas";

const jobResultRecordSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    return JSON.parse(value);
  },
  z.record(z.string(), z.unknown()),
);

export type { JobProgressEvent } from "./schemas";
export type JobProgressMonitorMode =
  "combined" | "durable-reader" | "durable-writer";

/**
 * Simplified service that emits job and batch progress events
 *
 * This service provides a simple event-driven approach to progress monitoring
 * without complex polling or state tracking.
 */
export class JobProgressMonitor implements IJobProgressMonitor {
  private jobQueueService: IJobQueueService;
  private messageBus: IMessageBus;
  private batchJobManager: IBatchJobManager;
  private logger: Logger;
  private readonly mode: JobProgressMonitorMode;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private pollCursor = { updatedAt: 0, jobId: "" };
  private polling = false;
  public static createFresh(
    jobQueueService: IJobQueueService,
    messageBus: IMessageBus,
    batchJobManager: IBatchJobManager,
    logger: Logger,
    mode: JobProgressMonitorMode = "combined",
  ): JobProgressMonitor {
    return new JobProgressMonitor(
      jobQueueService,
      messageBus,
      batchJobManager,
      logger,
      mode,
    );
  }

  private constructor(
    jobQueueService: IJobQueueService,
    messageBus: IMessageBus,
    batchJobManager: IBatchJobManager,
    logger: Logger,
    mode: JobProgressMonitorMode,
  ) {
    this.jobQueueService = jobQueueService;
    this.messageBus = messageBus;
    this.batchJobManager = batchJobManager;
    this.logger = logger;
    this.mode = mode;
  }

  public start(): void {
    if (this.mode === "durable-reader" && !this.pollTimer) {
      this.pollCursor = { updatedAt: Date.now(), jobId: "" };
      this.pollTimer = setInterval(() => {
        void this.pollDurableUpdates();
      }, 250);
      this.pollTimer.unref();
      this.logger.debug("Job progress monitor ready (durable polling mode)");
      return;
    }
    this.logger.debug("Job progress monitor ready (event-driven mode)");
  }

  public stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    this.logger.debug("Job progress monitor stopped");
  }

  /** Flush one bounded durable update page sequence. */
  public async pollDurableUpdates(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const updates = await this.jobQueueService.getRuntimeUpdates(
        this.pollCursor,
        100,
      );
      for (const update of updates) {
        this.pollCursor = update.cursor;
        if (update.job.status === "processing" && update.job.progress) {
          await this.publishJobProgress(update.job, update.job.progress);
        } else if (
          update.job.status === "completed" ||
          update.job.status === "failed"
        ) {
          await this.handleJobStatusChange(
            update.job.id,
            update.job.status,
            update.job.metadata,
          );
        }
      }
    } catch (error) {
      this.logger.error("Failed to poll durable job progress", { error });
    } finally {
      this.polling = false;
    }
  }

  /**
   * Create a ProgressReporter for a specific job
   */
  public createProgressReporter(
    jobId: string,
    attemptId?: string,
  ): ProgressReporter {
    const reporter = ProgressReporter.from(async (notification) => {
      await this.emitJobProgress(jobId, notification, attemptId);
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
        type: JOB_CHANNELS.progress,
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

  /** A durable-writer only records progress; its reader publishes events. */
  private get publishesEvents(): boolean {
    return this.mode !== "durable-writer";
  }

  private async broadcastEvent(event: JobProgressEvent): Promise<void> {
    await this.messageBus.send({
      type: JOB_CHANNELS.progress,
      payload: event,
      sender: "job-progress-monitor",
      broadcast: true,
    });
  }

  private async emitJobProgress(
    jobId: string,
    progress: ProgressNotification,
    attemptId?: string,
  ): Promise<void> {
    try {
      if (
        attemptId &&
        !(await this.jobQueueService.recordAttemptProgress(
          jobId,
          attemptId,
          progress,
        ))
      ) {
        this.logger.debug("Discarding progress from obsolete job attempt", {
          jobId,
          attemptId,
        });
        return;
      }

      if (!this.publishesEvents) return;

      const job = await this.jobQueueService.getStatus(jobId);
      if (!job) {
        this.logger.warn("Job not found for progress update", { jobId });
        return;
      }
      await this.publishJobProgress(job, progress);
    } catch (error) {
      this.logger.error("Error emitting job progress", { jobId, error });
    }
  }

  private async publishJobProgress(
    job: JobInfo,
    progress: ProgressNotification,
  ): Promise<void> {
    if (job.metadata.silent) return;
    if (this.isBatchChild(job.id, job.metadata.rootJobId)) return;

    const total = progress.total ?? 0;
    const event: JobProgressEvent = {
      id: job.id,
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
    if (!this.publishesEvents) return;
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
    if (!this.publishesEvents) return;
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
