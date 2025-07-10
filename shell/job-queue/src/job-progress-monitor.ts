import { ProgressReporter } from "@brains/utils";
import type {
  Logger,
  IJobProgressMonitor,
  ProgressNotification,
} from "@brains/utils";
import type { IJobQueueService } from "./types";
import type { BatchJobManager } from "./batch-job-manager";
import type { BatchJobStatus } from "./schemas";
import type { JobQueue } from "@brains/db";
import type { z } from "zod";
import type { JobProgressEventSchema } from "./schemas";

/**
 * Progress event emitted by the monitor
 */
export type JobProgressEvent = z.infer<typeof JobProgressEventSchema>;

/**
 * Event emitter interface required by the monitor
 */
export interface IEventEmitter {
  send(event: string, data: unknown, target?: string): Promise<void>;
}

/**
 * Internal job progress tracking data
 */
interface JobProgressTrackingData {
  current: number;
  total: number;
  message?: string;
  lastUpdate: number;
  startTime: number;
  lastCurrent: number;
  lastRate?: number;
}

/**
 * Service that monitors job and batch progress and emits events
 *
 * This service monitors both individual long-running jobs and batch operations,
 * emitting progress events through the provided event emitter.
 */
export class JobProgressMonitor implements IJobProgressMonitor {
  private static instance: JobProgressMonitor | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private pollInterval = 500; // Poll every 500ms

  // Track last known states to avoid duplicate events
  private lastJobStates = new Map<string, string>();
  private lastBatchStates = new Map<string, string>();
  // Track batches we've seen to emit final completion event
  private knownBatches = new Set<string>();
  // Cache batch metadata for completed batches to ensure proper targeting
  private batchMetadataCache = new Map<string, string>();

  // Track jobs that are reporting progress
  private jobsWithProgress = new Map<string, JobProgressTrackingData>();

  /**
   * Get the singleton instance
   */
  public static getInstance(
    jobQueueService: IJobQueueService,
    batchJobManager: BatchJobManager,
    eventEmitter: IEventEmitter,
    logger: Logger,
  ): JobProgressMonitor {
    JobProgressMonitor.instance ??= new JobProgressMonitor(
      jobQueueService,
      batchJobManager,
      eventEmitter,
      logger,
    );
    return JobProgressMonitor.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    if (JobProgressMonitor.instance) {
      JobProgressMonitor.instance.stop();
      JobProgressMonitor.instance = null;
    }
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    jobQueueService: IJobQueueService,
    batchJobManager: BatchJobManager,
    eventEmitter: IEventEmitter,
    logger: Logger,
  ): JobProgressMonitor {
    return new JobProgressMonitor(
      jobQueueService,
      batchJobManager,
      eventEmitter,
      logger,
    );
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    private jobQueueService: IJobQueueService,
    private batchJobManager: BatchJobManager,
    private eventEmitter: IEventEmitter,
    private logger: Logger,
  ) {}

  /**
   * Start monitoring for job progress
   */
  public start(): void {
    if (this.isRunning) {
      this.logger.debug("Job progress monitor already running");
      return;
    }

    this.logger.info("Starting job progress monitor");
    this.isRunning = true;

    // Start polling
    this.monitoringInterval = setInterval(() => {
      void this.checkProgress();
    }, this.pollInterval);

    // Do an initial check immediately
    void this.checkProgress();
  }

