import type { JobQueue } from "./schema/job-queue";
import type { JobContextInput } from "./schema/types";
import { createId } from "@brains/utils/id";
import { Logger } from "@brains/utils/logger";
import { DEFAULT_WORKER_SESSION_TIMEOUT_MS } from "./types";
import type {
  IJobQueueService,
  JobClaimOptions,
  JobExecutionRegistration,
  JobHandler,
  JobHandlerRegistrationMode,
  JobInfo,
  JobQueueDiagnostics,
  JobQueueIdleOptions,
  JobQueueEnqueueRequest,
  JobQueueServiceConfig,
  JobQueueStats,
  JobRuntimeUpdate,
  JobRuntimeUpdateCursor,
  JobValidator,
} from "./types";
import { JOB_STATUS } from "./schemas";
import { applySqlitePragmas } from "@brains/db";
import { createJobQueueDatabase } from "./db";
import type { Client } from "@libsql/client";
import { HandlerRegistry } from "./handler-registry";
import { JobQueueRepository, type AtomicJobData } from "./job-queue-repository";
import { getErrorMessage } from "@brains/utils/error";
import {
  OperationProvenanceSchema,
  type OperationProvenance,
} from "@brains/contracts";
import { OperationContext } from "@brains/operation-context";
import type { ProgressNotification } from "@brains/utils/progress";

export interface ProjectionJobAdmissionReservation {
  commit(): void;
  rollback(): void;
}

export interface ProjectionJobAdmission {
  reserveJobAdmission(
    provenance: OperationProvenance,
  ): Promise<ProjectionJobAdmissionReservation>;
}

export interface JobQueueServiceRuntimeOptions {
  operationContext?: OperationContext | undefined;
  projectionAdmission?: ProjectionJobAdmission | undefined;
  handlerRegistrationMode?: JobHandlerRegistrationMode | undefined;
}

/**
 * Service for managing the generic job queue
 * Refactored to use separate classes for specific responsibilities
 */
export class JobQueueService implements IJobQueueService {
  private client: Client;
  private logger: Logger;

  private handlerRegistry: HandlerRegistry;
  private repository: JobQueueRepository;
  private walInitialization: Promise<void> | null = null;
  private walInitializationSettled = false;
  private closeRequested = false;
  private clientClosed = false;
  private inFlightEnqueues = 0;
  private readonly databaseUrl: string;
  private readonly operationContext: OperationContext;
  private readonly projectionAdmission: ProjectionJobAdmission | undefined;
  private readonly directWorkerSlotId = `direct:${createId()}`;
  private readonly directWorkerSessionId = createId();
  private readonly directLeaseDurationMs: number;
  private directSessionStart: Promise<void> | null = null;

  /**
   * Close the underlying database connection.
   */
  public close(): void {
    this.closeRequested = true;
    this.closeClientWhenReady();
  }

  public static createFresh(
    config: JobQueueServiceConfig,
    logger?: Logger,
    runtimeOptions?: JobQueueServiceRuntimeOptions,
  ): JobQueueService {
    return new JobQueueService(
      config,
      logger ?? Logger.getInstance(),
      runtimeOptions,
    );
  }

  private constructor(
    config: JobQueueServiceConfig,
    logger: Logger,
    runtimeOptions?: JobQueueServiceRuntimeOptions,
  ) {
    const { db, client, url } = createJobQueueDatabase(config);
    this.client = client;
    this.databaseUrl = url;
    this.logger = logger.child("JobQueueService");
    this.operationContext =
      runtimeOptions?.operationContext ?? OperationContext.createFresh();
    this.projectionAdmission = runtimeOptions?.projectionAdmission;

    this.handlerRegistry = new HandlerRegistry(
      this.logger,
      runtimeOptions?.handlerRegistrationMode ?? "combined",
    );
    this.repository = new JobQueueRepository(db, client, url, this.logger);
    this.directLeaseDurationMs = config.claimTimeoutMs ?? 300_000;
  }

  /** Settle non-fatal database readiness work before the shell becomes ready. */
  public initialize(): Promise<void> {
    if (this.closeRequested) return Promise.resolve();
    this.walInitialization ??= this.initializeWALMode();
    return this.walInitialization;
  }

