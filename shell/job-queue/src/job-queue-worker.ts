import { getErrorMessage, toError } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type { IJobProgressMonitor } from "@brains/utils/progress";
import { HandlerFailureSchema, type JobResult } from "./schemas";
import type {
  IJobQueueService,
  JobInfo,
  JobQueueWorkerConfig,
  JobQueueWorkerStats,
} from "./types";
import { JOB_STATUS } from "./schemas";
import {
  Effect,
  Exit,
  Fiber,
  FiberMap,
  Schedule,
  Scope,
} from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";

interface JobQueueWorkerRuntimeOptions {
  /** Internal clock boundary used for deterministic polling tests. */
  clock?: Clock.Clock;
}

type WorkerTransitionKind = "start" | "stop";

interface WorkerTransition {
  kind: WorkerTransitionKind;
  awaitInFlightPoll: boolean;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

/**
 * Generic job queue worker that processes jobs from the queue
 * Supports configurable concurrency and polling intervals
 * Implements Component Interface Standardization pattern
 */
export class JobQueueWorker {
  private static instance: JobQueueWorker | null = null;
  private logger: Logger;
  private jobQueueService: IJobQueueService;
  private progressMonitor: IJobProgressMonitor;
  private config: Required<JobQueueWorkerConfig>;
  private isRunning: boolean = false;
  private shouldStop: boolean = false;
  private activeJobs: Set<string> = new Set();
  private stats: JobQueueWorkerStats;
  private startTime: number = 0;
  private pollFiber: Fiber.RuntimeFiber<void, never> | null = null;
  private currentPoll: Promise<void> | null = null;
  private workerScope: Scope.CloseableScope | null = null;
  private jobFibers: FiberMap.FiberMap<string, void, never> | null = null;
  private activeTransition: WorkerTransition | null = null;
  private readonly transitionQueue: WorkerTransition[] = [];
  private readonly clock: Clock.Clock | undefined;

  /**
   * Get the singleton instance
   */
  public static getInstance(
    jobQueueService: IJobQueueService,
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
    jobQueueService: IJobQueueService,
    progressMonitor: IJobProgressMonitor,
    logger: Logger,
    config?: JobQueueWorkerConfig,
  ): JobQueueWorker;
  public static createFresh(
    jobQueueService: IJobQueueService,
    progressMonitor: IJobProgressMonitor,
    logger: Logger,
    config?: JobQueueWorkerConfig,
    runtimeOptions?: JobQueueWorkerRuntimeOptions,
  ): JobQueueWorker {
    return new JobQueueWorker(
      jobQueueService,
      progressMonitor,
      logger,
      config,
      runtimeOptions,
    );
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    jobQueueService: IJobQueueService,
    progressMonitor: IJobProgressMonitor,
    logger: Logger,
    config?: JobQueueWorkerConfig,
    runtimeOptions?: JobQueueWorkerRuntimeOptions,
  ) {
    this.logger = logger.child("JobQueueWorker");
    this.jobQueueService = jobQueueService;
    this.progressMonitor = progressMonitor;
    this.clock = runtimeOptions?.clock;
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

    this.logger.debug("JobQueueWorker initialized", {
      concurrency: this.config.concurrency,
      pollInterval: this.config.pollInterval,
      maxJobs: this.config.maxJobs,
      autoStart: this.config.autoStart,
    });

    if (this.config.autoStart) {
      void this.start().catch((error: unknown) => {
        this.logger.error("Failed to auto-start JobQueueWorker", { error });
      });
    }
  }

  /**
   * Start the worker
   */
  public start(): Promise<void> {
    return this.requestTransition("start", true);
  }

  private async startWorker(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn("Worker is already running");
      return;
    }

    this.logger.debug("Starting JobQueueWorker");
    this.isRunning = true;
    this.shouldStop = false;
    this.startTime = Date.now();
    this.stats.isRunning = true;

    this.workerScope = Effect.runSync(Scope.make());
    this.jobFibers = Effect.runSync(
      Scope.extend(FiberMap.make<string, void, never>(), this.workerScope),
    );

    // Start the supervised polling fiber.
    this.pollFiber = Effect.runFork(this.runPollingLoop());
  }

