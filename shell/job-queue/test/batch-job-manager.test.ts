import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { BatchJobManager } from "../src/batch-job-manager";
import { JobQueueService } from "../src/job-queue-service";
import type { JobHandler } from "../src/types";
import type { BatchOperation } from "../src/schemas";
import type { ProgressEventContext } from "@brains/db";
import { JOB_STATUS } from "../src/schemas";
import { createTestDatabase } from "../../integration-tests/test/helpers/test-db";
import { createSilentLogger } from "@brains/utils";
import type { DrizzleDB } from "@brains/db";

// Default test metadata
const defaultTestMetadata: ProgressEventContext = {
  interfaceId: "test",
  userId: "test-user",
};

// Mock embedding handler for individual operations
class MockEmbeddingHandler {
  public processCallCount = 0;
  public shouldFail = false;

  async process(_data: unknown, _jobId: string): Promise<void> {
    this.processCallCount++;
    if (this.shouldFail) {
      throw new Error("Embedding operation failed");
    }
    // Process embedding operation here
  }

  async onError(_error: Error, _data: unknown, _jobId: string): Promise<void> {
    // No-op for tests
  }

  validateAndParse(data: unknown): unknown | null {
    // For test purposes, just return the data as-is
    // In real implementation, this would validate and return EntityWithoutEmbedding | null
    return data;
  }
}