  /**
   * Stop monitoring
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.logger.info("Stopping job progress monitor");
    this.isRunning = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.lastJobStates.clear();
    this.lastBatchStates.clear();
    this.jobsWithProgress.clear();
    this.knownBatches.clear();
    this.batchMetadataCache.clear();
  }

  /**
   * Create a ProgressReporter for a specific job
   */
  public createProgressReporter(jobId: string): ProgressReporter {
    const reporter = ProgressReporter.from(async (notification) => {
      const now = Date.now();

      // Get existing progress data or create new
      const existing = this.jobsWithProgress.get(jobId);

      // Calculate rate if we have previous data
      let rate: number | undefined;
      let eta: number | undefined;

      if (existing && now > existing.lastUpdate) {
        const timeDelta = (now - existing.lastUpdate) / 1000; // seconds
        const progressDelta = notification.progress - existing.lastCurrent;

        if (progressDelta > 0 && timeDelta > 0) {
          rate = progressDelta / timeDelta;

          // Calculate ETA based on current rate
          const remaining = (notification.total ?? 0) - notification.progress;
          if (rate > 0 && remaining > 0) {
            eta = (remaining / rate) * 1000; // milliseconds
          }
        }
      }

      // Store progress data
      const progressData: JobProgressTrackingData = {
        current: notification.progress,
        total: notification.total ?? 0,
        lastUpdate: now,
        startTime: existing?.startTime ?? now,
        lastCurrent: notification.progress,
      };

      if (notification.message !== undefined) {
        progressData.message = notification.message;
      }

      if (rate !== undefined) {
        progressData.lastRate = rate;
      } else if (existing?.lastRate !== undefined) {
        progressData.lastRate = existing.lastRate;
      }

      this.jobsWithProgress.set(jobId, progressData);

      // Emit progress event immediately (real-time update)
      const progressNotification: ProgressNotification = {
        progress: notification.progress,
      };

      if (notification.total !== undefined) {
        progressNotification.total = notification.total;
      }
      if (notification.message !== undefined) {
        progressNotification.message = notification.message;
      }
      if (rate !== undefined) {
        progressNotification.rate = rate;
      }
      if (eta !== undefined) {
        progressNotification.eta = eta;
      }

      await this.emitJobProgress(jobId, progressNotification);
    });

    if (!reporter) {
      // This should never happen since we always provide a callback
      throw new Error("Failed to create ProgressReporter");
    }

    return reporter;
  }

  /**
   * Check progress of all active jobs and batches
   */
  private async checkProgress(): Promise<void> {
    try {
      // Check individual jobs
      await this.checkJobProgress();

      // Check batch operations
      await this.checkBatchProgress();

      // Clean up old progress reports
      this.cleanupStaleProgress();
    } catch (error) {
      this.logger.error("Error checking progress", { error });
    }
  }

  /**
   * Check progress of individual jobs
   */
  private async checkJobProgress(): Promise<void> {
    try {
      const activeJobs = await this.jobQueueService.getActiveJobs();

      for (const job of activeJobs) {
        await this.emitJobProgressUpdate(job);
      }

      // Clean up completed jobs
      this.cleanupCompletedJobs(activeJobs);
    } catch (error) {
      this.logger.error("Error checking job progress", { error });
    }
  }

  /**
   * Check progress of batch operations
   */
  private async checkBatchProgress(): Promise<void> {
    try {
      const activeBatches = await this.batchJobManager.getActiveBatches();

      for (const { batchId, status, metadata } of activeBatches) {
        this.knownBatches.add(batchId);
        // Cache the source for completed batch events
        this.batchMetadataCache.set(batchId, metadata.source);
        await this.emitBatchProgressUpdate(batchId, status);
      }

      // Check for completed batches that are no longer active
      const activeBatchIds = new Set(activeBatches.map((b) => b.batchId));
      for (const knownBatchId of this.knownBatches) {
        if (!activeBatchIds.has(knownBatchId)) {
          // This batch was known but is no longer active - check if it completed
          const status =
            await this.batchJobManager.getBatchStatus(knownBatchId);
          if (
            status &&
            (status.status === "completed" || status.status === "failed")
          ) {
            // Emit final status
            await this.emitBatchProgressUpdate(knownBatchId, status);
            // Remove from known batches and clear cache
            this.knownBatches.delete(knownBatchId);
            this.batchMetadataCache.delete(knownBatchId);
          }
        }
      }

      // Clean up completed batches
      this.cleanupCompletedBatches(activeBatches);
    } catch (error) {
      this.logger.error("Error checking batch progress", { error });
    }
  }

