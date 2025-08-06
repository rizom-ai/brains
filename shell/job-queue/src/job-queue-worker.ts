import type { Logger, IJobProgressMonitor } from "@brains/utils";
import type { JobQueueService } from "./job-queue-service";
import type { JobQueue } from "./schema/job-queue";
import type { JobResult } from "./schemas";
import { JOB_STATUS } from "./schemas";

/**
 * Configuration options for the JobQueueWorker
 */
export interface JobQueueWorkerConfig {
  /** Number of concurrent jobs to process */
  concurrency?: number;
  /** Polling interval in milliseconds */
  pollInterval?: number;
  /** Maximum number of jobs to process before stopping (0 for unlimited) */
  maxJobs?: number;
  /** Whether to start the worker automatically */
  autoStart?: boolean;
}

/**
 * Statistics for the JobQueueWorker
 */
export interface JobQueueWorkerStats {
  /** Number of jobs processed successfully */
  processedJobs: number;
  /** Number of jobs that failed */
  failedJobs: number;
  /** Number of jobs currently being processed */
  activeJobs: number;
  /** Worker uptime in milliseconds */
  uptime: number;
  /** Whether the worker is currently running */
  isRunning: boolean;
  /** Last error encountered */
  lastError?: string;
}

/**
 * Generic job queue worker that processes jobs from the queue
 * Supports configurable concurrency and polling intervals
 * Implements Component Interface Standardization pattern
 */
export class JobQueueWorker {
  private static instance: JobQueueWorker | null = null;
  private logger: Logger;
  private jobQueueService: JobQueueService;
  private progressMonitor: IJobProgressMonitor;
  private config: Required<JobQueueWorkerConfig>;
  private isRunning: boolean = false;
  private shouldStop: boolean = false;
  private activeJobs: Set<string> = new Set();
  private stats: JobQueueWorkerStats;
  private startTime: number = 0;
  private pollTimeout: NodeJS.Timeout | null = null;
  private processingPromises: Map<string, Promise<void>> = new Map();

  /**
   * Get the singleton instance
   */
  public static getInstance(
    jobQueueService: JobQueueService,
    progressMonitor: IJobProgressMonitor,
    logger: Logger,
    config?: JobQueueWorkerConfig,
  ): JobQueueWorker {
    JobQueueWorker.instance ??= new JobQueueWorker(
      jobQueueService,
      progressMonitor,
      logger,
      config,
    );
    return JobQueueWorker.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    JobQueueWorker.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    jobQueueService: JobQueueService,
    progressMonitor: IJobProgressMonitor,
    logger: Logger,
    config?: JobQueueWorkerConfig,
  ): JobQueueWorker {
    return new JobQueueWorker(jobQueueService, progressMonitor, logger, config);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    jobQueueService: JobQueueService,
    progressMonitor: IJobProgressMonitor,
    logger: Logger,
    config?: JobQueueWorkerConfig,
  ) {
    this.logger = logger.child("JobQueueWorker");
    this.jobQueueService = jobQueueService;
    this.progressMonitor = progressMonitor;
    this.config = {
      concurrency: config?.concurrency ?? 1,
      pollInterval: config?.pollInterval ?? 1000,
      maxJobs: config?.maxJobs ?? 0,
      autoStart: config?.autoStart ?? false,
    };

    this.stats = {
      processedJobs: 0,
      failedJobs: 0,
      activeJobs: 0,
      uptime: 0,
      isRunning: false,
    };

    this.logger.info("JobQueueWorker initialized", {
      concurrency: this.config.concurrency,
      pollInterval: this.config.pollInterval,
      maxJobs: this.config.maxJobs,
      autoStart: this.config.autoStart,
    });

    if (this.config.autoStart) {
      void this.start();
    }
  }