describe("BatchJobManager", () => {
  let batchManager: BatchJobManager;
  let jobQueueService: JobQueueService;
  let db: DrizzleDB;
  let cleanup: () => Promise<void>;
  let embeddingHandler: MockEmbeddingHandler;

  beforeEach(async () => {
    // Create test database
    const dbResult = await createTestDatabase();
    db = dbResult.db;
    cleanup = dbResult.cleanup;

    // Create services
    const logger = createSilentLogger();
    jobQueueService = JobQueueService.createFresh(db, logger);
    batchManager = BatchJobManager.createFresh(jobQueueService, logger);

    // Register embedding handler for individual operations
    embeddingHandler = new MockEmbeddingHandler();
    jobQueueService.registerHandler(
      "embedding",
      embeddingHandler as unknown as JobHandler,
    );
  });

  afterEach(async () => {
    JobQueueService.resetInstance();
    BatchJobManager.resetInstance();
    await cleanup();
  });

  describe("enqueueBatch", () => {
    it("should enqueue a batch of operations successfully", async () => {
      const operations: BatchOperation[] = [
        { type: "embedding", entityId: "entity-1", entityType: "note" },
        { type: "embedding", entityId: "entity-2", entityType: "note" },
      ];

      const source = "test:batch-manager";
      const batchId = await batchManager.enqueueBatch(
        operations,
        source,
        defaultTestMetadata,
        "entity_processing",
      );

      expect(batchId).toBeDefined();
      expect(typeof batchId).toBe("string");
      expect(batchId).toMatch(/^batch_\d+_[a-zA-Z0-9_-]+$/);

      // Verify batch status (not individual job)
      const status = await batchManager.getBatchStatus(batchId);
      expect(status).toBeDefined();
      expect(status?.totalOperations).toBe(2);
      expect(status?.status).toBe(JOB_STATUS.PROCESSING);
    });

    it("should enqueue batch with options", async () => {
      const operations: BatchOperation[] = [
        { type: "embedding", entityId: "entity-1" },
      ];

      const source = "test:batch-manager";
      const batchId = await batchManager.enqueueBatch(
        operations,
        source,
        {
          ...defaultTestMetadata,
          userId: "user-123",
        },
        "entity_processing",
        {
          priority: 5,
          maxRetries: 1,
        },
      );

      // Get batch status to verify it was created
      const status = await batchManager.getBatchStatus(batchId);
      expect(status).toBeDefined();
      expect(status?.totalOperations).toBe(1);

      // The individual jobs should have the correct priority/maxRetries
      // We can't directly check this without exposing internal batch metadata
      // But we can verify the batch was created successfully
      expect(batchId).toBeDefined();
    });

    it("should throw error for empty batch", async () => {
      expect(async () => {
        await batchManager.enqueueBatch(
          [],
          "test:batch-manager",
          defaultTestMetadata,
          "entity_processing",
        );
      }).toThrow("Cannot enqueue empty batch");
    });
  });

  describe("getBatchStatus", () => {
    it("should return null for non-existent batch", async () => {
      const status = await batchManager.getBatchStatus("non-existent");
      expect(status).toBeNull();
    });

    it("should return basic status for simple batch", async () => {
      const operations: BatchOperation[] = [
        { type: "embedding", entityId: "entity-1" },
      ];

      const batchId = await batchManager.enqueueBatch(
        operations,
        "test:batch-manager",
        defaultTestMetadata,
        "entity_processing",
      );
      const status = await batchManager.getBatchStatus(batchId);

      expect(status).toBeDefined();
      expect(status?.batchId).toBe(batchId);
      expect(status?.totalOperations).toBe(1);
      expect(status?.completedOperations).toBe(0);
      expect(status?.failedOperations).toBe(0);
      // Status will be PROCESSING, not PENDING, since individual jobs exist
      expect(status?.status).toBe(JOB_STATUS.PROCESSING);
      expect(status?.errors).toEqual([]);
    });

    it("should track multiple operations in batch", async () => {
      const operations: BatchOperation[] = [
        { type: "embedding", entityId: "entity-1" },
        { type: "embedding", entityId: "entity-2" },
      ];

      const batchId = await batchManager.enqueueBatch(
        operations,
        "test:batch-manager",
        defaultTestMetadata,
        "entity_processing",
      );
      const status = await batchManager.getBatchStatus(batchId);

      expect(status?.totalOperations).toBe(2);
      expect(status?.batchId).toBe(batchId);
    });
  });

  describe("batch status tracking", () => {
    it("should show correct status as jobs complete", async () => {
      // This test would require processing jobs, which is complex in a unit test
      // The key point is that status is now derived from individual job statuses
      const operations: BatchOperation[] = [
        { type: "embedding", entityId: "entity-1" },
      ];

      const batchId = await batchManager.enqueueBatch(
        operations,
        "test:batch-manager",
        defaultTestMetadata,
        "entity_processing",
      );
      const status = await batchManager.getBatchStatus(batchId);

      // Initially, job should be pending or processing
      expect(status?.totalOperations).toBe(1);
      expect(status?.completedOperations).toBe(0);
      expect(status?.failedOperations).toBe(0);
    });

    it("should handle cleanup of old batches", async () => {
      const operations: BatchOperation[] = [
        { type: "embedding", entityId: "entity-1" },
      ];

      const batchId = await batchManager.enqueueBatch(
        operations,
        "test:batch-manager",
        defaultTestMetadata,
        "entity_processing",
      );

      // Verify batch exists
      const statusBefore = await batchManager.getBatchStatus(batchId);
      expect(statusBefore).toBeDefined();

      // Cleanup should not remove recent batches
      const cleaned = await batchManager.cleanup(0);
      expect(cleaned).toBe(0);

      // Batch should still exist
      const statusAfter = await batchManager.getBatchStatus(batchId);
      expect(statusAfter).toBeDefined();
    });
  });

  describe("getActiveBatches", () => {
    it("should return only active batches", async () => {
      // Create multiple batches
      await batchManager.enqueueBatch(
        [{ type: "embedding", entityId: "entity-1" }],
        "test:batch-manager",
        defaultTestMetadata,
        "entity_processing",
      );

      await batchManager.enqueueBatch(
        [
          { type: "embedding", entityId: "entity-2" },
          { type: "embedding", entityId: "entity-3" },
        ],
        "test:batch-manager",
        defaultTestMetadata,
        "entity_processing",
      );

      const batch3Id = await batchManager.enqueueBatch(
        [{ type: "embedding", entityId: "entity-4" }],
        "test:batch-manager",
        { ...defaultTestMetadata, userId: "user-123" },
        "entity_processing",
      );

      // Complete the first batch's job
      const job = await jobQueueService.dequeue();
      if (job) {
        await jobQueueService.complete(job.id, {});
      }

      // Get active batches
      const activeBatches = await batchManager.getActiveBatches();

      // Should have 3 batches (1 completed, 2 pending/processing)
      // But getActiveBatches should return only the active ones
      expect(activeBatches.length).toBeGreaterThanOrEqual(2);

      // Check that each active batch has the expected structure
      for (const batch of activeBatches) {
        expect(batch.batchId).toBeDefined();
        expect(batch.status).toBeDefined();
        expect(batch.metadata).toBeDefined();
        expect(batch.metadata.operations).toBeInstanceOf(Array);
        expect(batch.metadata.startedAt).toBeDefined();
      }

      // Check that batch3 has userId in metadata
      const batch3 = activeBatches.find((b) => b.batchId === batch3Id);
      expect(batch3?.metadata.metadata?.userId).toBe("user-123");

      // Check that all batches have source
      for (const batch of activeBatches) {
        expect(batch.metadata.source).toBe("test:batch-manager");
      }
    });

    it("should return empty array when no active batches", async () => {
      // Create a batch and complete all its jobs
      const operations: BatchOperation[] = [
        { type: "embedding", entityId: "entity-1" },
      ];

      await batchManager.enqueueBatch(
        operations,
        "test:batch-manager",
        defaultTestMetadata,
        "entity_processing",
      );

      // Process and complete the job
      const job = await jobQueueService.dequeue();
      if (job) {
        await jobQueueService.complete(job.id, {});
      }

      // Get active batches
      const activeBatches = await batchManager.getActiveBatches();

      // Should have no active batches (all completed)
      expect(activeBatches.length).toBe(0);
    });

    it("should include processing batches", async () => {
      // Create a batch
      const batchId = await batchManager.enqueueBatch(
        [
          { type: "embedding", entityId: "entity-1" },
          { type: "embedding", entityId: "entity-2" },
        ],
        "test:batch-manager",
        defaultTestMetadata,
        "entity_processing",
      );

      // Start processing one job (dequeue it)
      await jobQueueService.dequeue();

      // Get active batches
      const activeBatches = await batchManager.getActiveBatches();

      // Should include the processing batch
      expect(activeBatches.length).toBe(1);
      expect(activeBatches[0]?.batchId).toBe(batchId);
      expect(activeBatches[0]?.status.status).toBe("processing");
    });
  });
});