  /**
   * Stop the worker gracefully
   */
  public stop(): Promise<void> {
    return this.requestTransition("stop", true);
  }

  private async stopWorker(options: {
    awaitInFlightPoll: boolean;
  }): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn("Worker is not running");
      return;
    }

    this.logger.debug("Stopping JobQueueWorker");
    this.shouldStop = true;

    // Interrupting the polling fiber cancels its sleep immediately. A Promise
    // already dequeuing work may continue underneath, so currentPoll is still
    // awaited below to preserve claim-and-drain semantics.
    if (options.awaitInFlightPoll && this.pollFiber) {
      const pollFiber = this.pollFiber;
      await Effect.runPromise(Fiber.interrupt(pollFiber));
      this.pollFiber = null;
    }

    // A poll already past its shouldStop check may still claim jobs; wait for
    // it so those jobs are registered in the FiberMap before we drain.
    // Skipped when the poll itself initiates the stop (maxJobs reached),
    // which would deadlock on its own promise.
    if (options.awaitInFlightPoll && this.currentPoll) {
      await this.currentPoll;
      this.currentPoll = null;
    }

    // The in-flight poll is settled, so no more fibers can be added. Await
    // existing jobs without interrupting them, preserving graceful shutdown.
    if (this.jobFibers) {
      this.logger.debug("Waiting for active jobs to complete", {
        activeJobs: this.activeJobs.size,
      });
      await Effect.runPromise(FiberMap.awaitEmpty(this.jobFibers));
    }

    await this.closeWorkerScope();
    this.isRunning = false;
    this.stats.isRunning = false;
    this.logger.debug("JobQueueWorker stopped");
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
   * Read `shouldStop` via a call so TS doesn't narrow it to `false` across
   * awaits — stop() can flip it while a poll is suspended on a dequeue.
   */
  private isStopRequested(): boolean {
    return this.shouldStop;
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
      let availableSlots = this.config.concurrency - this.activeJobs.size;
      if (availableSlots <= 0) {
        return;
      }

      // Check if we've reached the maximum job attempt limit.
      // Include failed and active jobs so concurrency cannot exceed maxJobs.
      if (this.config.maxJobs > 0) {
        const completedAttempts =
          this.stats.processedJobs + this.stats.failedJobs;
        const remainingJobs =
          this.config.maxJobs - completedAttempts - this.activeJobs.size;

        if (remainingJobs <= 0) {
          this.logger.debug("Maximum job limit reached, stopping worker", {
            maxJobs: this.config.maxJobs,
            processedJobs: this.stats.processedJobs,
            failedJobs: this.stats.failedJobs,
          });
          await this.requestTransition("stop", false);
          return;
        }

        availableSlots = Math.min(availableSlots, remainingJobs);
      }

      // Get jobs from the queue
      const jobs: JobInfo[] = [];
      for (let i = 0; i < availableSlots; i++) {
        // Re-check on every iteration — stop() may have been requested
        // while awaiting a previous dequeue
        if (this.isStopRequested()) {
          break;
        }
        const job = await this.jobQueueService.dequeue();
        if (job) {
          jobs.push(job);
        } else {
          break; // No more jobs available
        }
      }

      // Process jobs concurrently under the worker's supervised fiber map.
      const jobFibers = this.jobFibers;
      if (!jobFibers) {
        if (jobs.length > 0) {
          throw new Error("Worker job fiber scope is not available");
        }
        return;
      }
      for (const job of jobs) {
        this.activeJobs.add(job.id);
        await Effect.runPromise(
          FiberMap.run(
            jobFibers,
            job.id,
            Effect.promise(() => this.processJobWrapper(job)),
          ),
        );
      }
    } catch (error) {
      this.logger.error("Error processing available jobs", { error });
      this.stats.lastError = getErrorMessage(error);
    }
  }

  /**
   * Wrapper for processing a single job with error handling
   */
  private async processJobWrapper(job: JobInfo): Promise<void> {
    const jobId = job.id;

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
      this.stats.lastError = getErrorMessage(error);
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Poll on a spaced schedule until stop is requested. The fiber is
   * interrupted by stop() while waiting or between polls.
   */
  private runPollingLoop(): Effect.Effect<void> {
    const poll = Effect.suspend(() => {
      if (!this.isWorkerRunning() || this.isStopRequested()) {
        return Effect.interrupt;
      }

      // Keep the Promise reference because dequeue itself is not abortable.
      // stop() waits for it before draining any jobs claimed by that poll.
      this.currentPoll = this.processAvailableJobs();
      return Effect.promise(() => this.currentPoll ?? Promise.resolve()).pipe(
        Effect.andThen(
          Effect.suspend(() => {
            this.currentPoll = null;
            return !this.isWorkerRunning() || this.isStopRequested()
              ? Effect.interrupt
              : Effect.void;
          }),
        ),
      );
    });

    const scheduledPolling = poll.pipe(
      Effect.schedule(Schedule.spaced(this.config.pollInterval)),
      Effect.asVoid,
    );
    const loop = this.clock
      ? Effect.withClock(scheduledPolling, this.clock)
      : scheduledPolling;

    return loop.pipe(
      Effect.ensuring(
        Effect.sync(() => {
          this.pollFiber = null;
        }),
      ),
    );
  }

  private requestTransition(
    kind: WorkerTransitionKind,
    awaitInFlightPoll: boolean,
  ): Promise<void> {
    const tail = this.transitionQueue.at(-1) ?? this.activeTransition;
    if (tail?.kind === kind) return tail.promise;

    let resolveTransition: () => void = () => undefined;
    let rejectTransition: (error: unknown) => void = () => undefined;
    const promise = new Promise<void>((resolve, reject) => {
      resolveTransition = resolve;
      rejectTransition = reject;
    });
    const transition: WorkerTransition = {
      kind,
      awaitInFlightPoll,
      promise,
      resolve: resolveTransition,
      reject: rejectTransition,
    };
    this.transitionQueue.push(transition);
    this.runNextTransition();
    return promise;
  }

  private runNextTransition(): void {
    if (this.activeTransition) return;
    const transition = this.transitionQueue.shift();
    if (!transition) return;
    this.activeTransition = transition;

    const operation =
      transition.kind === "start"
        ? this.startWorker()
        : this.stopWorker({
            awaitInFlightPoll: transition.awaitInFlightPoll,
          });
    void operation.then(
      () => this.completeTransition(transition, true),
      (error: unknown) => this.completeTransition(transition, false, error),
    );
  }

  private completeTransition(
    transition: WorkerTransition,
    succeeded: boolean,
    error?: unknown,
  ): void {
    if (this.activeTransition !== transition) return;
    this.activeTransition = null;
    if (succeeded) {
      transition.resolve();
    } else {
      transition.reject(error);
    }
    queueMicrotask(() => this.runNextTransition());
  }

  private async closeWorkerScope(): Promise<void> {
    const scope = this.workerScope;
    this.workerScope = null;
    this.jobFibers = null;
    if (scope) {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
  }

  /**
   * Process a job using its registered handler
   */
  private async processJob(job: JobInfo): Promise<JobResult> {
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

      // Check if handler returned a controlled failure
      const failure = HandlerFailureSchema.safeParse(result);
      if (failure.success) {
        const errorMessage = failure.data.error ?? "Handler returned failure";

        await this.jobQueueService.fail(job.id, new Error(errorMessage));

        const status = await this.jobQueueService.getStatus(job.id);
        if (status?.status === JOB_STATUS.FAILED) {
          await this.progressMonitor.handleJobStatusChange(
            job.id,
            "failed",
            job.metadata,
          );
        }

        return {
          jobId: job.id,
          type: job.type,
          status: JOB_STATUS.FAILED,
          error: errorMessage,
        };
      }

      await this.jobQueueService.complete(job.id, result);

      // Handle job completion - emits individual job events and batch progress if applicable
      await this.progressMonitor.handleJobStatusChange(
        job.id,
        "completed",
        job.metadata,
      );

      return {
        jobId: job.id,
        type: job.type,
        status: JOB_STATUS.COMPLETED,
        result,
      };
    } catch (error) {
      const processError = toError(error);

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

      // Handle job failure - emits individual job events and batch progress if applicable
      const status = await this.jobQueueService.getStatus(job.id);
      if (status?.status === JOB_STATUS.FAILED) {
        await this.progressMonitor.handleJobStatusChange(
          job.id,
          "failed",
          job.metadata,
        );
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
