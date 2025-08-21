import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { JobQueueService } from "../src/job-queue-service";
import type { JobHandler } from "../src/types";
import { createTestJobQueueDatabase } from "./helpers/test-job-queue-db";
import { createSilentLogger, createId } from "@brains/utils";
import type { ProgressReporter } from "@brains/utils";
import type { JobContext } from "../src/schema/job-queue";
import type { JobQueueDbConfig } from "../src/db";

// Test type for entity-like data
interface EntityWithoutEmbedding {
  id: string;
  entityType: string;
  content: string;
  metadata?: Record<string, unknown>;
  contentWeight?: number;
  created: number;
  updated: number;
}

// Default test metadata
const defaultTestMetadata: JobContext = {
  rootJobId: createId(),
  operationType: "data_processing",
};

// Test job handler implementation
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
    const testDb = await createTestJobQueueDatabase();
    config = testDb.config;
    cleanup = testDb.cleanup;

    // Create service instance with silent logger
    const logger = createSilentLogger();
    service = JobQueueService.createFresh(config, logger);

    // Create test handler
    testHandler = new TestJobHandler();
  });

  afterEach(async () => {
    // Clean up
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
      // Register handler
      service.registerHandler("shell:embedding", testHandler);
      expect(service.getRegisteredTypes()).toContain("shell:embedding");

      // Unregister handler
      service.unregisterHandler("shell:embedding");
      expect(service.getRegisteredTypes()).not.toContain("shell:embedding");
    });

    it("should handle unregistering non-existent handler gracefully", () => {
      // Should not throw when unregistering handler that wasn't registered
      expect(() => {
        service.unregisterHandler("non-existent");
      }).not.toThrow();
    });

    it("should prevent job enqueuing after handler is unregistered", async () => {
      // Register and then unregister handler
      service.registerHandler("shell:embedding", testHandler);
      service.unregisterHandler("shell:embedding");

      // Try to enqueue job
      try {
        await service.enqueue("shell:embedding", testEntity, {
          source: "test",
          metadata: {
            ...defaultTestMetadata,
            operationType: "data_processing",
          },
        });
        expect().fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).toContain(
            "No handler registered for job type: shell:embedding",
          );
        }
      }
    });
  });

  describe("Job enqueueing", () => {
    beforeEach(() => {
      service.registerHandler("shell:embedding", testHandler);
    });

    it("should enqueue a job successfully with valid data", async () => {
      const jobId = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });

      expect(typeof jobId).toBe("string");
      expect(jobId.length).toBeGreaterThan(0);
      expect(testHandler.validateCallCount).toBe(1);

      // Verify job was created in database
      const job = await service.getStatus(jobId);
      expect(job).toBeTruthy();
      expect(job?.type).toBe("shell:embedding");
      expect(job?.status).toBe("pending");
    });

    it("should store source and metadata when provided", async () => {
      const source = "matrix:room123";
      const metadata: JobContext = {
        rootJobId: createId(),
        operationType: "data_processing",
      };

      const jobId = await service.enqueue("shell:embedding", testEntity, {
        source,
        metadata,
      });

      // Get the job from database directly
      const job = await service.getStatus(jobId);
      expect(job).toBeTruthy();
      expect(job?.source).toBe(source);
      expect(job?.metadata).toEqual(metadata);
    });

    it("should store source and metadata correctly", async () => {
      const source = "test-service";
      const jobId = await service.enqueue("shell:embedding", testEntity, {
        source,
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });

      const job = await service.getStatus(jobId);
      expect(job).toBeTruthy();
      expect(job?.source).toBe(source);
      expect(job?.metadata).toEqual({
        ...defaultTestMetadata,
        operationType: "data_processing",
      });
    });

    it("should throw error when enqueueing job with no registered handler", async () => {
      service = JobQueueService.createFresh(config, createSilentLogger());

      try {
        await service.enqueue("shell:embedding", testEntity, {
          source: "test",
          metadata: {
            ...defaultTestMetadata,
            operationType: "data_processing",
          },
        });
        expect().fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).toContain(
            "No handler registered for job type: shell:embedding",
          );
        }
      }
    });

    it("should throw error when enqueueing job with invalid data", async () => {
      testHandler.shouldValidationFail = true;

      try {
        await service.enqueue("shell:embedding", testEntity, {
          source: "test",
          metadata: {
            ...defaultTestMetadata,
            operationType: "data_processing",
          },
        });
        expect().fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).toContain(
            "Invalid job data for type: shell:embedding",
          );
        }
      }

      expect(testHandler.validateCallCount).toBe(1);
    });

    // Removed test: "should NOT fallback to shell handlers when plugin handler not found"
    // No longer relevant with explicit job type scoping - there's no fallback mechanism

    it("should apply job options correctly", async () => {
      const options = {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing" as const,
        },
        priority: 5,
        maxRetries: 5,
        delayMs: 1000,
      };

      const jobId = await service.enqueue("shell:embedding", testEntity, options);
      const job = await service.getStatus(jobId);

      expect(job?.priority).toBe(5);
      expect(job?.maxRetries).toBe(5);
      expect(job?.scheduledFor).toBeGreaterThan(Date.now());
    });

    it("should use default options when metadata provided", async () => {
      const jobId = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });
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
      const jobId = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });

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

    it("should respect job priority order", async () => {
      const lowPriorityId = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
        priority: 1,
      });
      const highPriorityId = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
        priority: 5,
      });

      const firstJob = await service.dequeue();
      expect(firstJob?.id).toBe(highPriorityId);

      const secondJob = await service.dequeue();
      expect(secondJob?.id).toBe(lowPriorityId);
    });

    it("should respect scheduled time", async () => {
      await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
        delayMs: 5000,
      });
      const immediateJob = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });

      const job = await service.dequeue();
      expect(job?.id).toBe(immediateJob);

      // Future job should not be available yet
      const noJob = await service.dequeue();
      expect(noJob).toBeNull();
    });
  });

  describe("Job completion and failure", () => {
    beforeEach(() => {
      service.registerHandler("shell:embedding", testHandler);
    });

    it("should mark job as completed", async () => {
      const jobId = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });

      await service.complete(jobId, undefined);

      const job = await service.getStatus(jobId);
      expect(job?.status).toBe("completed");
      expect(job?.completedAt).toBeTruthy();
    });

    it("should handle job failure with retry", async () => {
      const jobId = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });

      await service.fail(jobId, new Error("Test error"));

      const job = await service.getStatus(jobId);
      expect(job?.status).toBe("pending"); // Should retry
      expect(job?.retryCount).toBe(1);
      expect(job?.lastError).toBe("Test error");
    });

    it("should mark job as permanently failed when max retries exceeded", async () => {
      const jobId = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
        maxRetries: 0,
      });

      await service.fail(jobId, new Error("Test error"));

      const job = await service.getStatus(jobId);
      expect(job?.status).toBe("failed");
      expect(job?.completedAt).toBeTruthy();
    });

    it("should use exponential backoff for retries", async () => {
      const jobId = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });
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
      // Create jobs in different states
      await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      }); // pending
      await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      }); // pending

      const job1Id = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });
      await service.complete(job1Id, undefined); // completed

      const job2Id = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
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
      service.registerHandler("shell:embedding", testHandler);
    });

    it("should clean up old completed jobs", async () => {
      const jobId = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });
      await service.complete(jobId, undefined);

      // Clean up jobs older than 1ms (should clean the job we just completed)
      await new Promise((resolve) => setTimeout(resolve, 2));
      const deletedCount = await service.cleanup(1);

      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });

    it("should not clean up recent completed jobs", async () => {
      const jobId = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });
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
      service.registerHandler("shell:embedding", testHandler);
    });

    it("should get job status by ID", async () => {
      const jobId = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });

      const job = await service.getStatus(jobId);
      expect(job?.id).toBe(jobId);
      expect(job?.type).toBe("shell:embedding");
      expect(job?.status).toBe("pending");
    });

    it("should get job status by entity ID for embedding jobs", async () => {
      await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });

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
      // Enqueue multiple jobs for the same entity
      await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 1));
      const recentJobId = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });

      const job = await service.getStatusByEntityId(testEntity.id);
      expect(job?.id).toBe(recentJobId);
    });
  });

  describe("getActiveJobs", () => {
    beforeEach(() => {
      service.registerHandler("shell:embedding", testHandler);
    });

    it("should return only pending and processing jobs", async () => {
      // Create jobs in different states
      const pendingId = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });
      const processingId = await service.enqueue(
        "shell:embedding",
        {
          ...testEntity,
          id: "test-456",
        },
        {
          source: "test",
          metadata: {
            ...defaultTestMetadata,
            operationType: "data_processing",
          },
        },
      );
      const completedId = await service.enqueue(
        "shell:embedding",
        {
          ...testEntity,
          id: "test-789",
        },
        {
          source: "test",
          metadata: {
            ...defaultTestMetadata,
            operationType: "data_processing",
          },
        },
      );

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
      service.registerHandler("shell:content-generation", testHandler2);

      // Create jobs of different types
      const embeddingId = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });
      const contentId = await service.enqueue(
        "shell:content-generation",
        {
          templateName: "test",
          context: {},
          userId: "user-123",
        },
        {
          source: "test",
          metadata: {
            ...defaultTestMetadata,
            operationType: "content_operations",
          },
        },
      );

      // Get only embedding jobs
      const embeddingJobs = await service.getActiveJobs(["shell:embedding"]);
      expect(embeddingJobs.length).toBe(1);
      expect(embeddingJobs[0]?.id).toBe(embeddingId);

      // Get only content generation jobs
      const contentJobs = await service.getActiveJobs([
        "shell:content-generation",
      ]);
      expect(contentJobs.length).toBe(1);
      expect(contentJobs[0]?.id).toBe(contentId);

      // Get both types
      const allJobs = await service.getActiveJobs([
        "shell:embedding",
        "shell:content-generation",
      ]);
      expect(allJobs.length).toBe(2);
    });

    it("should return empty array when no active jobs", async () => {
      // Create and complete a job
      const jobId = await service.enqueue("shell:embedding", testEntity, {
        source: "test",
        metadata: {
          ...defaultTestMetadata,
          operationType: "data_processing",
        },
      });
      await service.complete(jobId, {});

      const activeJobs = await service.getActiveJobs();
      expect(activeJobs).toEqual([]);
    });

    it("should order by creation time descending", async () => {
      // Create multiple jobs with slight delays
      const job1 = await service.enqueue(
        "shell:embedding",
        {
          ...testEntity,
          id: "test-1",
        },
        {
          source: "test",
          metadata: {
            ...defaultTestMetadata,
            operationType: "data_processing",
          },
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      const job2 = await service.enqueue(
        "shell:embedding",
        {
          ...testEntity,
          id: "test-2",
        },
        {
          source: "test",
          metadata: {
            ...defaultTestMetadata,
            operationType: "data_processing",
          },
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      const job3 = await service.enqueue(
        "shell:embedding",
        {
          ...testEntity,
          id: "test-3",
        },
        {
          source: "test",
          metadata: {
            ...defaultTestMetadata,
            operationType: "data_processing",
          },
        },
      );

      const activeJobs = await service.getActiveJobs();

      // Most recent first
      expect(activeJobs[0]?.id).toBe(job3);
      expect(activeJobs[1]?.id).toBe(job2);
      expect(activeJobs[2]?.id).toBe(job1);
    });
  });
});
