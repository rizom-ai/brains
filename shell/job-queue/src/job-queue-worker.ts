import { getErrorMessage, toError } from "@brains/utils/error";
import { createId } from "@brains/utils/id";
import type { Logger } from "@brains/utils/logger";
import type { IJobProgressMonitor } from "@brains/utils/progress";
import { HandlerFailureSchema, type JobResult } from "./schemas";
import {
  DEFAULT_WORKER_SESSION_TIMEOUT_MS,
  type IJobQueueService,
  type JobHandler,
  type JobInfo,
  type JobQueueWorkerConfig,
  type JobQueueWorkerStats,
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
import { OperationContext } from "@brains/operation-context";

export interface JobQueueWorkerRuntimeOptions {
  /** Internal clock boundary used for deterministic polling tests. */
  clock?: Clock.Clock;
  /** Shared app-scoped causal context. */
  operationContext?: OperationContext;
}

class JobDeadlineExceededError extends Error {
  constructor(jobType: string, timeoutMs: number) {
    super(`Job ${jobType} exceeded its ${timeoutMs}ms execution deadline`);
    this.name = "JobDeadlineExceededError";
  }
}

type OperationOutcome<T> =
  { kind: "success"; value: T } | { kind: "failure"; error: unknown };

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
 */
export class JobQueueWorker {
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
  private readonly operationContext: OperationContext;
  private workerSessionId: string | null = null;
  private workerHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private workerHeartbeatInFlight: Promise<void> | null = null;

  public static createFresh(
    jobQueueService: IJobQueueService,
    progressMonitor: IJobProgressMonitor,
    logger: Logger,
    config?: JobQueueWorkerConfig,
    runtimeOptions?: JobQueueWorkerRuntimeOptions,
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
    this.operationContext =
      runtimeOptions?.operationContext ?? OperationContext.createFresh();
    this.config = {
      concurrency: config?.concurrency ?? 1,
      pollInterval: config?.pollInterval ?? 1000,
      maxJobs: config?.maxJobs ?? 0,
      autoStart: config?.autoStart ?? false,
      workerSlotId:
        config?.workerSlotId ??
        process.env["BRAIN_JOB_WORKER_SLOT_ID"] ??
        "default",
      defaultExecutionTimeoutMs: config?.defaultExecutionTimeoutMs ?? 300_000,
      cancellationGraceMs: config?.cancellationGraceMs ?? 5_000,
      errorCallbackTimeoutMs: config?.errorCallbackTimeoutMs ?? 10_000,
      leaseDurationMs: config?.leaseDurationMs ?? 30_000,
      attemptHeartbeatIntervalMs: config?.attemptHeartbeatIntervalMs ?? 10_000,
      workerHeartbeatIntervalMs: config?.workerHeartbeatIntervalMs ?? 5_000,
      workerSessionTimeoutMs:
        config?.workerSessionTimeoutMs ?? DEFAULT_WORKER_SESSION_TIMEOUT_MS,
      onUnhealthy: config?.onUnhealthy ?? ((): void => undefined),
    };

    this.stats = {
      processedJobs: 0,
      failedJobs: 0,
      activeJobs: 0,
      uptime: 0,
      isRunning: false,
      isHealthy: true,
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
    const workerSessionId = createId();
    await this.jobQueueService.startWorkerSession(
      this.config.workerSlotId,
      workerSessionId,
    );
    this.workerSessionId = workerSessionId;
    this.isRunning = true;
    this.shouldStop = false;
    this.startTime = Date.now();
    this.stats.isRunning = true;
    this.stats.isHealthy = true;
    delete this.stats.unhealthyReason;
    this.startWorkerHeartbeat();

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
    await this.stopWorkerHeartbeat();
    const workerSessionId = this.workerSessionId;
    this.workerSessionId = null;
    if (workerSessionId) {
      await this.jobQueueService.endWorkerSession(
        this.config.workerSlotId,
        workerSessionId,
      );
    }
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
        const workerSessionId = this.workerSessionId;
        if (!workerSessionId) {
          throw new Error("Worker session is not available");
        }
        const job = await this.jobQueueService.dequeue({
          workerSlotId: this.config.workerSlotId,
          workerSessionId,
          leaseDurationMs: this.config.leaseDurationMs,
          workerSessionTimeoutMs: this.config.workerSessionTimeoutMs,
        });
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

  private startWorkerHeartbeat(): void {
    this.workerHeartbeatTimer = setInterval(
      () => {
        const workerSessionId = this.workerSessionId;
        if (!workerSessionId || this.workerHeartbeatInFlight) return;

        this.workerHeartbeatInFlight = this.jobQueueService
          .heartbeatWorkerSession(this.config.workerSlotId, workerSessionId)
          .then((current) => {
            if (!current) {
              this.markUnhealthy("Worker session was superseded");
            }
          })
          .catch((error: unknown) => {
            this.markUnhealthy(
              `Worker session heartbeat failed: ${getErrorMessage(error)}`,
            );
          })
          .finally(() => {
            this.workerHeartbeatInFlight = null;
          });
      },
      Math.max(1, this.config.workerHeartbeatIntervalMs),
    );
  }

  private async stopWorkerHeartbeat(): Promise<void> {
    if (this.workerHeartbeatTimer) {
      clearInterval(this.workerHeartbeatTimer);
      this.workerHeartbeatTimer = null;
    }
    await this.workerHeartbeatInFlight;
    this.workerHeartbeatInFlight = null;
  }

  private startAttemptHeartbeat(
    job: JobInfo,
    controller: AbortController,
  ): () => Promise<void> {
    const attemptId = job.attemptId;
    if (!attemptId) return async () => undefined;

    let inFlight: Promise<void> | null = null;
    let stopped = false;
    const timer = setInterval(
      () => {
        if (stopped || inFlight) return;
        inFlight = this.jobQueueService
          .renewAttemptLease(job.id, attemptId, this.config.leaseDurationMs)
          .then((current) => {
            if (current) return;
            const error = new Error("Job attempt was superseded");
            controller.abort(error);
            this.markUnhealthy(error.message);
          })
          .catch((error: unknown) => {
            const heartbeatError = toError(error);
            controller.abort(heartbeatError);
            this.markUnhealthy(
              `Attempt lease heartbeat failed: ${heartbeatError.message}`,
            );
          })
          .finally(() => {
            inFlight = null;
          });
      },
      Math.max(1, this.config.attemptHeartbeatIntervalMs),
    );

    return async (): Promise<void> => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      await inFlight;
    };
  }

  private markUnhealthy(reason: string): void {
    if (!this.stats.isHealthy) return;
    this.stats.isHealthy = false;
    this.stats.unhealthyReason = reason;
    this.stats.lastError = reason;
    this.shouldStop = true;
    this.logger.error("Job queue worker is unhealthy", { reason });
    try {
      this.config.onUnhealthy(reason);
    } catch (error) {
      this.logger.error("Job queue worker unhealthy callback failed", {
        reason,
        error: getErrorMessage(error),
      });
    }
  }

  private async executeWithDeadline<T>(
    jobType: string,
    timeoutMs: number,
    controller: AbortController,
    operation: () => Promise<T>,
  ): Promise<T> {
    const outcome: Promise<OperationOutcome<T>> = Promise.resolve()
      .then(operation)
      .then(
        (value): OperationOutcome<T> => ({ kind: "success", value }),
        (error: unknown): OperationOutcome<T> => ({
          kind: "failure",
          error,
        }),
      );

    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<{ kind: "deadline" }>((resolve) => {
      deadlineTimer = setTimeout(
        () => resolve({ kind: "deadline" }),
        Math.max(1, timeoutMs),
      );
    });
    const first = await Promise.race([outcome, deadline]);
    if (first.kind !== "deadline") {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (first.kind === "failure") throw first.error;
      return first.value;
    }

    const deadlineError = new JobDeadlineExceededError(jobType, timeoutMs);
    controller.abort(deadlineError);

    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    const graceExpired = new Promise<{ kind: "grace-expired" }>((resolve) => {
      graceTimer = setTimeout(
        () => resolve({ kind: "grace-expired" }),
        Math.max(1, this.config.cancellationGraceMs),
      );
    });
    const afterCancellation = await Promise.race([outcome, graceExpired]);
    if (afterCancellation.kind !== "grace-expired") {
      if (graceTimer) clearTimeout(graceTimer);
      throw deadlineError;
    }

    this.markUnhealthy(
      `${deadlineError.message}; handler ignored cancellation grace`,
    );
    // Do not release this capacity or schedule a retry while user code can
    // still mutate state. Process supervision must terminate a handler that
    // never settles.
    await outcome;
    throw deadlineError;
  }

  /** Process a job using its registered handler. */
  private processJob(job: JobInfo): Promise<JobResult> {
    const provenance = job.metadata.provenance ?? {
      rootJobId: job.metadata.rootJobId,
      causationId: job.id,
      projectionLineage: [],
      derivationDepth: 0,
    };
    return this.operationContext.run(provenance, job.id, () =>
      this.processJobWithinContext(job),
    );
  }

  private async processJobWithinContext(job: JobInfo): Promise<JobResult> {
    const attemptId = job.attemptId;
    if (!attemptId) {
      const error = new Error(
        `Claimed job ${job.id} has no attempt fencing token`,
      );
      this.markUnhealthy(error.message);
      return {
        jobId: job.id,
        type: job.type,
        status: JOB_STATUS.FAILED,
        error: error.message,
      };
    }

    const handler = this.jobQueueService.getHandler(job.type);
    if (!handler) {
      const error = new Error(
        `No handler registered for job type: ${job.type}`,
      );
      await this.jobQueueService.fail(job.id, error, attemptId);
      return {
        jobId: job.id,
        type: job.type,
        status: JOB_STATUS.FAILED,
        error: error.message,
      };
    }

    const controller = new AbortController();
    const stopAttemptHeartbeat = this.startAttemptHeartbeat(job, controller);
    let heartbeatStopped = false;
    const stopHeartbeat = async (): Promise<void> => {
      if (heartbeatStopped) return;
      heartbeatStopped = true;
      await stopAttemptHeartbeat();
    };

    try {
      this.logger.debug("Processing job", {
        jobId: job.id,
        type: job.type,
        attemptId,
      });

      const rawData = JSON.parse(job.data);
      const parsedData = handler.validateAndParse(rawData);
      if (parsedData === null) {
        throw new Error(`Invalid job data for type: ${job.type}`);
      }

      const progressReporter = this.progressMonitor.createProgressReporter(
        job.id,
        attemptId,
      );
      const timeoutMs =
        handler.executionTimeoutMs ?? this.config.defaultExecutionTimeoutMs;
      const result = await this.executeWithDeadline(
        job.type,
        timeoutMs,
        controller,
        () =>
          handler.process(
            parsedData,
            job.id,
            progressReporter,
            controller.signal,
          ),
      );

      await stopHeartbeat();
      const failure = HandlerFailureSchema.safeParse(result);
      if (failure.success) {
        const errorMessage = failure.data.error ?? "Handler returned failure";
        const processError = new Error(errorMessage);
        const applied = await this.jobQueueService.fail(
          job.id,
          processError,
          attemptId,
        );
        if (applied) {
          await this.emitTerminalFailure(job, processError, handler, attemptId);
        }
        return {
          jobId: job.id,
          type: job.type,
          status: JOB_STATUS.FAILED,
          error: errorMessage,
        };
      }

      const applied = await this.jobQueueService.complete(
        job.id,
        result,
        attemptId,
      );
      if (!applied) {
        return {
          jobId: job.id,
          type: job.type,
          status: JOB_STATUS.FAILED,
          error: "Job attempt no longer owns the claim",
        };
      }

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
      await stopHeartbeat();

      try {
        const rawData = JSON.parse(job.data);
        const parsedData = handler.validateAndParse(rawData);
        if (parsedData !== null && handler.onError) {
          const progressReporter = this.progressMonitor.createProgressReporter(
            job.id,
            attemptId,
          );
          const errorController = new AbortController();
          await this.executeWithDeadline(
            `${job.type}:onError`,
            this.config.errorCallbackTimeoutMs,
            errorController,
            () =>
              handler.onError?.(
                processError,
                parsedData,
                job.id,
                progressReporter,
                errorController.signal,
              ) ?? Promise.resolve(),
          );
        }
      } catch (callbackError) {
        this.logger.error("Job handler error callback failed", {
          jobId: job.id,
          error: callbackError,
        });
      }

      const applied = await this.jobQueueService.fail(
        job.id,
        processError,
        attemptId,
      );
      if (applied) {
        await this.emitTerminalFailure(job, processError, handler, attemptId);
      }

      return {
        jobId: job.id,
        type: job.type,
        status: JOB_STATUS.FAILED,
        error: processError.message,
      };
    }
  }

  private async emitTerminalFailure(
    job: JobInfo,
    error: Error,
    handler: JobHandler,
    attemptId: string,
  ): Promise<void> {
    const status = await this.jobQueueService.getStatus(job.id);
    if (status?.status !== JOB_STATUS.FAILED) return;

    if (handler.onTerminalError) {
      try {
        const parsedData = handler.validateAndParse(JSON.parse(job.data));
        if (parsedData !== null) {
          const progressReporter = this.progressMonitor.createProgressReporter(
            job.id,
            attemptId,
          );
          const terminalController = new AbortController();
          await this.executeWithDeadline(
            `${job.type}:onTerminalError`,
            this.config.errorCallbackTimeoutMs,
            terminalController,
            () =>
              handler.onTerminalError?.(
                error,
                parsedData,
                job.id,
                progressReporter,
                terminalController.signal,
              ) ?? Promise.resolve(),
          );
        }
      } catch (callbackError) {
        this.logger.error("Job handler terminal error callback failed", {
          jobId: job.id,
          error: callbackError,
        });
      }
    }

    await this.progressMonitor.handleJobStatusChange(
      job.id,
      "failed",
      job.metadata,
    );
  }
}
