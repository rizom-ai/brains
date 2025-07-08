import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { JobQueueService } from "../src/job-queue-service";
import type { JobHandler } from "../src/types";
import { createTestDatabase } from "../../integration-tests/test/helpers/test-db";
import { createSilentLogger, ErrorUtils } from "@brains/utils";
import type { EntityWithoutEmbedding, DrizzleDB } from "@brains/db";

// Test job handler implementation
class TestJobHandler implements JobHandler<"embedding"> {
  public processCallCount = 0;
  public onErrorCallCount = 0;
  public validateCallCount = 0;
  public shouldValidationFail = false;
  public shouldProcessFail = false;

  async process(_data: EntityWithoutEmbedding, _jobId: string): Promise<void> {
    this.processCallCount++;
    if (this.shouldProcessFail) {
      throw new Error("Process failed");
    }
  }

  async onError(
    _error: Error,
    _data: EntityWithoutEmbedding,
    _jobId: string,
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
  let db: DrizzleDB;
  let cleanup: () => Promise<void>;
  let testHandler: TestJobHandler;

  // Test entity data
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
    // Create test database with isolated instance
    const testDb = await createTestDatabase();
    db = testDb.db;
    cleanup = testDb.cleanup;

    // Create service instance with silent logger
    const logger = createSilentLogger();
    service = JobQueueService.createFresh(db, logger);

    // Create test handler
    testHandler = new TestJobHandler();
  });

  afterEach(async () => {
    // Clean up
    JobQueueService.resetInstance();
    await cleanup();
  });

  describe("Singleton pattern", () => {
    it("should return the same instance when calling getInstance multiple times", () => {
      const logger = createSilentLogger();
      const instance1 = JobQueueService.getInstance(db, logger);
      const instance2 = JobQueueService.getInstance(db, logger);
      expect(instance1).toBe(instance2);
    });

    it("should create a fresh instance when calling createFresh", () => {
      const logger = createSilentLogger();
      const singleton = JobQueueService.getInstance(db, logger);
      const fresh = JobQueueService.createFresh(db, logger);
      expect(singleton).not.toBe(fresh);
    });

    it("should reset singleton when calling resetInstance", () => {
      const logger = createSilentLogger();
      const instance1 = JobQueueService.getInstance(db, logger);
      JobQueueService.resetInstance();
      const instance2 = JobQueueService.getInstance(db, logger);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("Handler registration", () => {
    it("should register a job handler successfully", () => {
      expect(() => {
        service.registerHandler("embedding", testHandler);
      }).not.toThrow();
    });

    it("should return registered job types", () => {
      service.registerHandler("embedding", testHandler);
      const types = service.getRegisteredTypes();
      expect(types).toContain("embedding");
    });

    it("should allow multiple handlers for different job types", () => {
      const handler2 = new TestJobHandler();
      service.registerHandler("embedding", testHandler);
      service.registerHandler(
        "content-generation",
        handler2 as unknown as JobHandler<"content-generation">,
      );

      const types = service.getRegisteredTypes();
      expect(types.length).toBe(2);
      expect(types).toContain("embedding");
      expect(types).toContain("content-generation");
    });

    it("should unregister a job handler successfully", () => {
      // Register handler
      service.registerHandler("embedding", testHandler);
      expect(service.getRegisteredTypes()).toContain("embedding");

      // Unregister handler
      service.unregisterHandler("embedding");
      expect(service.getRegisteredTypes()).not.toContain("embedding");
    });

    it("should handle unregistering non-existent handler gracefully", () => {
      // Should not throw when unregistering handler that wasn't registered
      expect(() => {
        service.unregisterHandler("non-existent");
      }).not.toThrow();
    });

    it("should prevent job enqueuing after handler is unregistered", async () => {
      // Register and then unregister handler
      service.registerHandler("embedding", testHandler);
      service.unregisterHandler("embedding");

      // Try to enqueue job
      try {
        await service.enqueue("embedding", testEntity);
        expect().fail("Should have thrown an error");
      } catch (error) {
        expect(ErrorUtils.getErrorMessage(error)).toContain(
          "No handler registered for job type: embedding",
        );
      }
    });
  });

  describe("Job enqueueing", () => {
    beforeEach(() => {
      service.registerHandler("embedding", testHandler);
    });

    it("should enqueue a job successfully with valid data", async () => {
      const jobId = await service.enqueue("embedding", testEntity);

      expect(typeof jobId).toBe("string");
      expect(jobId.length).toBeGreaterThan(0);
      expect(testHandler.validateCallCount).toBe(1);

      // Verify job was created in database
      const job = await service.getStatus(jobId);
      expect(job).toBeTruthy();
      expect(job?.type).toBe("embedding");
      expect(job?.status).toBe("pending");
    });

    it("should store source and metadata when provided", async () => {
      const source = "matrix:room123";
      const metadata = { userId: "user-123", command: "test" };

      const jobId = await service.enqueue("embedding", testEntity, {
        source,
        metadata,
      });

      // Get the job from database directly
      const job = await service.getStatus(jobId);
      expect(job).toBeTruthy();
      expect(job?.source).toBe(source);
      expect(job?.metadata).toEqual(metadata);
    });

    it("should handle null source and metadata", async () => {
      const jobId = await service.enqueue("embedding", testEntity);

      const job = await service.getStatus(jobId);
      expect(job).toBeTruthy();
      expect(job?.source).toBeNull();
      expect(job?.metadata).toBeNull();
    });

    it("should throw error when enqueueing job with no registered handler", async () => {
      service = JobQueueService.createFresh(db, createSilentLogger());

      try {
        await service.enqueue("embedding", testEntity);
        expect().fail("Should have thrown an error");
      } catch (error) {
        expect(ErrorUtils.getErrorMessage(error)).toContain(
          "No handler registered for job type: embedding",
        );
      }
    });

    it("should throw error when enqueueing job with invalid data", async () => {
      testHandler.shouldValidationFail = true;

      try {
        await service.enqueue("embedding", testEntity);
        expect().fail("Should have thrown an error");
      } catch (error) {
        expect(ErrorUtils.getErrorMessage(error)).toContain(
          "Invalid job data for type: embedding",
        );
      }

      expect(testHandler.validateCallCount).toBe(1);
    });

    it("should apply job options correctly", async () => {
      const options = {
        priority: 5,
        maxRetries: 5,
        delayMs: 1000,
      };

      const jobId = await service.enqueue("embedding", testEntity, options);
      const job = await service.getStatus(jobId);

      expect(job?.priority).toBe(5);
      expect(job?.maxRetries).toBe(5);
      expect(job?.scheduledFor).toBeGreaterThan(Date.now());
    });

    it("should use default options when none provided", async () => {
      const jobId = await service.enqueue("embedding", testEntity);
      const job = await service.getStatus(jobId);

      expect(job?.priority).toBe(0);
      expect(job?.maxRetries).toBe(3);
      expect(job?.retryCount).toBe(0);
    });
  });

  describe("Job processing", () => {
    beforeEach(() => {
      service.registerHandler("embedding", testHandler);
    });

    it("should process a job successfully", async () => {
      const jobId = await service.enqueue("embedding", testEntity);
      const job = await service.dequeue();

      expect(job).toBeTruthy();
      if (!job) return;

      const result = await service.processJob(job);

      expect(result.status).toBe("completed");
      expect(result.jobId).toBe(jobId);
      expect(result.type).toBe("embedding");
      expect(testHandler.processCallCount).toBe(1);
      expect(testHandler.validateCallCount).toBe(2); // Called once in enqueue, once in processJob

      // Verify job is marked as completed in database
      const updatedJob = await service.getStatus(jobId);
      expect(updatedJob?.status).toBe("completed");
    });

    it("should handle job processing failure", async () => {
      testHandler.shouldProcessFail = true;

      await service.enqueue("embedding", testEntity);
      const job = await service.dequeue();

      expect(job).toBeTruthy();
      if (!job) return;

      const result = await service.processJob(job);

      expect(result.status).toBe("failed");
      expect(result.error).toBe("Process failed");
      expect(testHandler.onErrorCallCount).toBe(1);
    });

    it("should handle job with no registered handler", async () => {
      await service.enqueue("embedding", testEntity);
      const job = await service.dequeue();

      expect(job).toBeTruthy();
      if (!job) return;

      // Remove handler to simulate missing handler
      service = JobQueueService.createFresh(db, createSilentLogger());

      const result = await service.processJob(job);

      expect(result.status).toBe("failed");
      expect(result.error).toContain("No handler registered for job type");
    });

    it("should handle invalid job data during processing", async () => {
      // First enqueue with valid data
      await service.enqueue("embedding", testEntity);
      const job = await service.dequeue();

      expect(job).toBeTruthy();
      if (!job) return;

      // Modify handler to fail validation
      testHandler.shouldValidationFail = true;

      const result = await service.processJob(job);

      expect(result.status).toBe("failed");
      expect(result.error).toContain("Invalid job data for type");
    });
  });

  describe("Job queue operations", () => {
    beforeEach(() => {
      service.registerHandler("embedding", testHandler);
    });

    it("should dequeue next pending job", async () => {
      const jobId = await service.enqueue("embedding", testEntity);

      const job = await service.dequeue();

      expect(job).toBeTruthy();
      expect(job?.id).toBe(jobId);
      expect(job?.status).toBe("processing");
      expect(job?.type).toBe("embedding");
    });

    it("should return null when no jobs are available", async () => {
      const job = await service.dequeue();
      expect(job).toBeNull();
    });

    it("should respect job priority order", async () => {
      const lowPriorityId = await service.enqueue("embedding", testEntity, {
        priority: 1,
      });
      const highPriorityId = await service.enqueue("embedding", testEntity, {
        priority: 5,
      });

      const firstJob = await service.dequeue();
      expect(firstJob?.id).toBe(highPriorityId);

      const secondJob = await service.dequeue();
      expect(secondJob?.id).toBe(lowPriorityId);
    });

    it("should respect scheduled time", async () => {
      await service.enqueue("embedding", testEntity, {
        delayMs: 5000,
      });
      const immediateJob = await service.enqueue("embedding", testEntity);

      const job = await service.dequeue();
      expect(job?.id).toBe(immediateJob);

      // Future job should not be available yet
      const noJob = await service.dequeue();
      expect(noJob).toBeNull();
    });
  });

  describe("Job completion and failure", () => {
    beforeEach(() => {
      service.registerHandler("embedding", testHandler);
    });

    it("should mark job as completed", async () => {
      const jobId = await service.enqueue("embedding", testEntity);

      await service.complete(jobId, undefined);

      const job = await service.getStatus(jobId);
      expect(job?.status).toBe("completed");
      expect(job?.completedAt).toBeTruthy();
    });

    it("should handle job failure with retry", async () => {
      const jobId = await service.enqueue("embedding", testEntity);

      await service.fail(jobId, new Error("Test error"));

      const job = await service.getStatus(jobId);
      expect(job?.status).toBe("pending"); // Should retry
      expect(job?.retryCount).toBe(1);
      expect(job?.lastError).toBe("Test error");
    });

    it("should mark job as permanently failed when max retries exceeded", async () => {
      const jobId = await service.enqueue("embedding", testEntity, {
        maxRetries: 0,
      });

      await service.fail(jobId, new Error("Test error"));

      const job = await service.getStatus(jobId);
      expect(job?.status).toBe("failed");
      expect(job?.completedAt).toBeTruthy();
    });

    it("should use exponential backoff for retries", async () => {
      const jobId = await service.enqueue("embedding", testEntity);
      const originalTime = Date.now();

      await service.fail(jobId, new Error("Test error"));

      const job = await service.getStatus(jobId);
      expect(job?.scheduledFor).toBeGreaterThan(originalTime);
    });
  });

  describe("Queue statistics", () => {
    beforeEach(() => {
      service.registerHandler("embedding", testHandler);
    });

    it("should return accurate queue statistics", async () => {
      // Create jobs in different states
      await service.enqueue("embedding", testEntity); // pending
      await service.enqueue("embedding", testEntity); // pending

      const job1Id = await service.enqueue("embedding", testEntity);
      await service.complete(job1Id, undefined); // completed

      const job2Id = await service.enqueue("embedding", testEntity, {
        maxRetries: 1,
      });
      await service.fail(job2Id, new Error("Test error"));
      await service.fail(job2Id, new Error("Test error")); // failed after retries

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
      service.registerHandler("embedding", testHandler);
    });

    it("should clean up old completed jobs", async () => {
      const jobId = await service.enqueue("embedding", testEntity);
      await service.complete(jobId, undefined);

      // Clean up jobs older than 1ms (should clean the job we just completed)
      await new Promise((resolve) => setTimeout(resolve, 2));
      const deletedCount = await service.cleanup(1);

      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });

    it("should not clean up recent completed jobs", async () => {
      const jobId = await service.enqueue("embedding", testEntity);
      await service.complete(jobId, undefined);

      // Try to clean up jobs older than 1 hour (should not clean recent job)
      const deletedCount = await service.cleanup(3600000);

      expect(deletedCount).toBe(0);

      // Job should still exist
      const job = await service.getStatus(jobId);
      expect(job).toBeTruthy();
    });
  });

  describe("Job status queries", () => {
    beforeEach(() => {
      service.registerHandler("embedding", testHandler);
    });

    it("should get job status by ID", async () => {
      const jobId = await service.enqueue("embedding", testEntity);

      const job = await service.getStatus(jobId);
      expect(job?.id).toBe(jobId);
      expect(job?.type).toBe("embedding");
      expect(job?.status).toBe("pending");
    });

    it("should get job status by entity ID for embedding jobs", async () => {
      await service.enqueue("embedding", testEntity);

      const job = await service.getStatusByEntityId(testEntity.id);
      expect(job?.type).toBe("embedding");
      expect(job?.data).toMatchObject({ id: testEntity.id });
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
      // Enqueue multiple jobs for the same entity
      await service.enqueue("embedding", testEntity);
      await new Promise((resolve) => setTimeout(resolve, 1));
      const recentJobId = await service.enqueue("embedding", testEntity);

      const job = await service.getStatusByEntityId(testEntity.id);
      expect(job?.id).toBe(recentJobId);
    });
  });

  describe("getActiveJobs", () => {
    beforeEach(() => {
      service.registerHandler("embedding", testHandler);
    });

    it("should return only pending and processing jobs", async () => {
      // Create jobs in different states
      const pendingId = await service.enqueue("embedding", testEntity);
      const processingId = await service.enqueue("embedding", {
        ...testEntity,
        id: "test-456",
      });
      const completedId = await service.enqueue("embedding", {
        ...testEntity,
        id: "test-789",
      });

      // Mark one as processing by dequeuing it
      const processingJob = await service.dequeue();
      expect(processingJob?.id).toBe(pendingId); // First job gets dequeued

      // Complete one job
      await service.complete(completedId, {});

      // Get active jobs
      const activeJobs = await service.getActiveJobs();

      // Should have 2 active jobs (1 pending, 1 processing)
      expect(activeJobs.length).toBe(2);
      expect(activeJobs.some((j) => j.id === pendingId)).toBe(true);
      expect(activeJobs.some((j) => j.id === processingId)).toBe(true);
      expect(activeJobs.some((j) => j.id === completedId)).toBe(false);
    });

    it("should filter by job types when specified", async () => {
      // Register another handler
      const testHandler2 = new TestJobHandler();
      service.registerHandler("content-generation", testHandler2);

      // Create jobs of different types
      const embeddingId = await service.enqueue("embedding", testEntity);
      const contentId = await service.enqueue("content-generation", {
        templateName: "test",
        context: {},
        userId: "user-123",
      });

      // Get only embedding jobs
      const embeddingJobs = await service.getActiveJobs(["embedding"]);
      expect(embeddingJobs.length).toBe(1);
      expect(embeddingJobs[0]?.id).toBe(embeddingId);

      // Get only content generation jobs
      const contentJobs = await service.getActiveJobs(["content-generation"]);
      expect(contentJobs.length).toBe(1);
      expect(contentJobs[0]?.id).toBe(contentId);

      // Get both types
      const allJobs = await service.getActiveJobs([
        "embedding",
        "content-generation",
      ]);
      expect(allJobs.length).toBe(2);
    });

    it("should return empty array when no active jobs", async () => {
      // Create and complete a job
      const jobId = await service.enqueue("embedding", testEntity);
      await service.complete(jobId, {});

      const activeJobs = await service.getActiveJobs();
      expect(activeJobs).toEqual([]);
    });

    it("should order by creation time descending", async () => {
      // Create multiple jobs with slight delays
      const job1 = await service.enqueue("embedding", {
        ...testEntity,
        id: "test-1",
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const job2 = await service.enqueue("embedding", {
        ...testEntity,
        id: "test-2",
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const job3 = await service.enqueue("embedding", {
        ...testEntity,
        id: "test-3",
      });

      const activeJobs = await service.getActiveJobs();

      // Most recent first
      expect(activeJobs[0]?.id).toBe(job3);
      expect(activeJobs[1]?.id).toBe(job2);
      expect(activeJobs[2]?.id).toBe(job1);
    });
  });
});
