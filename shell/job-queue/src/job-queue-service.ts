import type { JobQueue } from "./schema/job-queue";
import type { DeduplicationStrategy, JobOptions } from "./schema/types";
import { Logger, createId } from "@brains/utils";
import type {
  IJobQueueService,
  JobHandler,
  JobInfo,
  JobQueueServiceConfig,
} from "./types";
import { JOB_STATUS } from "./schemas";
import { createJobQueueDatabase, enableWALMode } from "./db";
import type { Client } from "@libsql/client";
import { HandlerRegistry } from "./handler-registry";
import { JobQueueRepository } from "./job-queue-repository";
import { JobDeduplicator } from "./job-deduplicator";

/**
 * Service for managing the generic job queue
 * Implements Component Interface Standardization pattern
 * Refactored to use separate classes for specific responsibilities
 */
export class JobQueueService implements IJobQueueService {
  private static instance: JobQueueService | null = null;
  private client: Client;
  private logger: Logger;

  private handlerRegistry: HandlerRegistry;
  private repository: JobQueueRepository;
  private deduplicator: JobDeduplicator;

  /**
   * Get the singleton instance
   */
  public static getInstance(
    config: JobQueueServiceConfig,
    logger?: Logger,
  ): JobQueueService {
    JobQueueService.instance ??= new JobQueueService(
      config,
      logger ?? Logger.getInstance(),
    );
    return JobQueueService.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    if (JobQueueService.instance) {
      JobQueueService.instance.close();
      JobQueueService.instance = null;
    }
  }

  /**
   * Close the underlying database connection.
   */
  public close(): void {
    this.client.close();
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    config: JobQueueServiceConfig,
    logger?: Logger,
  ): JobQueueService {
    return new JobQueueService(config, logger ?? Logger.getInstance());
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(config: JobQueueServiceConfig, logger?: Logger) {
    const { db, client, url } = createJobQueueDatabase(config);
    this.client = client;
    this.logger = (logger ?? Logger.getInstance()).child("JobQueueService");

    this.handlerRegistry = new HandlerRegistry(this.logger);
    this.repository = new JobQueueRepository(db, this.logger);
    this.deduplicator = new JobDeduplicator();

    // Enable WAL mode asynchronously (non-blocking)
    enableWALMode(client, url).catch((error) => {
      this.logger.warn("Failed to enable WAL mode (non-fatal)", error);
    });
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
  public async enqueue(
    type: string,
    data: unknown,
    options?: JobOptions,
  ): Promise<string> {
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
        operationType: "data_processing" as const,
        ...options?.metadata,
        ...(options?.deduplicationKey && {
          deduplicationKey: options.deduplicationKey,
        }),
        rootJobId: options?.rootJobId ?? id,
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
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Dequeue the next job for processing
   */
  public async dequeue(): Promise<JobQueue | null> {
    const job = await this.repository.claimNextReady();
    if (!job) return null;

    this.logger.debug("Job dequeued", {
      id: job.id,
      type: job.type,
      priority: job.priority,
      retryCount: job.retryCount,
    });

    return job;
  }

  /**
   * Mark a job as completed
   */
  public async complete(jobId: string, result: unknown): Promise<void> {
    await this.repository.complete(jobId, result);
  }

  /**
   * Update job data (for progress tracking)
   */
  public async update(jobId: string, data: unknown): Promise<void> {
    await this.repository.update(jobId, data);
  }

  /**
   * Mark a job as failed
   */
  public async fail(jobId: string, error: Error): Promise<void> {
    await this.repository.fail(jobId, error);
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
  public async getStats(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    completed: number;
    total: number;
  }> {
    return this.repository.getStats();
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
}
