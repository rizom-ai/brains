import type { JobQueue } from "./schema/job-queue";
import type { DeduplicationStrategy } from "./schema/types";
import { createId } from "@brains/utils/id";
import { Logger } from "@brains/utils/logger";
import type {
  IJobQueueService,
  JobClaimOptions,
  JobHandler,
  JobInfo,
  JobQueueDiagnostics,
  JobQueueEnqueueRequest,
  JobQueueServiceConfig,
  JobQueueStats,
} from "./types";
import { JOB_STATUS } from "./schemas";
import { applySqlitePragmas } from "@brains/db";
import { createJobQueueDatabase } from "./db";
import type { Client } from "@libsql/client";
import { HandlerRegistry } from "./handler-registry";
import { JobQueueRepository } from "./job-queue-repository";
import { JobDeduplicator } from "./job-deduplicator";
import { getErrorMessage } from "@brains/utils/error";
import {
  OperationProvenanceSchema,
  type OperationProvenance,
} from "@brains/contracts";
import { OperationContext } from "@brains/operation-context";

export interface ProjectionJobAdmission {
  assertJobAdmission(provenance: OperationProvenance): Promise<void>;
}

export interface JobQueueServiceRuntimeOptions {
  operationContext?: OperationContext | undefined;
  projectionAdmission?: ProjectionJobAdmission | undefined;
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
  private deduplicator: JobDeduplicator;
  private walInitialization: Promise<void> | null = null;
  private walInitializationSettled = false;
  private closeRequested = false;
  private clientClosed = false;
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
    if (!this.walInitialization || this.walInitializationSettled) {
      this.closeClient();
    }
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

    this.handlerRegistry = new HandlerRegistry(this.logger);
    this.repository = new JobQueueRepository(db, this.logger);
    this.directLeaseDurationMs = config.claimTimeoutMs ?? 300_000;
    this.deduplicator = new JobDeduplicator();
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
      if (this.closeRequested) this.closeClient();
    }
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

  /**
   * Check for duplicate jobs based on deduplication strategy
   * Returns the duplicate job if one should block this enqueue, null otherwise
   */
  private async checkForDuplicate(
    type: string,
    deduplicationStrategy?: DeduplicationStrategy,
    deduplicationKey?: string,
  ): Promise<JobInfo | null> {
    const activeJobs = await this.getActiveJobs([type]);
    return this.deduplicator.findDuplicate(
      activeJobs,
      deduplicationStrategy,
      deduplicationKey,
    );
  }

  /**
   * Enqueue a job for processing
   */
  public async enqueue(request: JobQueueEnqueueRequest): Promise<string> {
    const { type, data, options } = request;
    const duplicate = await this.checkForDuplicate(
      type,
      options?.deduplication,
      options?.deduplicationKey,
    );

    if (duplicate) {
      if (options?.deduplication === "skip") {
        this.logger.debug("Skipping duplicate job (already pending)", {
          type,
          existingJobId: duplicate.id,
        });
        return duplicate.id;
      }

      if (options?.deduplication === "replace") {
        this.logger.debug("Replacing duplicate job", {
          type,
          oldJobId: duplicate.id,
        });
        await this.repository.markTerminallyFailed(
          duplicate.id,
          "Replaced by newer job",
        );
      }

      if (options?.deduplication === "coalesce") {
        this.logger.debug("Coalescing with existing job", {
          type,
          existingJobId: duplicate.id,
        });
        await this.repository.setScheduledFor(duplicate.id, Date.now());
        return duplicate.id;
      }
    }

    const handler = this.handlerRegistry.getHandler(type);
    if (!handler) {
      throw new Error(`No handler registered for job type: ${type}`);
    }

    const parsedData = handler.validateAndParse(data);
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
    await this.projectionAdmission?.assertJobAdmission(provenance);
    const { provenance: _providedProvenance, ...providedMetadata } =
      options?.metadata ?? { operationType: "data_processing" as const };

    const jobData = {
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

    try {
      await this.repository.insert(jobData);

      this.logger.debug("Job enqueued", {
        id,
        type,
        priority: jobData.priority,
        rootJobId: jobData.metadata.rootJobId,
      });

      return id;
    } catch (error) {
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
    const inherited = options?.metadata.provenance ?? current?.provenance;
    const projection = options?.projection;
    const projectionLineage = projection
      ? [...(inherited?.projectionLineage ?? []), projection.id]
      : [...(inherited?.projectionLineage ?? [])];
    const projectionId = projection?.id ?? inherited?.projectionId;

    return OperationProvenanceSchema.parse({
      rootJobId,
      causationId: current?.operationId ?? inherited?.causationId ?? jobId,
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
   * Dequeue the next job for processing. Workers provide explicit ownership;
   * direct administrative callers receive one service-local fallback session.
   */
  public async dequeue(claim?: JobClaimOptions): Promise<JobQueue | null> {
    const ownership = claim ?? (await this.getDirectClaimOptions());
    const now = Date.now();
    const job = await this.repository.claimNextReady({
      ...ownership,
      now,
      attemptId: createId(),
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
  ): Promise<void> {
    await this.repository.startWorkerSession(workerSlotId, workerSessionId);
  }

  public heartbeatWorkerSession(
    workerSlotId: string,
    workerSessionId: string,
  ): Promise<boolean> {
    return this.repository.heartbeatWorkerSession(
      workerSlotId,
      workerSessionId,
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
  ): Promise<boolean> {
    return this.repository.recordAttemptProgress(jobId, attemptId);
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
    );
    await this.directSessionStart;
    return {
      workerSlotId: this.directWorkerSlotId,
      workerSessionId: this.directWorkerSessionId,
      leaseDurationMs: this.directLeaseDurationMs,
      workerSessionTimeoutMs: this.directLeaseDurationMs,
    };
  }

  /**
   * Get job status by ID
   */
  public async getStatus(jobId: string): Promise<JobInfo | null> {
    return this.repository.getStatus(jobId);
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