  /**
   * Emit progress update for an individual job
   */
  private async emitJobProgressUpdate(job: JobQueue): Promise<void> {
    try {
      // Get progress info if available
      const progressInfo = this.jobsWithProgress.get(job.id);

      // Create state key
      const stateKey = JSON.stringify({
        status: job.status,
        retryCount: job.retryCount,
        progress: progressInfo,
      });

      // Check if state has changed
      const lastState = this.lastJobStates.get(job.id);
      if (lastState !== stateKey) {
        this.lastJobStates.set(job.id, stateKey);

        // Calculate current metrics if we have progress info
        let rate: number | undefined;
        let eta: number | undefined;

        if (progressInfo && progressInfo.lastRate !== undefined) {
          rate = progressInfo.lastRate;

          // Calculate ETA based on last known rate
          const remaining = progressInfo.total - progressInfo.current;
          if (rate > 0 && remaining > 0) {
            eta = (remaining / rate) * 1000; // milliseconds
          }
        }

        const event: JobProgressEvent = {
          id: job.id,
          type: "job",
          status: job.status,
          operation: progressInfo?.message ?? `Processing ${job.type}`,
          message: progressInfo?.message,
          jobDetails: {
            jobType: job.type,
            priority: job.priority,
            retryCount: job.retryCount,
          },
        };

        // Add progress info if available
        if (progressInfo) {
          event.progress = {
            current: progressInfo.current,
            total: progressInfo.total,
            percentage: Math.round(
              (progressInfo.current / progressInfo.total) * 100,
            ),
            rate,
            eta,
          };
        }

        // Extract source from job and use as target for the event
        const target = job.source ?? undefined;

        await this.eventEmitter.send("job-progress", event, target);

        this.logger.debug("Emitted job progress update", {
          jobId: job.id,
          type: job.type,
          status: job.status,
          progress: progressInfo,
          target,
        });
      }
    } catch (error) {
      this.logger.error("Error emitting job progress update", {
        jobId: job.id,
        error,
      });
    }
  }

  /**
   * Emit progress update for a batch
   */
  private async emitBatchProgressUpdate(
    batchId: string,
    status: BatchJobStatus,
  ): Promise<void> {
    try {
      // Create state key
      const stateKey = JSON.stringify({
        status: status.status,
        completed: status.completedOperations,
        failed: status.failedOperations,
      });

      // Check if state has changed
      const lastState = this.lastBatchStates.get(batchId);
      if (lastState !== stateKey) {
        this.lastBatchStates.set(batchId, stateKey);

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
          operation: status.currentOperation ?? "Processing batch",
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

        // Get batch metadata to extract source for targeting
        // First try to get from active batches, then fall back to cache
        const activeBatches = await this.batchJobManager.getActiveBatches();
        const batchMetadata = activeBatches.find((b) => b.batchId === batchId);
        const target =
          batchMetadata?.metadata.source ??
          this.batchMetadataCache.get(batchId);

        await this.eventEmitter.send("job-progress", event, target);

        this.logger.debug("Emitted batch progress update", {
          batchId,
          status: status.status,
          progress: `${status.completedOperations}/${status.totalOperations}`,
          target,
        });
      }
    } catch (error) {
      this.logger.error("Error emitting batch progress update", {
        batchId,
        error,
      });
    }
  }

  /**
   * Emit immediate job progress (when reportProgress is called)
   */
  private async emitJobProgress(
    jobId: string,
    progress: ProgressNotification,
  ): Promise<void> {
    try {
      const total = progress.total ?? 0;
      const event: JobProgressEvent = {
        id: jobId,
        type: "job",
        status: "processing",
        progress: {
          current: progress.progress,
          total: total,
          percentage:
            total > 0 ? Math.round((progress.progress / total) * 100) : 0,
          rate: progress.rate,
          eta: progress.eta,
        },
        operation: progress.message ?? "Processing...",
        message: progress.message,
      };

      // Get job to extract source for targeting
      const job = await this.jobQueueService.getStatus(jobId);
      const target = job?.source ?? undefined;

      await this.eventEmitter.send("job-progress", event, target);
    } catch (error) {
      this.logger.error("Error emitting immediate job progress", {
        jobId,
        error,
      });
    }
  }

  /**
   * Clean up completed jobs from tracking
   */
  private cleanupCompletedJobs(activeJobs: JobQueue[]): void {
    const activeJobIds = new Set(activeJobs.map((j) => j.id));

    // Remove jobs that are no longer active
    for (const jobId of this.lastJobStates.keys()) {
      if (!activeJobIds.has(jobId)) {
        this.lastJobStates.delete(jobId);
        this.jobsWithProgress.delete(jobId);
        this.logger.debug("Cleaned up completed job", { jobId });
      }
    }
  }

