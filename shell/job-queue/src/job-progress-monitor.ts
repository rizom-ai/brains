import type { Logger } from "@brains/utils";
import type { IJobQueueService } from "./types";
import type { BatchJobManager } from "./batch-job-manager";
import type { BatchJobStatus } from "./schemas";
import type { JobQueue } from "@brains/db";
import { type z } from "zod";
import { JobProgressEventSchema } from "./schemas";

/**
 * Progress event emitted by the monitor
 */
export type JobProgressEvent = z.infer<typeof JobProgressEventSchema>;

/**
 * Event emitter interface required by the monitor
 */
export interface IEventEmitter {
  send(event: string, data: unknown): Promise<void>;
}

/**
 * Progress reporter interface for job handlers
 */
export interface IProgressReporter {
  reportProgress(
    jobId: string,
    current: number,
    total: number,
    message?: string,
  ): void;
}

/**
 * Service that monitors job and batch progress and emits events
 *
 * This service monitors both individual long-running jobs and batch operations,
 * emitting progress events through the provided event emitter.
 */
export class JobProgressMonitor implements IProgressReporter {
  private static instance: JobProgressMonitor | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private pollInterval = 500; // Poll every 500ms

  // Track last known states to avoid duplicate events
  private lastJobStates = new Map<string, string>();
  private lastBatchStates = new Map<string, string>();
  // Track batches we've seen to emit final completion event
  private knownBatches = new Set<string>();

  // Track jobs that are reporting progress
  private jobsWithProgress = new Map<
    string,
    {
      current: number;
      total: number;
      message?: string;
      lastUpdate: number;
    }
  >();

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
  }

  /**
   * Report progress for a specific job (called by job handlers)
   */
  public reportProgress(
    jobId: string,
    current: number,
    total: number,
    message?: string,
  ): void {
    const progressData = {
      current,
      total,
      message: message ?? "Processing...",
      lastUpdate: Date.now(),
    };

    this.jobsWithProgress.set(jobId, progressData);

    // Emit progress event immediately
    const progressInfo = {
      current,
      total,
      message: message ?? "Processing...",
    };

    void this.emitJobProgress(jobId, progressInfo);
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

      for (const { batchId, status } of activeBatches) {
        this.knownBatches.add(batchId);
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
            // Remove from known batches
            this.knownBatches.delete(knownBatchId);
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

        const event: JobProgressEvent = {
          id: job.id,
          type: "job",
          status: job.status,
          message: progressInfo?.message ?? `Processing ${job.type}...`,
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
          };
        }

        await this.eventEmitter.send("job-progress", event);

        this.logger.debug("Emitted job progress update", {
          jobId: job.id,
          type: job.type,
          status: job.status,
          progress: progressInfo,
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

        await this.eventEmitter.send("job-progress", event);

        this.logger.debug("Emitted batch progress update", {
          batchId,
          status: status.status,
          progress: `${status.completedOperations}/${status.totalOperations}`,
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
    progress: { current: number; total: number; message?: string },
  ): Promise<void> {
    try {
      const event: JobProgressEvent = {
        id: jobId,
        type: "job",
        status: "processing",
        progress: {
          current: progress.current,
          total: progress.total,
          percentage: Math.round((progress.current / progress.total) * 100),
        },
        message: progress.message ?? "Processing...",
      };

      await this.eventEmitter.send("job-progress", event);
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
