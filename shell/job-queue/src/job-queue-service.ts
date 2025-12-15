import { eq, and, or, inArray, sql, desc, asc, lte } from "drizzle-orm";
import { jobQueue, type JobQueue } from "./schema/job-queue";
import type { JobOptions } from "./schema/types";
import { Logger, createId } from "@brains/utils";
import type { IJobQueueService, JobHandler, JobInfo } from "./types";
import { JOB_STATUS } from "./schemas";
import { createJobQueueDatabase, enableWALMode } from "./db";
import type { JobQueueDbConfig } from "./types";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { Client } from "@libsql/client";
import { HandlerRegistry } from "./handler-registry";
import { JobOperations } from "./job-operations";

/**
 * Service for managing the generic job queue
 * Implements Component Interface Standardization pattern
 * Refactored to use separate classes for specific responsibilities
 */
export class JobQueueService implements IJobQueueService {
  private static instance: JobQueueService | null = null;
  private db: LibSQLDatabase<Record<string, unknown>>;
  private client: Client;
  private logger: Logger;

  // Extracted responsibility classes
  private handlerRegistry: HandlerRegistry;
  private jobOperations: JobOperations;

  /**
   * Get the singleton instance
   */
  public static getInstance(
    config: JobQueueDbConfig,
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
      JobQueueService.instance.client.close();
      JobQueueService.instance = null;
    }
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    config: JobQueueDbConfig,
    logger?: Logger,
  ): JobQueueService {
    return new JobQueueService(config, logger ?? Logger.getInstance());
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(config: JobQueueDbConfig, logger?: Logger) {
    const { db, client, url } = createJobQueueDatabase(config);
    this.db = db;
    this.client = client;
    this.logger = (logger ?? Logger.getInstance()).child("JobQueueService");

    // Initialize extracted responsibility classes
    this.handlerRegistry = new HandlerRegistry(this.logger);
    this.jobOperations = new JobOperations(this.db, this.logger);

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
    deduplicationStrategy?: string,
    deduplicationKey?: string,
  ): Promise<JobInfo | null> {
    if (!deduplicationStrategy || deduplicationStrategy === "none") {
      return null;
    }

    // Get all active jobs of this type
    const activeJobs = await this.getActiveJobs([type]);

    // Filter by deduplication key if provided
    const matchingJobs = deduplicationKey
      ? activeJobs.filter((job) => {
          try {
            const data = JSON.parse(job.data);
            return data.deduplicationKey === deduplicationKey;
          } catch {
            return false;
          }
        })
      : activeJobs;

    if (matchingJobs.length === 0) {
      return null;
    }

    // For "skip": only skip if PENDING duplicate exists
    // Allow if only PROCESSING (ensures eventual consistency)
    if (deduplicationStrategy === "skip") {
      return matchingJobs.find((j) => j.status === JOB_STATUS.PENDING) ?? null;
    }

    // For "replace"/"coalesce": return any active duplicate
    return matchingJobs[0] ?? null;
  }

  /**
   * Enqueue a job for processing
   */
  public async enqueue(
    type: string,
    data: unknown,
    options?: JobOptions,
  ): Promise<string> {
    // Use the type exactly as provided - callers should be explicit about scope
    const scopedType = type;

    // Check for duplicates BEFORE validation
    const duplicate = await this.checkForDuplicate(
      scopedType,
      options?.deduplication,
      options?.deduplicationKey,
    );

    if (duplicate) {
      if (options?.deduplication === "skip") {
        this.logger.debug("Skipping duplicate job (already pending)", {
          type: scopedType,
          existingJobId: duplicate.id,
        });
        return duplicate.id;
      }

      if (options?.deduplication === "replace") {
        this.logger.debug("Replacing duplicate job", {
          type: scopedType,
          oldJobId: duplicate.id,
        });
        // Cancel the old job
        await this.db
          .update(jobQueue)
          .set({
            status: JOB_STATUS.FAILED,
            lastError: "Replaced by newer job",
          })
          .where(eq(jobQueue.id, duplicate.id));
      }

      if (options?.deduplication === "coalesce") {
        this.logger.debug("Coalescing with existing job", {
          type: scopedType,
          existingJobId: duplicate.id,
        });
        // Update timestamp to "refresh" the job
        await this.db
          .update(jobQueue)
          .set({ scheduledFor: Date.now() })
          .where(eq(jobQueue.id, duplicate.id));
        return duplicate.id;
      }
    }

    // Get handler and validate data
    const handler = this.handlerRegistry.getHandler(scopedType);
    if (!handler) {
      throw new Error(`No handler registered for job type: ${scopedType}`);
    }

    // Validate and parse data
    const parsedData = handler.validateAndParse(data);
    if (parsedData === null) {
      throw new Error(`Invalid job data for type: ${type}`);
    }

    const now = Date.now();
    const id = createId();

    // Include deduplicationKey in job data for filtering
    const dataWithKey = options?.deduplicationKey
      ? { ...parsedData, deduplicationKey: options.deduplicationKey }
      : parsedData;

    const jobData = {
      id,
      type: scopedType,
      data: JSON.stringify(dataWithKey),
      status: JOB_STATUS.PENDING,
      priority: options?.priority ?? 0,
      maxRetries: options?.maxRetries ?? 3,
      retryCount: 0,
      source: options?.source ?? null,
      metadata: {
        // Default metadata values - will be overridden by spread if provided
        operationType: "data_processing" as const,
        // Merge provided metadata (allows override of defaults)
        ...options?.metadata,
        // Ensure rootJobId is always present - default to job's own ID for standalone jobs
        // Batch children will have rootJobId set by BatchJobManager via options.rootJobId
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
      await this.db.insert(jobQueue).values(jobData);

      this.logger.debug("Job enqueued", {
        id,
        type: scopedType,
        priority: jobData.priority,
        rootJobId: jobData.metadata.rootJobId,
      });

      return id;
    } catch (error) {
      this.logger.error("Failed to enqueue job", {
        type: scopedType,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Dequeue the next job for processing
   */
  public async dequeue(): Promise<JobQueue | null> {
    const now = Date.now();

    // Find the next pending job that's ready to process
    const jobs = await this.db
      .select()
      .from(jobQueue)
      .where(
        and(
          eq(jobQueue.status, JOB_STATUS.PENDING),
          lte(jobQueue.scheduledFor, now),
        ),
      )
      .orderBy(asc(jobQueue.priority), asc(jobQueue.createdAt))
      .limit(1);

    if (jobs.length === 0) {
      return null;
    }

    const job = jobs[0];
    if (!job) {
      return null;
    }

    // Mark the job as processing
    await this.jobOperations.markProcessing(job.id);

    // Update the job object to reflect the new status
    job.status = JOB_STATUS.PROCESSING;
    job.startedAt = Date.now();

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
    await this.jobOperations.complete(jobId, result);
  }

  /**
   * Update job data (for progress tracking)
   */
  public async update(jobId: string, data: unknown): Promise<void> {
    await this.jobOperations.update(jobId, data);
  }

  /**
   * Mark a job as failed
   */
  public async fail(jobId: string, error: Error): Promise<void> {
    await this.jobOperations.fail(jobId, error);
  }

  /**
   * Get job status by ID
   */
  public async getStatus(jobId: string): Promise<JobInfo | null> {
    const jobs = await this.db
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.id, jobId))
      .limit(1);

    const job = jobs[0];
    if (!job) {
      this.logger.debug("Job not found", { jobId });
      return null;
    }

    return job;
  }

  /**
   * Get job status by entity ID (from job data)
   */
  public async getStatusByEntityId(entityId: string): Promise<JobInfo | null> {
    // Use JSON extract to search within the data field
    const jobs = await this.db
      .select()
      .from(jobQueue)
      .where(sql`json_extract(${jobQueue.data}, '$.id') = ${entityId}`)
      .orderBy(desc(jobQueue.createdAt))
      .limit(1);

    const job = jobs[0];
    if (!job) {
      this.logger.debug("No job found for entity", { entityId });
      return null;
    }

    return job;
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
    const stats = await this.db
      .select({
        status: jobQueue.status,
        count: sql<number>`count(*)`,
      })
      .from(jobQueue)
      .groupBy(jobQueue.status);

    const result = {
      pending: 0,
      processing: 0,
      failed: 0,
      completed: 0,
      total: 0,
    };

    for (const row of stats) {
      const count = Number(row.count);
      result[row.status as keyof typeof result] = count;
      result.total += count;
    }

    return result;
  }

  /**
   * Clean up old completed/failed jobs
   */
  public async cleanup(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;

    const result = await this.db
      .delete(jobQueue)
      .where(
        and(
          or(
            eq(jobQueue.status, JOB_STATUS.COMPLETED),
            eq(jobQueue.status, JOB_STATUS.FAILED),
          ),
          lte(jobQueue.completedAt, cutoff),
        ),
      );

    const deletedCount = result.rowsAffected;

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
    let query = this.db
      .select()
      .from(jobQueue)
      .where(
        or(
          eq(jobQueue.status, JOB_STATUS.PENDING),
          eq(jobQueue.status, JOB_STATUS.PROCESSING),
        ),
      );

    if (types && types.length > 0) {
      query = this.db
        .select()
        .from(jobQueue)
        .where(
          and(
            or(
              eq(jobQueue.status, JOB_STATUS.PENDING),
              eq(jobQueue.status, JOB_STATUS.PROCESSING),
            ),
            inArray(jobQueue.type, types),
          ),
        );
    }

    const jobs = await query.orderBy(desc(jobQueue.createdAt));

    return jobs;
  }
}
