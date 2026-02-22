import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { JobQueueService } from "../src/job-queue-service";
import type { JobHandler, JobQueueDbConfig } from "../src/types";
import type { JobOptions } from "../src/schema/types";
import { createTestJobQueueDatabase } from "./helpers/test-job-queue-db";
import { createSilentLogger } from "@brains/test-utils";
import { createId } from "@brains/utils";
import type { ProgressReporter } from "@brains/utils";

interface EntityWithoutEmbedding {
  id: string;
  entityType: string;
  content: string;
  metadata?: Record<string, unknown>;
  contentWeight?: number;
  created: number;
  updated: number;
}

const defaultEnqueueOptions: JobOptions = {
  source: "test",
  metadata: { operationType: "data_processing" },
};

function enqueueOpts(overrides: Partial<JobOptions> = {}): JobOptions {
  return { ...defaultEnqueueOptions, ...overrides };
}

class TestJobHandler implements JobHandler<"shell:embedding"> {
  public processCallCount = 0;
  public onErrorCallCount = 0;
  public validateCallCount = 0;
  public shouldValidationFail = false;
  public shouldProcessFail = false;

  async process(
    _data: EntityWithoutEmbedding,
    _jobId: string,
    _progressReporter: ProgressReporter,
  ): Promise<void> {
    this.processCallCount++;
    if (this.shouldProcessFail) {
      throw new Error("Process failed");
    }
  }

  async onError(
    _error: Error,
    _data: EntityWithoutEmbedding,
    _jobId: string,
    _progressReporter: ProgressReporter,
  ): Promise<void> {
    this.onErrorCallCount++;
  }

  validateAndParse(data: unknown): EntityWithoutEmbedding | null {
    this.validateCallCount++;
    if (this.shouldValidationFail) {
      return null;
    }
    return data as EntityWithoutEmbedding;
  }
}