  /**
   * Start the worker
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn("Worker is already running");
      return;
    }

    this.logger.info("Starting JobQueueWorker");
    this.isRunning = true;
    this.shouldStop = false;
    this.startTime = Date.now();
    this.stats.isRunning = true;

    // Start the main processing loop
    this.scheduleNextPoll();
  }

  /**
   * Stop the worker gracefully
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn("Worker is not running");
      return;
    }

    this.logger.info("Stopping JobQueueWorker");
    this.shouldStop = true;

    // Clear any scheduled polls
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    // Wait for all active jobs to complete
    if (this.processingPromises.size > 0) {
      this.logger.info("Waiting for active jobs to complete", {
        activeJobs: this.processingPromises.size,
      });
      await Promise.all(this.processingPromises.values());
    }

    this.isRunning = false;
    this.stats.isRunning = false;
    this.logger.info("JobQueueWorker stopped");
  }

  /**
   * Get current worker statistics
   */
  public getStats(): JobQueueWorkerStats {
    return {
      ...this.stats,
      activeJobs: this.activeJobs.size,
      uptime: this.isRunning ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Check if the worker is running
   */
  public isWorkerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Process available jobs from the queue
   */
  private async processAvailableJobs(): Promise<void> {
    if (!this.isRunning || this.shouldStop) {
      return;
    }

    try {
      // Check if we have capacity for more jobs
      const availableSlots = this.config.concurrency - this.activeJobs.size;
      if (availableSlots <= 0) {
        return;
      }

      // Check if we've reached the maximum job limit
      if (
        this.config.maxJobs > 0 &&
        this.stats.processedJobs >= this.config.maxJobs
      ) {
        this.logger.info("Maximum job limit reached, stopping worker", {
          maxJobs: this.config.maxJobs,
          processedJobs: this.stats.processedJobs,
        });
        await this.stop();
        return;
      }

      // Get jobs from the queue
      const jobs: JobQueue[] = [];
      for (let i = 0; i < availableSlots; i++) {
        const job = await this.jobQueueService.dequeue();
        if (job) {
          jobs.push(job);
        } else {
          break; // No more jobs available
        }
      }

      // Process jobs concurrently
      for (const job of jobs) {
        const processingPromise = this.processJobWrapper(job);
        this.processingPromises.set(job.id, processingPromise);
      }
    } catch (error) {
      this.logger.error("Error processing available jobs", { error });
      this.stats.lastError =
        error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Wrapper for processing a single job with error handling
   */
  private async processJobWrapper(job: JobQueue): Promise<void> {
    const jobId = job.id;
    this.activeJobs.add(jobId);

    try {
      this.logger.debug("Processing job", {
        jobId,
        type: job.type,
        priority: job.priority,
        retryCount: job.retryCount,
      });

      // Process the job
      const result = await this.processJob(job);

      if (result.status === "completed") {
        this.stats.processedJobs++;
        this.logger.debug("Job completed successfully", {
          jobId,
          type: result.type,
        });
      } else {
        this.stats.failedJobs++;
        this.logger.warn("Job failed", {
          jobId,
          type: result.type,
          error: result.error,
        });
      }
    } catch (error) {
      this.stats.failedJobs++;
      this.logger.error("Error processing job", {
        jobId,
        type: job.type,
        error,
      });
      this.stats.lastError =
        error instanceof Error ? error.message : String(error);
    } finally {
      this.activeJobs.delete(jobId);
      this.processingPromises.delete(jobId);
    }
  }

  /**
   * Schedule the next poll for jobs
   */
  private scheduleNextPoll(): void {
    if (!this.isRunning || this.shouldStop) {
      return;
    }

    this.pollTimeout = setTimeout(async () => {
      await this.processAvailableJobs();
      this.scheduleNextPoll();
    }, this.config.pollInterval);
  }

  /**
   * Process a job using its registered handler
   */
  private async processJob(job: JobQueue): Promise<JobResult> {
    const handler = this.jobQueueService.getHandler(job.type);
    if (!handler) {
      const error = new Error(
        `No handler registered for job type: ${job.type}`,
      );
      await this.jobQueueService.fail(job.id, error);
      return {
        jobId: job.id,
        type: job.type,
        status: JOB_STATUS.FAILED,
        error: error.message,
      };
    }

    try {
      this.logger.debug("Processing job", {
        jobId: job.id,
        type: job.type,
      });

      // Validate and parse job data before processing
      const rawData = JSON.parse(job.data);
      const parsedData = handler.validateAndParse(rawData);
      if (parsedData === null) {
        throw new Error(`Invalid job data for type: ${job.type}`);
      }

      // Create progress reporter for this job
      const progressReporter = this.progressMonitor.createProgressReporter(
        job.id,
      );

      const result = await handler.process(
        parsedData,
        job.id,
        progressReporter,
      );

      await this.jobQueueService.complete(job.id, result);

      // Emit completion event immediately
      await this.progressMonitor.emitJobCompletion(job.id);

      return {
        jobId: job.id,
        type: job.type,
        status: JOB_STATUS.COMPLETED,
        result,
      };
    } catch (error) {
      const processError =
        error instanceof Error ? error : new Error(String(error));

      // Call handler's error callback if available
      try {
        // Validate and parse job data for error handler
        const rawData = JSON.parse(job.data);
        const parsedData = handler.validateAndParse(rawData);
        if (parsedData !== null) {
          // Create progress reporter for error handling
          const progressReporter = this.progressMonitor.createProgressReporter(
            job.id,
          );
          await handler.onError?.(
            processError,
            parsedData,
            job.id,
            progressReporter,
          );
        }
      } catch (callbackError) {
        this.logger.error("Job handler error callback failed", {
          jobId: job.id,
          error: callbackError,
        });
      }

      await this.jobQueueService.fail(job.id, processError);

      // Emit failure event immediately (unless it's being retried)
      const status = await this.jobQueueService.getStatus(job.id);
      if (status && status.status === JOB_STATUS.FAILED) {
        await this.progressMonitor.emitJobFailure(job.id);
      }

      return {
        jobId: job.id,
        type: job.type,
        status: JOB_STATUS.FAILED,
        error: processError.message,
      };
    }
  }
}