  private async initializeWALMode(): Promise<void> {
    try {
      await applySqlitePragmas(this.client, this.databaseUrl);
    } catch (error) {
      this.logger.warn("Failed to enable WAL mode (non-fatal)", error);
    } finally {
      this.walInitializationSettled = true;
      this.closeClientWhenReady();
    }
  }

  private closeClientWhenReady(): void {
    if (
      !this.closeRequested ||
      this.inFlightEnqueues > 0 ||
      (this.walInitialization !== null && !this.walInitializationSettled)
    ) {
      return;
    }
    this.closeClient();
  }

  private closeClient(): void {
    if (this.clientClosed) return;
    this.clientClosed = true;
    this.client.close();
  }

  /**
   * Register a job handler for a specific type
   */
  public registerHandler(
    type: string,
    handler: JobHandler,
    pluginId?: string,
  ): void {
    this.handlerRegistry.registerHandler(type, handler, pluginId);
  }

  /**
   * Unregister a job handler
   */
  public unregisterHandler(type: string): void {
    this.handlerRegistry.unregisterHandler(type);
  }

  /**
   * Unregister all handlers for a plugin
   */
  public unregisterPluginHandlers(pluginId: string): void {
    this.handlerRegistry.unregisterPluginHandlers(pluginId);
  }

  /**
   * Get all registered job types
   */
  public getRegisteredTypes(): string[] {
    return this.handlerRegistry.getRegisteredTypes();
  }

  /**
   * Get a handler for a specific job type
   */
  public getHandler(type: string): JobHandler | undefined {
    return this.handlerRegistry.getHandler(type);
  }

  public getValidator(type: string): JobValidator | undefined {
    return this.handlerRegistry.getValidator(type);
  }

  public finalizeHandlerRegistrations(): readonly JobExecutionRegistration[] {
    return this.handlerRegistry.finalizeRegistrations();
  }

  public getExecutionRegistrations(): readonly JobExecutionRegistration[] {
    return this.handlerRegistry.getExecutionRegistrations();
  }

  /**
   * Enqueue a job for processing
   */
  public async enqueue(request: JobQueueEnqueueRequest): Promise<string> {
    if (this.closeRequested) {
      throw new Error("Cannot enqueue a job after the queue service is closed");
    }

    this.inFlightEnqueues++;
    try {
      return await this.enqueueValidated(request);
    } finally {
      this.inFlightEnqueues--;
      this.closeClientWhenReady();
    }
  }