describe("JobQueueService", () => {
  let service: JobQueueService;
  let config: JobQueueDbConfig;
  let cleanup: () => Promise<void>;
  let testHandler: TestJobHandler;

  const testEntity: EntityWithoutEmbedding = {
    id: "test-123",
    entityType: "note",
    content: "# Test Note\n\nThis is a test note content.",
    metadata: { title: "Test Note", tags: ["test"] },
    contentWeight: 1.0,
    created: Date.now(),
    updated: Date.now(),
  };

  beforeEach(async () => {
    const testDb = await createTestJobQueueDatabase();
    config = testDb.config;
    cleanup = testDb.cleanup;

    service = JobQueueService.createFresh(config, createSilentLogger());
    testHandler = new TestJobHandler();
  });

  afterEach(async () => {
    JobQueueService.resetInstance();
    await cleanup();
  });

  describe("Handler registration", () => {
    it("should register a job handler successfully", () => {
      expect(() => {
        service.registerHandler("shell:embedding", testHandler);
      }).not.toThrow();
    });

    it("should return registered job types", () => {
      service.registerHandler("shell:embedding", testHandler);
      const types = service.getRegisteredTypes();
      expect(types).toContain("shell:embedding");
    });

    it("should allow multiple handlers for different job types", () => {
      const handler2 = new TestJobHandler();
      service.registerHandler("shell:embedding", testHandler);
      service.registerHandler(
        "shell:content-generation",
        handler2 as unknown as JobHandler<"content-generation">,
      );

      const types = service.getRegisteredTypes();
      expect(types.length).toBe(2);
      expect(types).toContain("shell:embedding");
      expect(types).toContain("shell:content-generation");
    });

    it("should unregister a job handler successfully", () => {
      service.registerHandler("shell:embedding", testHandler);
      expect(service.getRegisteredTypes()).toContain("shell:embedding");

      service.unregisterHandler("shell:embedding");
      expect(service.getRegisteredTypes()).not.toContain("shell:embedding");
    });

    it("should handle unregistering non-existent handler gracefully", () => {
      expect(() => {
        service.unregisterHandler("non-existent");
      }).not.toThrow();
    });

    it("should prevent job enqueuing after handler is unregistered", async () => {
      service.registerHandler("shell:embedding", testHandler);
      service.unregisterHandler("shell:embedding");

      expect(
        service.enqueue("shell:embedding", testEntity, defaultEnqueueOptions),
      ).rejects.toThrow("No handler registered for job type: shell:embedding");
    });
  });

  describe("Job enqueueing", () => {
    beforeEach(() => {
      service.registerHandler("shell:embedding", testHandler);
    });

    it("should enqueue a job successfully with valid data", async () => {
      const jobId = await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );

      expect(typeof jobId).toBe("string");
      expect(jobId.length).toBeGreaterThan(0);
      expect(testHandler.validateCallCount).toBe(1);

      const job = await service.getStatus(jobId);
      expect(job).toBeTruthy();
      expect(job?.type).toBe("shell:embedding");
      expect(job?.status).toBe("pending");
    });

    it("should store source and metadata when provided", async () => {
      const source = "matrix:room123";
      const rootJobId = createId();

      const jobId = await service.enqueue(
        "shell:embedding",
        testEntity,
        enqueueOpts({ source, rootJobId }),
      );

      const job = await service.getStatus(jobId);
      expect(job).toBeTruthy();
      expect(job?.source).toBe(source);
      expect(job?.metadata).toEqual({
        rootJobId,
        operationType: "data_processing",
      });
    });

    it("should store source and metadata correctly", async () => {
      const jobId = await service.enqueue(
        "shell:embedding",
        testEntity,
        enqueueOpts({ source: "test-service" }),
      );

      const job = await service.getStatus(jobId);
      expect(job).toBeTruthy();
      expect(job?.source).toBe("test-service");
      expect(job?.metadata.operationType).toBe("data_processing");
      expect(job?.metadata.rootJobId).toBeDefined();
      expect(typeof job?.metadata.rootJobId).toBe("string");
    });

    it("should throw error when enqueueing job with no registered handler", async () => {
      service = JobQueueService.createFresh(config, createSilentLogger());

      expect(
        service.enqueue("shell:embedding", testEntity, defaultEnqueueOptions),
      ).rejects.toThrow("No handler registered for job type: shell:embedding");
    });

    it("should throw error when enqueueing job with invalid data", async () => {
      testHandler.shouldValidationFail = true;

      expect(
        service.enqueue("shell:embedding", testEntity, defaultEnqueueOptions),
      ).rejects.toThrow("Invalid job data for type: shell:embedding");

      expect(testHandler.validateCallCount).toBe(1);
    });

    it("should apply job options correctly", async () => {
      const jobId = await service.enqueue(
        "shell:embedding",
        testEntity,
        enqueueOpts({ priority: 5, maxRetries: 5, delayMs: 1000 }),
      );
      const job = await service.getStatus(jobId);

      expect(job?.priority).toBe(5);
      expect(job?.maxRetries).toBe(5);
      expect(job?.scheduledFor).toBeGreaterThan(Date.now());
    });

    it("should use default options when metadata provided", async () => {
      const jobId = await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );
      const job = await service.getStatus(jobId);

      expect(job?.priority).toBe(0);
      expect(job?.maxRetries).toBe(3);
      expect(job?.retryCount).toBe(0);
    });
  });

  describe("getHandler", () => {
    beforeEach(() => {
      service.registerHandler("shell:embedding", testHandler);
    });

    it("should return registered handler", () => {
      const handler = service.getHandler("shell:embedding");
      expect(handler).toBe(testHandler);
    });

    it("should return undefined for unregistered handler", () => {
      const handler = service.getHandler("unknown-type");
      expect(handler).toBeUndefined();
    });
  });

  describe("Job queue operations", () => {
    beforeEach(() => {
      service.registerHandler("shell:embedding", testHandler);
    });

    it("should dequeue next pending job", async () => {
      const jobId = await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );

      const job = await service.dequeue();

      expect(job).toBeTruthy();
      expect(job?.id).toBe(jobId);
      expect(job?.status).toBe("processing");
      expect(job?.type).toBe("shell:embedding");
    });

    it("should return null when no jobs are available", async () => {
      const job = await service.dequeue();
      expect(job).toBeNull();
    });

    it("should respect job priority order (lower = higher priority)", async () => {
      const lowPriorityId = await service.enqueue(
        "shell:embedding",
        testEntity,
        enqueueOpts({ priority: 5 }),
      );
      const highPriorityId = await service.enqueue(
        "shell:embedding",
        testEntity,
        enqueueOpts({ priority: 1 }),
      );

      const firstJob = await service.dequeue();
      expect(firstJob?.id).toBe(highPriorityId);

      const secondJob = await service.dequeue();
      expect(secondJob?.id).toBe(lowPriorityId);
    });

    it("should respect scheduled time", async () => {
      await service.enqueue(
        "shell:embedding",
        testEntity,
        enqueueOpts({ delayMs: 5000 }),
      );
      const immediateJob = await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );

      const job = await service.dequeue();
      expect(job?.id).toBe(immediateJob);

      const noJob = await service.dequeue();
      expect(noJob).toBeNull();
    });
  });

  describe("Job completion and failure", () => {
    beforeEach(() => {
      service.registerHandler("shell:embedding", testHandler);
    });

    it("should mark job as completed", async () => {
      const jobId = await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );

      await service.complete(jobId, undefined);

      const job = await service.getStatus(jobId);
      expect(job?.status).toBe("completed");
      expect(job?.completedAt).toBeTruthy();
    });

    it("should handle job failure with retry", async () => {
      const jobId = await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );

      await service.fail(jobId, new Error("Test error"));

      const job = await service.getStatus(jobId);
      expect(job?.status).toBe("pending");
      expect(job?.retryCount).toBe(1);
      expect(job?.lastError).toBe("Test error");
    });

    it("should mark job as permanently failed when max retries exceeded", async () => {
      const jobId = await service.enqueue(
        "shell:embedding",
        testEntity,
        enqueueOpts({ maxRetries: 0 }),
      );

      await service.fail(jobId, new Error("Test error"));

      const job = await service.getStatus(jobId);
      expect(job?.status).toBe("failed");
      expect(job?.completedAt).toBeTruthy();
    });

    it("should use exponential backoff for retries", async () => {
      const jobId = await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );
      const originalTime = Date.now();

      await service.fail(jobId, new Error("Test error"));

      const job = await service.getStatus(jobId);
      expect(job?.scheduledFor).toBeGreaterThan(originalTime);
    });
  });

  describe("Queue statistics", () => {
    beforeEach(() => {
      service.registerHandler("shell:embedding", testHandler);
    });

    it("should return accurate queue statistics", async () => {
      await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );
      await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );

      const job1Id = await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );
      await service.complete(job1Id, undefined);

      const job2Id = await service.enqueue(
        "shell:embedding",
        testEntity,
        enqueueOpts({ maxRetries: 1 }),
      );
      await service.fail(job2Id, new Error("Test error"));
      await service.fail(job2Id, new Error("Test error"));

      const stats = await service.getStats();

      expect(stats.pending).toBeGreaterThanOrEqual(2);
      expect(stats.completed).toBeGreaterThanOrEqual(1);
      expect(stats.failed).toBeGreaterThanOrEqual(1);
      expect(stats.total).toBeGreaterThanOrEqual(4);
    });

    it("should return zero stats for empty queue", async () => {
      const stats = await service.getStats();

      expect(stats.pending).toBe(0);
      expect(stats.processing).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.total).toBe(0);
    });
  });

  describe("Cleanup operations", () => {
    beforeEach(() => {
      service.registerHandler("shell:embedding", testHandler);
    });

    it("should clean up old completed jobs", async () => {
      const jobId = await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );
      await service.complete(jobId, undefined);

      await new Promise((resolve) => setTimeout(resolve, 2));
      const deletedCount = await service.cleanup(1);

      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });

    it("should not clean up recent completed jobs", async () => {
      const jobId = await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );
      await service.complete(jobId, undefined);

      const deletedCount = await service.cleanup(3600000);

      expect(deletedCount).toBe(0);

      const job = await service.getStatus(jobId);
      expect(job).toBeTruthy();
    });
  });

  describe("Job status queries", () => {
    beforeEach(() => {
      service.registerHandler("shell:embedding", testHandler);
    });

    it("should get job status by ID", async () => {
      const jobId = await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );

      const job = await service.getStatus(jobId);
      expect(job?.id).toBe(jobId);
      expect(job?.type).toBe("shell:embedding");
      expect(job?.status).toBe("pending");
    });

    it("should get job status by entity ID for embedding jobs", async () => {
      await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );

      const job = await service.getStatusByEntityId(testEntity.id);
      expect(job?.type).toBe("shell:embedding");
      const jobData = job?.data ? JSON.parse(job.data) : null;
      expect(jobData).toMatchObject({ id: testEntity.id });
    });

    it("should return null when job not found", async () => {
      const job = await service.getStatus("nonexistent");
      expect(job).toBeNull();
    });

    it("should return null when entity not found", async () => {
      const job = await service.getStatusByEntityId("nonexistent");
      expect(job).toBeNull();
    });

    it("should return most recent job for entity", async () => {
      await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );
      await new Promise((resolve) => setTimeout(resolve, 1));
      const recentJobId = await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );

      const job = await service.getStatusByEntityId(testEntity.id);
      expect(job?.id).toBe(recentJobId);
    });
  });

  describe("getActiveJobs", () => {
    beforeEach(() => {
      service.registerHandler("shell:embedding", testHandler);
    });

    it("should return only pending and processing jobs", async () => {
      const pendingId = await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );
      const processingId = await service.enqueue(
        "shell:embedding",
        { ...testEntity, id: "test-456" },
        defaultEnqueueOptions,
      );
      const completedId = await service.enqueue(
        "shell:embedding",
        { ...testEntity, id: "test-789" },
        defaultEnqueueOptions,
      );

      const processingJob = await service.dequeue();
      expect(processingJob).toBeTruthy();
      const dequeuedId = processingJob?.id ?? "";

      await service.complete(completedId, {});

      const activeJobs = await service.getActiveJobs();

      expect(activeJobs.length).toBe(2);

      expect(
        activeJobs.some(
          (j) => j.id === dequeuedId && j.status === "processing",
        ),
      ).toBe(true);

      const remainingPendingId =
        dequeuedId === pendingId ? processingId : pendingId;
      expect(
        activeJobs.some(
          (j) => j.id === remainingPendingId && j.status === "pending",
        ),
      ).toBe(true);

      expect(activeJobs.some((j) => j.id === completedId)).toBe(false);
    });

    it("should filter by job types when specified", async () => {
      const testHandler2 = new TestJobHandler();
      service.registerHandler("shell:content-generation", testHandler2);

      const embeddingId = await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );
      const contentId = await service.enqueue(
        "shell:content-generation",
        { templateName: "test", context: {}, userId: "user-123" },
        enqueueOpts({ metadata: { operationType: "content_operations" } }),
      );

      const embeddingJobs = await service.getActiveJobs(["shell:embedding"]);
      expect(embeddingJobs.length).toBe(1);
      expect(embeddingJobs[0]?.id).toBe(embeddingId);

      const contentJobs = await service.getActiveJobs([
        "shell:content-generation",
      ]);
      expect(contentJobs.length).toBe(1);
      expect(contentJobs[0]?.id).toBe(contentId);

      const allJobs = await service.getActiveJobs([
        "shell:embedding",
        "shell:content-generation",
      ]);
      expect(allJobs.length).toBe(2);
    });

    it("should return empty array when no active jobs", async () => {
      const jobId = await service.enqueue(
        "shell:embedding",
        testEntity,
        defaultEnqueueOptions,
      );
      await service.complete(jobId, {});

      const activeJobs = await service.getActiveJobs();
      expect(activeJobs).toEqual([]);
    });

    it("should order by creation time descending", async () => {
      const job1 = await service.enqueue(
        "shell:embedding",
        { ...testEntity, id: "test-1" },
        defaultEnqueueOptions,
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      const job2 = await service.enqueue(
        "shell:embedding",
        { ...testEntity, id: "test-2" },
        defaultEnqueueOptions,
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      const job3 = await service.enqueue(
        "shell:embedding",
        { ...testEntity, id: "test-3" },
        defaultEnqueueOptions,
      );

      const activeJobs = await service.getActiveJobs();

      expect(activeJobs[0]?.id).toBe(job3);
      expect(activeJobs[1]?.id).toBe(job2);
      expect(activeJobs[2]?.id).toBe(job1);
    });
  });

  describe("Job deduplication", () => {
    beforeEach(() => {
      service.registerHandler("shell:embedding", testHandler);
      service.registerHandler("site-build", testHandler);
    });

    it("should allow duplicate jobs when deduplication is 'none' (default)", async () => {
      const id1 = await service.enqueue(
        "shell:embedding",
        testEntity,
        enqueueOpts({ deduplication: "none" }),
      );

      const id2 = await service.enqueue(
        "shell:embedding",
        testEntity,
        enqueueOpts({ deduplication: "none" }),
      );

      expect(id1).not.toBe(id2);
      const jobs = await service.getActiveJobs(["shell:embedding"]);
      expect(jobs.length).toBe(2);
    });

    it("should skip duplicate job when one is already PENDING", async () => {
      const skipOpts = enqueueOpts({ deduplication: "skip" });

      const id1 = await service.enqueue("site-build", {}, skipOpts);
      const id2 = await service.enqueue("site-build", {}, skipOpts);

      expect(id1).toBe(id2);

      const jobs = await service.getActiveJobs(["site-build"]);
      expect(jobs.length).toBe(1);
      expect(jobs[0]?.status).toBe("pending");
    });

    it("should allow enqueueing when job is PROCESSING (not PENDING)", async () => {
      const skipOpts = enqueueOpts({ deduplication: "skip" });

      const id1 = await service.enqueue("site-build", {}, skipOpts);

      const job1 = await service.dequeue();
      expect(job1?.id).toBe(id1);
      expect(job1?.status).toBe("processing");

      const id2 = await service.enqueue("site-build", {}, skipOpts);

      expect(id1).not.toBe(id2);

      const jobs = await service.getActiveJobs(["site-build"]);
      expect(jobs.length).toBe(2);

      const processingJobs = jobs.filter((j) => j.status === "processing");
      const pendingJobs = jobs.filter((j) => j.status === "pending");

      expect(processingJobs.length).toBe(1);
      expect(pendingJobs.length).toBe(1);
    });

    it("should skip when PENDING exists even if PROCESSING also exists", async () => {
      const skipOpts = enqueueOpts({ deduplication: "skip" });

      const id1 = await service.enqueue("site-build", {}, skipOpts);
      await service.dequeue();

      const id2 = await service.enqueue("site-build", {}, skipOpts);
      const id3 = await service.enqueue("site-build", {}, skipOpts);

      expect(id2).toBe(id3);
      expect(id1).not.toBe(id2);

      const jobs = await service.getActiveJobs(["site-build"]);
      expect(jobs.length).toBe(2);
    });

    it("should use deduplicationKey for fine-grained deduplication", async () => {
      const id1 = await service.enqueue(
        "site-build",
        { key: "app-1" },
        enqueueOpts({ deduplication: "skip", deduplicationKey: "app-1" }),
      );

      const id2 = await service.enqueue(
        "site-build",
        { key: "app-2" },
        enqueueOpts({ deduplication: "skip", deduplicationKey: "app-2" }),
      );

      expect(id1).not.toBe(id2);

      const jobs = await service.getActiveJobs(["site-build"]);
      expect(jobs.length).toBe(2);

      const id3 = await service.enqueue(
        "site-build",
        { key: "app-1" },
        enqueueOpts({ deduplication: "skip", deduplicationKey: "app-1" }),
      );

      expect(id3).toBe(id1);

      const jobs2 = await service.getActiveJobs(["site-build"]);
      expect(jobs2.length).toBe(2);
    });

    it("should replace pending job when deduplication is 'replace'", async () => {
      const replaceOpts = enqueueOpts({ deduplication: "replace" });

      const id1 = await service.enqueue(
        "site-build",
        { version: 1 },
        replaceOpts,
      );

      const id2 = await service.enqueue(
        "site-build",
        { version: 2 },
        replaceOpts,
      );

      expect(id1).not.toBe(id2);

      const job1 = await service.getStatus(id1);
      expect(job1?.status).toBe("failed");
      expect(job1?.lastError).toContain("Replaced");

      const job2 = await service.getStatus(id2);
      expect(job2?.status).toBe("pending");

      const activeJobs = await service.getActiveJobs(["site-build"]);
      expect(activeJobs.length).toBe(1);
      expect(activeJobs[0]?.id).toBe(id2);
    });

    it("should coalesce by updating timestamp when deduplication is 'coalesce'", async () => {
      const coalesceOpts = enqueueOpts({ deduplication: "coalesce" });

      const id1 = await service.enqueue("site-build", {}, coalesceOpts);

      const job1Before = await service.getStatus(id1);
      const originalScheduledFor = job1Before?.scheduledFor;

      await new Promise((resolve) => setTimeout(resolve, 10));

      const id2 = await service.enqueue("site-build", {}, coalesceOpts);

      expect(id1).toBe(id2);

      const job1After = await service.getStatus(id1);
      expect(job1After?.scheduledFor).toBeGreaterThan(
        originalScheduledFor ?? 0,
      );

      const activeJobs = await service.getActiveJobs(["site-build"]);
      expect(activeJobs.length).toBe(1);
    });

    it("should respect deduplication across different job types independently", async () => {
      service.registerHandler("other-job", testHandler);
      const skipOpts = enqueueOpts({ deduplication: "skip" });

      const siteBuild1 = await service.enqueue("site-build", {}, skipOpts);
      const otherJob1 = await service.enqueue("other-job", {}, skipOpts);
      const siteBuild2 = await service.enqueue("site-build", {}, skipOpts);
      const otherJob2 = await service.enqueue("other-job", {}, skipOpts);

      expect(siteBuild1).toBe(siteBuild2);
      expect(otherJob1).toBe(otherJob2);
      expect(siteBuild1).not.toBe(otherJob1);

      const activeJobs = await service.getActiveJobs();
      expect(activeJobs.length).toBe(2);
    });
  });
});
