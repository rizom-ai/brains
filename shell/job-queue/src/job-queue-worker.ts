import { getErrorMessage, toError } from "@brains/utils/error";
import { createId } from "@brains/utils/id";
import type { Logger } from "@brains/utils/logger";
import type {
  IJobProgressMonitor,
  ProgressReporter,
} from "@brains/utils/progress";
import { HandlerFailureSchema, type JobResult } from "./schemas";
import {
  DEFAULT_WORKER_SESSION_TIMEOUT_MS,
  DEFAULT_WORKER_SHUTDOWN_DRAIN_MS,
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
  withOptionalClock,
} from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";
import { OperationContext } from "@brains/operation-context";
import {
  createRenewableDeadline,
  renewOnAdvance,
  type RenewableDeadline,
} from "./progress-deadline";

/**
 * Anything that can force its own ambient async context to empty for the
 * duration of a callback. Jobs are dispatched as Effect fibers, which have
 * no relationship to Node's AsyncLocalStorage tracking, so a job handler's
 * ambient context (e.g. entity-service's projection-batch scope) can appear
 * to carry over from an unrelated, previously-processed job. The worker
 * resets every registered scope before running each job so that can't
 * happen; see ProjectionBatchCoordinator.runFreshBatchScope for the concrete
 * case this exists for.
 */
export interface ResettableAmbientScope {
  runFreshBatchScope<T>(fn: () => T): T;
}

export interface JobQueueWorkerRuntimeOptions {
  /** Internal clock boundary used for deterministic polling tests. */
  clock?: Clock.Clock;
  /** Shared app-scoped causal context. */
  operationContext?: OperationContext;
  /** Ambient async context(s) to reset to empty before each job runs. */
  projectionBatchScope?: ResettableAmbientScope;
}

class JobDeadlineExceededError extends Error {
  constructor(jobType: string, timeoutMs: number) {
    super(`Job ${jobType} exceeded its ${timeoutMs}ms execution deadline`);
    this.name = "JobDeadlineExceededError";
  }
}

/**
 * The reason a stopping worker aborts the jobs still running at its drain
 * deadline. A job that settles with it goes back to the queue untouched.
 */
class WorkerShutdownError extends Error {
  constructor() {
    super("The worker stopped before the job finished");
    this.name = "WorkerShutdownError";
  }
}

/** How long interrupted jobs get to settle before the worker stops anyway. */
const SHUTDOWN_INTERRUPT_GRACE_MS = 1_000;