  /**
   * Clean up completed batches from tracking
   */
  private cleanupCompletedBatches(
    activeBatches: Array<{ batchId: string; status: BatchJobStatus }>,
  ): void {
    const activeBatchIds = new Set(activeBatches.map((b) => b.batchId));

    // Remove batches that are no longer active
    for (const batchId of this.lastBatchStates.keys()) {
      if (!activeBatchIds.has(batchId)) {
        this.lastBatchStates.delete(batchId);
        this.logger.debug("Cleaned up completed batch", { batchId });
      }
    }
  }

  /**
   * Clean up stale progress reports (older than 5 minutes)
   */
  private cleanupStaleProgress(): void {
    const staleThreshold = Date.now() - 5 * 60 * 1000; // 5 minutes

    for (const [jobId, progress] of this.jobsWithProgress.entries()) {
      if (progress.lastUpdate < staleThreshold) {
        this.jobsWithProgress.delete(jobId);
        this.logger.debug("Cleaned up stale progress report", { jobId });
      }
    }
  }

  /**
   * Emit job completion event
   */
  public async emitJobCompletion(jobId: string): Promise<void> {
    try {
      // Get job details to extract source for targeting
      const job = await this.jobQueueService.getStatus(jobId);
      if (!job) {
        this.logger.warn("Cannot emit completion for unknown job", { jobId });
        return;
      }

      // Get the last known progress info
      const progressInfo = this.jobsWithProgress.get(jobId);
      const target = job.source ?? undefined;
      
      // First emit a 100% progress event with "processing" status
      if (progressInfo) {
        const finalProgressEvent: JobProgressEvent = {
          id: jobId,
          type: "job",
          status: "processing",
          operation: progressInfo.message ?? `Completing ${job.type}`,
          message: progressInfo.message,
          progress: {
            current: progressInfo.total,
            total: progressInfo.total,
            percentage: 100,
          },
          jobDetails: {
            jobType: job.type,
            priority: job.priority,
            retryCount: job.retryCount,
          },
        };
        await this.eventEmitter.send("job-progress", finalProgressEvent, target);
        
        // Delay to ensure the progress event is displayed
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Then emit the completion event
      const completionEvent: JobProgressEvent = {
        id: jobId,
        type: "job",
        status: "completed",
        operation: `Completed ${job.type}`,
        jobDetails: {
          jobType: job.type,
          priority: job.priority,
          retryCount: job.retryCount,
        },
      };

      await this.eventEmitter.send("job-progress", completionEvent, target);

      // Clean up tracking data
      this.lastJobStates.delete(jobId);
      this.jobsWithProgress.delete(jobId);

      this.logger.debug("Emitted job completion event", {
        jobId,
        type: job.type,
        target,
      });
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
      // Get job details to extract source for targeting
      const job = await this.jobQueueService.getStatus(jobId);
      if (!job) {
        this.logger.warn("Cannot emit failure for unknown job", { jobId });
        return;
      }

      const event: JobProgressEvent = {
        id: jobId,
        type: "job",
        status: "failed",
        operation: `Failed ${job.type}`,
        message: job.lastError ?? undefined,
        jobDetails: {
          jobType: job.type,
          priority: job.priority,
          retryCount: job.retryCount,
        },
      };

      const target = job.source ?? undefined;
      await this.eventEmitter.send("job-progress", event, target);

      // Clean up tracking data
      this.lastJobStates.delete(jobId);
      this.jobsWithProgress.delete(jobId);

      this.logger.debug("Emitted job failure event", {
        jobId,
        type: job.type,
        target,
      });
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
    monitoredJobs: number;
    monitoredBatches: number;
    jobsWithProgress: number;
    pollInterval: number;
  } {
    return {
      isRunning: this.isRunning,
      monitoredJobs: this.lastJobStates.size,
      monitoredBatches: this.lastBatchStates.size,
      jobsWithProgress: this.jobsWithProgress.size,
      pollInterval: this.pollInterval,
    };
  }
}