  private async enqueueValidated(
    request: JobQueueEnqueueRequest,
  ): Promise<string> {
    const { type, data, options } = request;
    const validator = this.handlerRegistry.getValidator(type);
    if (!validator) {
      throw new Error(`No job type declared: ${type}`);
    }

    const parsedData = validator.validateAndParse(data);
    if (parsedData === null) {
      throw new Error(`Invalid job data for type: ${type}`);
    }

    const now = Date.now();
    const id = createId();
    const rootJobId =
      options?.rootJobId ??
      this.operationContext.current()?.provenance.rootJobId ??
      id;
    const provenance = this.createJobProvenance(id, rootJobId, options);
    const metadataInput: JobContextInput = options?.metadata ?? {
      operationType: "data_processing",
    };
    const { provenance: _providedProvenance, ...providedMetadata } =
      metadataInput;

    const jobData: AtomicJobData = {
      id,
      type,
      data: JSON.stringify(parsedData),
      status: JOB_STATUS.PENDING,
      priority: options?.priority ?? 0,
      maxRetries: options?.maxRetries ?? 3,
      retryCount: 0,
      source: options?.source ?? null,
      metadata: {
        ...providedMetadata,
        ...(options?.deduplicationKey && {
          deduplicationKey: options.deduplicationKey,
        }),
        rootJobId,
        provenance,
      },
      createdAt: now,
      scheduledFor: options?.delayMs ? now + options.delayMs : now,
      result: null,
      lastError: null,
      startedAt: null,
      completedAt: null,
    };

    let admissionReservation: ProjectionJobAdmissionReservation | undefined;
    const rollbackAdmissionReservation = (): void => {
      admissionReservation?.rollback();
      admissionReservation = undefined;
    };

    try {
      const decision = await this.repository.enqueueAtomic({
        jobData,
        strategy: options?.deduplication,
        deduplicationKey: options?.deduplicationKey,
        beforeInsert: async () => {
          admissionReservation =
            await this.projectionAdmission?.reserveJobAdmission(provenance);
        },
        onInsertRollback: rollbackAdmissionReservation,
      });
      admissionReservation?.commit();
      admissionReservation = undefined;

      if (decision.kind === "skipped") {
        this.logger.debug("Skipping duplicate job (already pending)", {
          type,
          existingJobId: decision.jobId,
        });
      } else if (decision.kind === "coalesced") {
        this.logger.debug("Coalescing with existing job", {
          type,
          existingJobId: decision.jobId,
        });
      } else {
        if (decision.kind === "replaced") {
          this.logger.debug("Replacing duplicate job", {
            type,
            oldJobId: decision.replacedJobId,
          });
        }
        this.logger.debug("Job enqueued", {
          id: decision.jobId,
          type,
          priority: jobData.priority,
          rootJobId: jobData.metadata.rootJobId,
        });
      }

      return decision.jobId;
    } catch (error) {
      rollbackAdmissionReservation();
      this.logger.error("Failed to enqueue job", {
        type,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  private createJobProvenance(
    jobId: string,
    rootJobId: string,
    options: JobQueueEnqueueRequest["options"],
  ): OperationProvenance {
    const current = this.operationContext.current();
    const inheritedCandidate =
      options?.metadata.provenance ?? current?.provenance;
    const inherited =
      inheritedCandidate?.rootJobId === rootJobId
        ? inheritedCandidate
        : undefined;
    const currentOperationId =
      current?.provenance.rootJobId === rootJobId
        ? current.operationId
        : undefined;
    const projection = options?.projection;
    const projectionLineage = projection
      ? [...(inherited?.projectionLineage ?? []), projection.id]
      : [...(inherited?.projectionLineage ?? [])];
    const projectionId = projection?.id ?? inherited?.projectionId;

    return OperationProvenanceSchema.parse({
      rootJobId,
      causationId: currentOperationId ?? inherited?.causationId ?? jobId,
      ...(projectionId ? { projectionId } : {}),
      projectionLineage,
      ...(projection?.sourceEntity
        ? { sourceEntity: projection.sourceEntity }
        : inherited?.sourceEntity
          ? { sourceEntity: inherited.sourceEntity }
          : {}),
      derivationDepth: projectionLineage.length,
    });
  }

  /**
   * Dequeue the next executable job. Workers provide explicit ownership;
   * direct administrative callers receive one service-local fallback session.
   * Jobs without a local execution handler remain pending.
   */
  public async dequeue(claim?: JobClaimOptions): Promise<JobQueue | null> {
    const executableTypes = this.handlerRegistry.getRegisteredTypes();
    if (executableTypes.length === 0) return null;

    const ownership = claim ?? (await this.getDirectClaimOptions());
    const now = Date.now();
    const job = await this.repository.claimNextReady({
      ...ownership,
      now,
      attemptId: createId(),
      executableTypes,
    });
    if (!job) return null;

    this.logger.debug("Job dequeued", {
      id: job.id,
      type: job.type,
      priority: job.priority,
      retryCount: job.retryCount,
      attemptId: job.attemptId,
      workerSlotId: job.workerSlotId,
      workerSessionId: job.workerSessionId,
    });

    return job;
  }

  public async startWorkerSession(
    workerSlotId: string,
    workerSessionId: string,
    workerSessionTimeoutMs: number = DEFAULT_WORKER_SESSION_TIMEOUT_MS,
  ): Promise<void> {
    await this.repository.startWorkerSession(
      workerSlotId,
      workerSessionId,
      Date.now(),
      workerSessionTimeoutMs,
    );
  }

  public heartbeatWorkerSession(
    workerSlotId: string,
    workerSessionId: string,
    workerSessionTimeoutMs: number = DEFAULT_WORKER_SESSION_TIMEOUT_MS,
  ): Promise<boolean> {
    return this.repository.heartbeatWorkerSession(
      workerSlotId,
      workerSessionId,
      Date.now(),
      workerSessionTimeoutMs,
    );
  }

  public endWorkerSession(
    workerSlotId: string,
    workerSessionId: string,
  ): Promise<boolean> {
    return this.repository.endWorkerSession(workerSlotId, workerSessionId);
  }

  public renewAttemptLease(
    jobId: string,
    attemptId: string,
    leaseDurationMs: number,
  ): Promise<boolean> {
    return this.repository.renewAttemptLease(
      jobId,
      attemptId,
      Date.now(),
      leaseDurationMs,
    );
  }

  public recordAttemptProgress(
    jobId: string,
    attemptId: string,
    progress: ProgressNotification,
  ): Promise<boolean> {
    return this.repository.recordAttemptProgress(jobId, attemptId, progress);
  }

  /** Mark a job as completed. */
  public complete(
    jobId: string,
    result: unknown,
    attemptId?: string,
  ): Promise<boolean> {
    return this.repository.complete(jobId, result, attemptId);
  }

  /** Update job data (for progress tracking). */
  public update(
    jobId: string,
    data: unknown,
    attemptId?: string,
  ): Promise<boolean> {
    return this.repository.update(jobId, data, attemptId);
  }

  /** Mark a job as failed. */
  public fail(
    jobId: string,
    error: Error,
    attemptId?: string,
  ): Promise<boolean> {
    return this.repository.fail(jobId, error, attemptId);
  }

  private async getDirectClaimOptions(): Promise<JobClaimOptions> {
    this.directSessionStart ??= this.repository.startWorkerSession(
      this.directWorkerSlotId,
      this.directWorkerSessionId,
      Date.now(),
      this.directLeaseDurationMs,
    );
    await this.directSessionStart;
    return {
      workerSlotId: this.directWorkerSlotId,
      workerSessionId: this.directWorkerSessionId,
      leaseDurationMs: this.directLeaseDurationMs,
    };
  }

  /**
   * Get job status by ID
   */
  public async getStatus(jobId: string): Promise<JobInfo | null> {
    return this.repository.getStatus(jobId);
  }

  public async getJobsByRootJobId(rootJobId: string): Promise<JobInfo[]> {
    return this.repository.getJobsByRootJobId(rootJobId);
  }

  public async getStatusByEntityId(entityId: string): Promise<JobInfo | null> {
    return this.repository.getStatusByEntityId(entityId);
  }

  /**
   * Get job queue statistics
   */
  public async getStats(): Promise<JobQueueStats> {
    return this.repository.getStats();
  }

  public getDiagnostics(now?: number): Promise<JobQueueDiagnostics> {
    return this.repository.getDiagnostics(now);
  }

  /**
   * Resolve once no work is pending or processing and none has arrived for
   * `quietMs`. Completing a job can enqueue the next one, so a momentarily
   * empty queue is not a finished queue; the quiet window is what separates
   * the two. The durable rows are the source of truth because other processes
   * enqueue too, so this samples rather than listens.
   */
  public async waitForIdle(options: JobQueueIdleOptions = {}): Promise<void> {
    const quietMs = options.quietMs ?? 250;
    const pollIntervalMs = options.pollIntervalMs ?? 25;
    const deadline = Date.now() + (options.timeoutMs ?? 30_000);

    const settle = async (quietSince: number | null): Promise<void> => {
      options.signal?.throwIfAborted();
      const { totals } = await this.getDiagnostics();
      const empty = totals.pending === 0 && totals.processing === 0;
      const since = empty ? (quietSince ?? Date.now()) : null;
      if (since !== null && Date.now() - since >= quietMs) return;
      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out waiting for the job queue to settle: ${totals.pending} pending, ${totals.processing} processing`,
        );
      }
      await Bun.sleep(pollIntervalMs);
      return settle(since);
    };

    return settle(null);
  }

  public getRuntimeUpdates(
    cursor: JobRuntimeUpdateCursor,
    limit: number = 1_000,
  ): Promise<JobRuntimeUpdate[]> {
    return this.repository.getRuntimeUpdates(cursor, limit);
  }

  /**
   * Clean up old completed/failed jobs
   */
  public async cleanup(olderThanMs: number): Promise<number> {
    const deletedCount = await this.repository.cleanup(olderThanMs);

    if (deletedCount > 0) {
      this.logger.info("Cleaned up old jobs", {
        deletedCount,
        olderThanMs,
      });
    }

    return deletedCount;
  }

  /**
   * Get active jobs (pending or processing)
   */
  public async getActiveJobs(types?: string[]): Promise<JobInfo[]> {
    return this.repository.getActiveJobs(types);
  }

  /**
   * Get failed jobs
   */
  public async getFailedJobs(types?: string[]): Promise<JobInfo[]> {
    return this.repository.getFailedJobs(types);
  }
}
