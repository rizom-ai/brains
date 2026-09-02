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
  PreparedJobEnqueue,
  JobQueueServiceConfig,
  JobQueueStats,
  JobRuntimeUpdate,
  JobRuntimeUpdateCursor,
  JobValidator,
} from "./types";
import { JOB_STATUS } from "./schemas";
import { applySqlitePragmas, closeSqliteClient } from "@brains/db";
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
import {
  parseJobQueueRpcRequest,
  parseJobQueueRpcResult,
  type JobQueueRpcRequest,
  type JobQueueRpcTransport,
} from "./job-queue-rpc";

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
  remoteTransport?: JobQueueRpcTransport | undefined;
}

/**
 * Service for managing the generic job queue
 * Refactored to use separate classes for specific responsibilities
 */
export class JobQueueService implements IJobQueueService {
  private readonly client: Client | undefined;
  private readonly logger: Logger;

  private readonly handlerRegistry: HandlerRegistry;
  private readonly repository: JobQueueRepository | undefined;
  private readonly remoteTransport: JobQueueRpcTransport | undefined;
  private walInitialization: Promise<void> | null = null;
  private walInitializationSettled = false;
  private closeRequested = false;
  private closePromise: Promise<void> | null = null;
  private clientClosePromise: Promise<void> | null = null;
  private resolveClose: (() => void) | null = null;
  private rejectClose: ((error: unknown) => void) | null = null;
  private inFlightEnqueues = 0;
  private readonly databaseUrl: string | undefined;
  private readonly operationContext: OperationContext;
  private readonly projectionAdmission: ProjectionJobAdmission | undefined;
  private readonly directWorkerSlotId = `direct:${createId()}`;
  private readonly directWorkerSessionId = createId();
  private readonly directLeaseDurationMs: number;
  private directSessionStart: Promise<void> | null = null;

  /** Begin closing without changing the existing synchronous service contract. */
  public close(): void {
    void this.closeAsync().catch((error) => {
      this.logger.error("Failed to close job queue storage", error);
    });
  }

  /** Await admitted enqueues, readiness work, and durable client close. */
  public closeAsync(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closeRequested = true;
    this.closePromise = new Promise<void>((resolve, reject) => {
      this.resolveClose = resolve;
      this.rejectClose = reject;
    });
    this.closeClientWhenReady();
    return this.closePromise;
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
    this.logger = logger.child("JobQueueService");
    this.operationContext =
      runtimeOptions?.operationContext ?? OperationContext.createFresh();
    this.projectionAdmission = runtimeOptions?.projectionAdmission;
    this.remoteTransport = runtimeOptions?.remoteTransport;

    this.handlerRegistry = new HandlerRegistry(
      this.logger,
      runtimeOptions?.handlerRegistrationMode ?? "combined",
    );
    if (this.remoteTransport) {
      this.client = undefined;
      this.databaseUrl = undefined;
      this.repository = undefined;
    } else {
      const { db, client, url } = createJobQueueDatabase(config);
      this.client = client;
      this.databaseUrl = url;
      this.repository = new JobQueueRepository(db, client, url, this.logger);
    }
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
      if (this.remoteTransport) {
        await this.remoteTransport.initialize();
      } else {
        await applySqlitePragmas(
          this.requireClient(),
          this.requireDatabaseUrl(),
        );
      }
    } catch (error) {
      this.logger.warn(
        "Failed to initialize job queue storage (non-fatal)",
        error,
      );
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
    void this.closeClient().then(
      () => this.resolveClose?.(),
      (error) => this.rejectClose?.(error),
    );
  }

  private closeClient(): Promise<void> {
    if (this.clientClosePromise) return this.clientClosePromise;
    this.clientClosePromise = this.remoteTransport
      ? Promise.resolve().then(() => this.remoteTransport?.close())
      : closeSqliteClient(this.requireClient());
    return this.clientClosePromise;
  }

  private requireClient(): Client {
    if (!this.client) throw new Error("Job queue database is not local");
    return this.client;
  }

  private requireDatabaseUrl(): string {
    if (!this.databaseUrl) throw new Error("Job queue database is not local");
    return this.databaseUrl;
  }

  private requireRepository(): JobQueueRepository {
    if (!this.repository) throw new Error("Job queue database is not local");
    return this.repository;
  }