/** A job's run: its result, or handed back to the queue at shutdown. */
type ProcessOutcome =
  JobResult | { jobId: string; type: string; status: "released" };

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
  /** Each running job's cancellation, for interrupting it at shutdown. */
  private readonly jobControllers = new Map<string, AbortController>();
  private stats: JobQueueWorkerStats;
  private startTime: number = 0;
  private pollFiber: Fiber.Fiber<void, never> | null = null;
  private currentPoll: Promise<void> | null = null;
  private workerScope: Scope.Closeable | null = null;
  private jobFibers: FiberMap.FiberMap<string, void, never> | null = null;
  private activeTransition: WorkerTransition | null = null;
  private readonly transitionQueue: WorkerTransition[] = [];
  private readonly clock: Clock.Clock | undefined;
  private readonly operationContext: OperationContext;
  private readonly projectionBatchScope: ResettableAmbientScope | undefined;
  private workerSessionId: string | null = null;
  private workerHeartbeatStop: (() => Promise<void>) | null = null;

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
    this.projectionBatchScope = runtimeOptions?.projectionBatchScope;
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
      shutdownDrainMs:
        config?.shutdownDrainMs ?? DEFAULT_WORKER_SHUTDOWN_DRAIN_MS,
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
      this.config.workerSessionTimeoutMs,
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
      Scope.provide(FiberMap.make<string, void, never>(), this.workerScope),
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

    // The in-flight poll is settled, so no more fibers can be added.
    const drained = this.jobFibers
      ? await this.drainJobs(this.jobFibers)
      : true;

    await this.closeWorkerScope();
    await this.stopWorkerHeartbeat();
    const workerSessionId = this.workerSessionId;
    this.workerSessionId = null;
    // A job that ignored its interruption may still be running in this
    // process. Its session stays until it expires, so no other worker claims
    // the job before this process is gone.
    if (workerSessionId && drained) {
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
   * Wait for the running jobs until the drain deadline, then interrupt those
   * left and give them a moment to settle. False when one is still running.
   */
  private async drainJobs(
    jobFibers: FiberMap.FiberMap<string, void, never>,
  ): Promise<boolean> {
    this.logger.debug("Waiting for active jobs to complete", {
      activeJobs: this.activeJobs.size,
    });
    const empty = Effect.runPromise(FiberMap.awaitEmpty(jobFibers)).then(
      (): OperationOutcome<void> => ({ kind: "success", value: undefined }),
    );
    if (
      (await this.raceOutcome(empty, this.config.shutdownDrainMs)).kind !==
      "timeout"
    ) {
      return true;
    }

    const running = [...this.jobControllers.keys()];
    this.logger.warn(
      `Job drain passed ${this.config.shutdownDrainMs}ms with ${running.length} job(s) running; interrupting them`,
      { jobIds: running },
    );
    const reason = new WorkerShutdownError();
    for (const controller of this.jobControllers.values()) {
      controller.abort(reason);
    }
    if (
      (await this.raceOutcome(empty, SHUTDOWN_INTERRUPT_GRACE_MS)).kind !==
      "timeout"
    ) {
      return true;
    }

    this.logger.warn(
      `${this.activeJobs.size} job(s) ignored the interruption; they are reclaimed once this worker's session lapses`,
      { jobIds: [...this.activeJobs] },
    );
    return false;
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

      // Establish supervision before acquiring any durable attempt ownership.
      const jobFibers = this.jobFibers;
      if (!jobFibers) {
        throw new Error("Worker job fiber scope is not available");
      }

      // Hand off each claim before requesting another. A later dequeue can
      // fail or stall; it must not strand an earlier claim without a heartbeat.
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
          onTerminalReclaim: (failed) => this.emitTerminalReclaim(failed),
        });
        if (!job) break;

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

      if (result.status === "released") {
        this.logger.debug("Job returned to the queue at shutdown", {
          jobId,
          type: result.type,
        });
      } else if (result.status === "completed") {
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
    const loop = withOptionalClock(scheduledPolling, this.clock);

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
   * Start a guarded heartbeat interval: at most one beat in flight, a false
   * beat reports staleness, and the returned stop function awaits the last
   * in-flight beat.
   */
  private startHeartbeatLoop(options: {
    intervalMs: number;
    beat: () => Promise<boolean>;
    onStale: () => void;
    onError: (error: unknown) => void;
  }): () => Promise<void> {
    let inFlight: Promise<void> | null = null;
    let stopped = false;
    const timer = setInterval(
      () => {
        if (stopped || inFlight) return;
        inFlight = options
          .beat()
          .then((current) => {
            if (!current) options.onStale();
          })
          .catch(options.onError)
          .finally(() => {
            inFlight = null;
          });
      },
      Math.max(1, options.intervalMs),
    );

    return async (): Promise<void> => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      await inFlight;
    };
  }

  private startWorkerHeartbeat(): void {
    this.workerHeartbeatStop = this.startHeartbeatLoop({
      intervalMs: this.config.workerHeartbeatIntervalMs,
      beat: async (): Promise<boolean> => {
        const workerSessionId = this.workerSessionId;
        if (!workerSessionId) return true;
        return this.jobQueueService.heartbeatWorkerSession(
          this.config.workerSlotId,
          workerSessionId,
          this.config.workerSessionTimeoutMs,
        );
      },
      onStale: () => this.markUnhealthy("Worker session was superseded"),
      onError: (error) =>
        this.markUnhealthy(
          `Worker session heartbeat failed: ${getErrorMessage(error)}`,
        ),
    });
  }

  private async stopWorkerHeartbeat(): Promise<void> {
    await this.workerHeartbeatStop?.();
    this.workerHeartbeatStop = null;
  }

  private startAttemptHeartbeat(
    job: JobInfo,
    controller: AbortController,
  ): () => Promise<void> {
    const attemptId = job.attemptId;
    if (!attemptId) return async () => undefined;

    return this.startHeartbeatLoop({
      intervalMs: this.config.attemptHeartbeatIntervalMs,
      beat: () =>
        this.jobQueueService.renewAttemptLease(
          job.id,
          attemptId,
          this.config.leaseDurationMs,
        ),
      onStale: () => {
        const error = new Error("Job attempt was superseded");
        controller.abort(error);
        this.markUnhealthy(error.message);
      },
      onError: (error) => {
        const heartbeatError = toError(error);
        controller.abort(heartbeatError);
        this.markUnhealthy(
          `Attempt lease heartbeat failed: ${heartbeatError.message}`,
        );
      },
    });
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

  private async raceOutcome<T>(
    outcome: Promise<OperationOutcome<T>>,
    timeoutMs: number,
  ): Promise<OperationOutcome<T> | { kind: "timeout" }> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<{ kind: "timeout" }>((resolve) => {
      timer = setTimeout(
        () => resolve({ kind: "timeout" }),
        Math.max(1, timeoutMs),
      );
    });
    try {
      return await Promise.race([outcome, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Run `operation` until it settles or its deadline passes. A renewable
   * deadline is pushed back by the job's progress, so it catches a stuck job
   * rather than a long one.
   */
  private async executeWithDeadline<T>(
    jobType: string,
    timeoutMs: number,
    controller: AbortController,
    operation: () => Promise<T>,
    deadline: RenewableDeadline = createRenewableDeadline(timeoutMs),
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

    const first = await Promise.race([outcome, deadline.expired]).finally(() =>
      deadline.cancel(),
    );
    if (first.kind !== "timeout") {
      if (first.kind === "failure") throw first.error;
      return first.value;
    }

    const deadlineError = new JobDeadlineExceededError(jobType, timeoutMs);
    controller.abort(deadlineError);

    const afterCancellation = await this.raceOutcome(
      outcome,
      this.config.cancellationGraceMs,
    );
    if (afterCancellation.kind !== "timeout") {
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
  private processJob(job: JobInfo): Promise<ProcessOutcome> {
    const provenance = job.metadata.provenance ?? {
      rootJobId: job.metadata.rootJobId,
      causationId: job.id,
      projectionLineage: [],
      derivationDepth: 0,
    };
    return this.operationContext.run(provenance, job.id, () => {
      const scope = this.projectionBatchScope;
      return scope
        ? scope.runFreshBatchScope(() => this.processJobWithinContext(job))
        : this.processJobWithinContext(job);
    });
  }

  private async processJobWithinContext(job: JobInfo): Promise<ProcessOutcome> {
    const attemptId = job.attemptId;
    if (!attemptId) {
      const error = new Error(
        `Claimed job ${job.id} has no attempt fencing token`,
      );
      this.markUnhealthy(error.message);
      return this.failed(job, error.message);
    }

    const handler = this.jobQueueService.getHandler(job.type);
    if (!handler) {
      const error = new Error(
        `No handler registered for job type: ${job.type}`,
      );
      await this.jobQueueService.fail(job.id, error, attemptId);
      return this.failed(job, error.message);
    }

    return this.runAttempt(job, handler, attemptId);
  }

  /**
   * Run a claimed attempt under its own cancellation and lease heartbeat,
   * then settle what the handler returned or threw.
   */
  private async runAttempt(
    job: JobInfo,
    handler: JobHandler,
    attemptId: string,
  ): Promise<ProcessOutcome> {
    const controller = new AbortController();
    this.jobControllers.set(job.id, controller);
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
      const result = await this.executeHandler(
        job,
        handler,
        attemptId,
        controller,
      );
      await stopHeartbeat();
      return await this.settleReturned(
        job,
        handler,
        attemptId,
        controller,
        result,
      );
    } catch (error) {
      const processError = toError(error);
      await stopHeartbeat();
      return await this.settleThrown(
        job,
        handler,
        attemptId,
        controller,
        processError,
      );
    } finally {
      this.jobControllers.delete(job.id);
    }
  }

  /** Parse the job's data and run its handler under the job deadline. */
  private executeHandler(
    job: JobInfo,
    handler: JobHandler,
    attemptId: string,
    controller: AbortController,
  ): Promise<unknown> {
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
    const deadline = createRenewableDeadline(timeoutMs);
    return this.executeWithDeadline(
      job.type,
      timeoutMs,
      controller,
      () =>
        handler.process(
          parsedData,
          job.id,
          renewOnAdvance(progressReporter, deadline.renew),
          controller.signal,
        ),
      deadline,
    );
  }

  /** Settle a handler's return value: a failure result fails the job. */
  private async settleReturned(
    job: JobInfo,
    handler: JobHandler,
    attemptId: string,
    controller: AbortController,
    result: unknown,
  ): Promise<ProcessOutcome> {
    const failure = HandlerFailureSchema.safeParse(result);
    // A handler that answers the interruption with a failure result goes
    // back to the queue, as one that throws does. One that still succeeds
    // completes: its effects are committed.
    if (failure.success && this.interruptedAtShutdown(job, controller)) {
      return this.releaseInterrupted(job, attemptId);
    }
    if (!failure.success) {
      return this.completeAttempt(job, handler, attemptId, result);
    }

    // Unlike a thrown error, a returned failure does not run onError.
    const errorMessage = failure.data.error ?? "Handler returned failure";
    await this.settleFailure(job, new Error(errorMessage), handler, attemptId);
    return this.failed(job, errorMessage);
  }

  /** Persist the completion, then run the success callback and report it. */
  private async completeAttempt(
    job: JobInfo,
    handler: JobHandler,
    attemptId: string,
    result: unknown,
  ): Promise<ProcessOutcome> {
    const applied = await this.jobQueueService.complete(
      job.id,
      result,
      attemptId,
    );
    if (!applied) {
      return this.failed(job, "Job attempt no longer owns the claim");
    }

    await this.runHandlerSuccessCallback(handler, job, attemptId);
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
  }

  /** Settle an attempt that threw, after running the handler's onError. */
  private async settleThrown(
    job: JobInfo,
    handler: JobHandler,
    attemptId: string,
    controller: AbortController,
    error: Error,
  ): Promise<ProcessOutcome> {
    // Interrupted by the stopping worker.
    if (this.interruptedAtShutdown(job, controller)) {
      return this.releaseInterrupted(job, attemptId);
    }

    await this.runHandlerErrorCallback(
      "onError",
      handler,
      job,
      error,
      attemptId,
    );
    await this.settleFailure(job, error, handler, attemptId);
    return this.failed(job, error.message);
  }

  /** Fail the attempt; when the write applies, emit any terminal failure. */
  private async settleFailure(
    job: JobInfo,
    error: Error,
    handler: JobHandler,
    attemptId: string,
  ): Promise<void> {
    const applied = await this.jobQueueService.fail(job.id, error, attemptId);
    if (applied) {
      await this.emitTerminalFailure(job, error, handler, attemptId);
    }
  }

  private failed(job: JobInfo, error: string): JobResult {
    return { jobId: job.id, type: job.type, status: JOB_STATUS.FAILED, error };
  }

  /**
   * Stopped by the worker's drain deadline, for a job that may run again. A
   * job enqueued without retries runs at most once, so it fails as it would
   * when its worker dies.
   */
  private interruptedAtShutdown(
    job: JobInfo,
    controller: AbortController,
  ): boolean {
    return (
      job.maxRetries > 0 &&
      controller.signal.reason instanceof WorkerShutdownError
    );
  }

  /** No failure callbacks and no retry spent: the next worker runs it again. */
  private async releaseInterrupted(
    job: JobInfo,
    attemptId: string,
  ): Promise<ProcessOutcome> {
    await this.jobQueueService.release(job.id, attemptId);
    return { jobId: job.id, type: job.type, status: "released" };
  }

  private async runHandlerSuccessCallback(
    handler: JobHandler,
    job: JobInfo,
    attemptId: string,
  ): Promise<void> {
    const callback = handler.onTerminalSuccess;
    if (!callback) return;
    await this.runCallback(
      "onTerminalSuccess",
      handler,
      job,
      attemptId,
      (data, progressReporter, signal) =>
        callback.call(handler, data, job.id, progressReporter, signal),
      (error) =>
        this.logger.error("Terminal job success callback failed", {
          jobId: job.id,
          type: job.type,
          error,
        }),
    );
  }

  private async emitTerminalFailure(
    job: JobInfo,
    error: Error,
    handler: JobHandler,
    attemptId: string,
  ): Promise<void> {
    const status = await this.jobQueueService.getStatus(job.id);
    if (status?.status !== JOB_STATUS.FAILED) return;

    await this.runHandlerErrorCallback(
      "onTerminalError",
      handler,
      job,
      error,
      attemptId,
    );

    await this.progressMonitor.handleJobStatusChange(
      job.id,
      "failed",
      job.metadata,
    );
  }

  /**
   * A claim failed an expired attempt terminally: the attempt's process died
   * before its handler settled, so no handler callback has run for it yet.
   */
  private async emitTerminalReclaim(job: JobInfo): Promise<void> {
    const handler = this.jobQueueService.getHandler(job.type);
    if (handler) {
      await this.runHandlerErrorCallback(
        "onTerminalError",
        handler,
        job,
        new Error(job.lastError ?? "Attempt lease expired"),
        job.attemptId ?? job.id,
      );
    }
    await this.progressMonitor.handleJobStatusChange(
      job.id,
      "failed",
      job.metadata,
    );
  }

  /** Run a handler's failure callback under the callback deadline, logging errors. */
  private async runHandlerErrorCallback(
    kind: "onError" | "onTerminalError",
    handler: JobHandler,
    job: JobInfo,
    error: Error,
    attemptId: string,
  ): Promise<void> {
    const callback = handler[kind];
    if (!callback) return;
    await this.runCallback(
      kind,
      handler,
      job,
      attemptId,
      (data, progressReporter, signal) =>
        callback.call(handler, error, data, job.id, progressReporter, signal),
      (callbackError) =>
        this.logger.error(
          kind === "onError"
            ? "Job handler error callback failed"
            : "Job handler terminal error callback failed",
          { jobId: job.id, error: callbackError },
        ),
    );
  }

  /**
   * Run a handler callback on the job's parsed data under the callback
   * deadline. Data that no longer parses skips it; a failure is logged.
   */
  private async runCallback(
    label: string,
    handler: JobHandler,
    job: JobInfo,
    attemptId: string,
    invoke: (
      data: unknown,
      progressReporter: ProgressReporter,
      signal: AbortSignal,
    ) => Promise<void>,
    logFailure: (error: unknown) => void,
  ): Promise<void> {
    try {
      const parsedData = handler.validateAndParse(JSON.parse(job.data));
      if (parsedData === null) return;
      const progressReporter = this.progressMonitor.createProgressReporter(
        job.id,
        attemptId,
      );
      const controller = new AbortController();
      await this.executeWithDeadline(
        `${job.type}:${label}`,
        this.config.errorCallbackTimeoutMs,
        controller,
        () => invoke(parsedData, progressReporter, controller.signal),
      );
    } catch (error) {
      logFailure(error);
    }
  }
}