  private async requestRemote<T>(request: JobQueueRpcRequest): Promise<T> {
    if (!this.remoteTransport) {
      throw new Error("Job queue remote transport is not configured");
    }
    const result = await this.remoteTransport.request(request);
    return parseJobQueueRpcResult(request, result) as T;
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

  /** Validate a request and freeze the identity/provenance used by a durable relay. */
  public prepareEnqueue(request: JobQueueEnqueueRequest): PreparedJobEnqueue {
    const parsedData = this.validateEnqueueData(request.type, request.data);
    const jobId = this.resolveJobId(request.idempotencyKey);
    const options = request.options;
    if (!options) {
      return {
        jobId,
        request: {
          type: request.type,
          data: parsedData,
          idempotencyKey: jobId,
        },
      };
    }

    const rootJobId =
      options.rootJobId ??
      this.operationContext.current()?.provenance.rootJobId ??
      jobId;
    const provenance = this.createJobProvenance(jobId, rootJobId, options);
    const { projection: _appliedProjection, ...preparedOptions } = options;
    return {
      jobId,
      request: {
        type: request.type,
        data: parsedData,
        idempotencyKey: jobId,
        options: {
          ...preparedOptions,
          rootJobId,
          metadata: { ...options.metadata, provenance },
        },
      },
    };
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
    const parsedData = this.validateEnqueueData(type, data);
    if (this.remoteTransport) {
      return this.requestRemote<string>({
        operation: "enqueue",
        request: {
          type,
          data: parsedData,
          ...(request.idempotencyKey && {
            idempotencyKey: request.idempotencyKey,
          }),
          ...(options && { options }),
        },
      });
    }

    const now = Date.now();
    const id = this.resolveJobId(request.idempotencyKey);
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
      const decision = await this.requireRepository().enqueueAtomic({
        jobData,
        idempotent: request.idempotencyKey !== undefined,
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

      if (decision.kind === "replayed") {
        this.logger.debug("Acknowledging idempotent job replay", {
          type,
          jobId: decision.jobId,
        });
      } else if (decision.kind === "skipped") {
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

  private resolveJobId(idempotencyKey: string | undefined): string {
    if (idempotencyKey === "") {
      throw new Error("Job idempotency keys must not be empty");
    }
    return idempotencyKey ?? createId();
  }

  private validateEnqueueData(type: string, data: unknown): unknown {
    const validator = this.handlerRegistry.getValidator(type);
    if (!validator) {
      throw new Error(`No job type declared: ${type}`);
    }
    const parsedData = validator.validateAndParse(data);
    if (parsedData === null) {
      throw new Error(`Invalid job data for type: ${type}`);
    }
    return parsedData;
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
    return this.dequeueForExecutableTypes(executableTypes, claim);
  }

  private async dequeueForExecutableTypes(
    executableTypes: string[],
    claim?: JobClaimOptions,
  ): Promise<JobQueue | null> {
    const ownership = claim ?? (await this.getDirectClaimOptions());
    if (this.remoteTransport) {
      return this.requestRemote<JobQueue | null>({
        operation: "dequeue",
        claim: ownership,
        executableTypes,
      });
    }

    const job = await this.requireRepository().claimNextReady({
      ...ownership,
      now: Date.now(),
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
    if (this.remoteTransport) {
      await this.requestRemote<void>({
        operation: "startWorkerSession",
        workerSlotId,
        workerSessionId,
        workerSessionTimeoutMs,
      });
      return;
    }
    await this.requireRepository().startWorkerSession(
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
    if (this.remoteTransport) {
      return this.requestRemote<boolean>({
        operation: "heartbeatWorkerSession",
        workerSlotId,
        workerSessionId,
        workerSessionTimeoutMs,
      });
    }
    return this.requireRepository().heartbeatWorkerSession(
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
    if (this.remoteTransport) {
      return this.requestRemote<boolean>({
        operation: "endWorkerSession",
        workerSlotId,
        workerSessionId,
      });
    }
    return this.requireRepository().endWorkerSession(
      workerSlotId,
      workerSessionId,
    );
  }

  public renewAttemptLease(
    jobId: string,
    attemptId: string,
    leaseDurationMs: number,
  ): Promise<boolean> {
    if (this.remoteTransport) {
      return this.requestRemote<boolean>({
        operation: "renewAttemptLease",
        jobId,
        attemptId,
        leaseDurationMs,
      });
    }
    return this.requireRepository().renewAttemptLease(
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
    if (this.remoteTransport) {
      return this.requestRemote<boolean>({
        operation: "recordAttemptProgress",
        jobId,
        attemptId,
        progress,
      });
    }
    return this.requireRepository().recordAttemptProgress(
      jobId,
      attemptId,
      progress,
    );
  }

  /** Mark a job as completed. */
  public complete(
    jobId: string,
    result: unknown,
    attemptId?: string,
  ): Promise<boolean> {
    if (this.remoteTransport) {
      return this.requestRemote<boolean>({
        operation: "complete",
        jobId,
        result,
        attemptId,
      });
    }
    return this.requireRepository().complete(jobId, result, attemptId);
  }

  /** Update job data (for progress tracking). */
  public update(
    jobId: string,
    data: unknown,
    attemptId?: string,
  ): Promise<boolean> {
    if (this.remoteTransport) {
      return this.requestRemote<boolean>({
        operation: "update",
        jobId,
        data,
        attemptId,
      });
    }
    return this.requireRepository().update(jobId, data, attemptId);
  }

  /** Mark a job as failed. */
  public fail(
    jobId: string,
    error: Error,
    attemptId?: string,
  ): Promise<boolean> {
    if (this.remoteTransport) {
      return this.requestRemote<boolean>({
        operation: "fail",
        jobId,
        error: {
          name: error.name || "Error",
          message: error.message,
          ...(error.stack && { stack: error.stack }),
        },
        attemptId,
      });
    }
    return this.requireRepository().fail(jobId, error, attemptId);
  }

  private async getDirectClaimOptions(): Promise<JobClaimOptions> {
    this.directSessionStart ??= this.startWorkerSession(
      this.directWorkerSlotId,
      this.directWorkerSessionId,
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
    if (this.remoteTransport) {
      return this.requestRemote<JobInfo | null>({
        operation: "getStatus",
        jobId,
      });
    }
    return this.requireRepository().getStatus(jobId);
  }

  public async getJobsByRootJobId(rootJobId: string): Promise<JobInfo[]> {
    // Only projection-batch recovery reads this, and recovery runs in the
    // database owner; requireRepository keeps the worker refusal loud.
    return this.requireRepository().getJobsByRootJobId(rootJobId);
  }

  public async getStatusByEntityId(entityId: string): Promise<JobInfo | null> {
    if (this.remoteTransport) {
      return this.requestRemote<JobInfo | null>({
        operation: "getStatusByEntityId",
        entityId,
      });
    }
    return this.requireRepository().getStatusByEntityId(entityId);
  }

  /**
   * Get job queue statistics
   */
  public async getStats(): Promise<JobQueueStats> {
    if (this.remoteTransport) {
      return this.requestRemote<JobQueueStats>({ operation: "getStats" });
    }
    return this.requireRepository().getStats();
  }

  public getDiagnostics(now?: number): Promise<JobQueueDiagnostics> {
    if (this.remoteTransport) {
      return this.requestRemote<JobQueueDiagnostics>({
        operation: "getDiagnostics",
        now,
      });
    }
    return this.requireRepository().getDiagnostics(now);
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
    if (this.remoteTransport) {
      return this.requestRemote<JobRuntimeUpdate[]>({
        operation: "getRuntimeUpdates",
        cursor,
        limit,
      });
    }
    return this.requireRepository().getRuntimeUpdates(cursor, limit);
  }

  /**
   * Clean up old completed/failed jobs
   */
  public async cleanup(olderThanMs: number): Promise<number> {
    const deletedCount = this.remoteTransport
      ? await this.requestRemote<number>({ operation: "cleanup", olderThanMs })
      : await this.requireRepository().cleanup(olderThanMs);

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
    if (this.remoteTransport) {
      return this.requestRemote<JobInfo[]>({
        operation: "getActiveJobs",
        types,
      });
    }
    return this.requireRepository().getActiveJobs(types);
  }

  /**
   * Get recent jobs of any status, newest first
   */
  public async getRecentJobs(
    types?: string[],
    limit?: number,
  ): Promise<JobInfo[]> {
    return this.requireRepository().getRecentJobs(types, limit);
  }

  /**
   * Get failed jobs
   */
  public async getFailedJobs(types?: string[]): Promise<JobInfo[]> {
    if (this.remoteTransport) {
      return this.requestRemote<JobInfo[]>({
        operation: "getFailedJobs",
        types,
      });
    }
    return this.requireRepository().getFailedJobs(types);
  }

  /** Owner-side dispatch entry point for the private database endpoint. */
  public handleRpcRequest(
    input: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    signal?.throwIfAborted();
    const request = parseJobQueueRpcRequest(input);
    switch (request.operation) {
      case "enqueue":
        return this.enqueue(request.request);
      case "dequeue":
        return this.dequeueForExecutableTypes(
          request.executableTypes,
          request.claim,
        );
      case "startWorkerSession":
        return this.startWorkerSession(
          request.workerSlotId,
          request.workerSessionId,
          request.workerSessionTimeoutMs,
        );
      case "heartbeatWorkerSession":
        return this.heartbeatWorkerSession(
          request.workerSlotId,
          request.workerSessionId,
          request.workerSessionTimeoutMs,
        );
      case "endWorkerSession":
        return this.endWorkerSession(
          request.workerSlotId,
          request.workerSessionId,
        );
      case "renewAttemptLease":
        return this.renewAttemptLease(
          request.jobId,
          request.attemptId,
          request.leaseDurationMs,
        );
      case "recordAttemptProgress":
        return this.recordAttemptProgress(
          request.jobId,
          request.attemptId,
          request.progress,
        );
      case "complete":
        return this.complete(request.jobId, request.result, request.attemptId);
      case "update":
        return this.update(request.jobId, request.data, request.attemptId);
      case "fail": {
        const error = new Error(request.error.message);
        error.name = request.error.name;
        if (request.error.stack) error.stack = request.error.stack;
        return this.fail(request.jobId, error, request.attemptId);
      }
      case "getStatus":
        return this.getStatus(request.jobId);
      case "getStatusByEntityId":
        return this.getStatusByEntityId(request.entityId);
      case "getStats":
        return this.getStats();
      case "getDiagnostics":
        return this.getDiagnostics(request.now);
      case "getRuntimeUpdates":
        return this.getRuntimeUpdates(request.cursor, request.limit);
      case "cleanup":
        return this.cleanup(request.olderThanMs);
      case "getActiveJobs":
        return this.getActiveJobs(request.types);
      case "getFailedJobs":
        return this.getFailedJobs(request.types);
    }
  }
}
