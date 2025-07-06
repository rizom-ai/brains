import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { BatchJobManager } from "../src/batch-job-manager";
import { JobQueueService } from "../src/job-queue-service";
import type { JobHandler } from "../src/types";
import type { BatchOperation, BatchJobData } from "../src/schemas";
import { JOB_STATUS, BatchJobDataSchema } from "../src/schemas";
import { createTestDatabase } from "../../integration-tests/test/helpers/test-db";
import { createSilentLogger } from "@brains/utils";
import type { DrizzleDB } from "@brains/db";

// Mock batch operation handler
class BatchOperationHandler {
  public processCallCount = 0;
  public shouldFail = false;

  async process(_data: BatchJobData, _jobId: string): Promise<void> {
    this.processCallCount++;
    if (this.shouldFail) {
      throw new Error("Batch operation failed");
    }
    // Process batch operations here
  }

  async onError(_error: Error, _data: BatchJobData, _jobId: string): Promise<void> {
    // No-op for tests
  }

  validateAndParse(data: unknown): BatchJobData | null {
    const result = BatchJobDataSchema.safeParse(data);
    return result.success ? result.data : null;
  }
}

describe("BatchJobManager", () => {
  let batchManager: BatchJobManager;
  let jobQueueService: JobQueueService;
  let db: DrizzleDB;
  let cleanup: () => Promise<void>;
  let batchHandler: BatchOperationHandler;

  beforeEach(async () => {
    // Create test database
    const dbResult = await createTestDatabase();
    db = dbResult.db;
    cleanup = dbResult.cleanup;

    // Create services
    const logger = createSilentLogger();
    jobQueueService = JobQueueService.createFresh(db, logger);
    batchManager = BatchJobManager.createFresh(jobQueueService, logger);

    // Register batch operation handler
    batchHandler = new BatchOperationHandler();
    jobQueueService.registerHandler("batch-operation", batchHandler as unknown as JobHandler);
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

      const batchId = await batchManager.enqueueBatch(operations);

      expect(batchId).toBeDefined();
      expect(typeof batchId).toBe("string");

      // Verify the job was created
      const job = await jobQueueService.getStatus(batchId);
      expect(job).toBeDefined();
      expect(job?.type).toBe("batch-operation");
      expect(job?.status).toBe(JOB_STATUS.PENDING);
    });

    it("should enqueue batch with options", async () => {
      const operations: BatchOperation[] = [
        { type: "embedding", entityId: "entity-1" },
      ];

      const batchId = await batchManager.enqueueBatch(operations, {
        userId: "user-123",
        priority: 5,
        maxRetries: 1,
      });

      const job = await jobQueueService.getStatus(batchId);
      expect(job?.priority).toBe(5);
      expect(job?.maxRetries).toBe(1);
    });

    it("should throw error for empty batch", async () => {
      expect(async () => {
        await batchManager.enqueueBatch([]);
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

      const batchId = await batchManager.enqueueBatch(operations);
      const status = await batchManager.getBatchStatus(batchId);

      expect(status).toBeDefined();
      expect(status?.batchId).toBe(batchId);
      expect(status?.totalOperations).toBe(1);
      expect(status?.completedOperations).toBe(0);
      expect(status?.failedOperations).toBe(0);
      expect(status?.status).toBe(JOB_STATUS.PENDING);
      expect(status?.errors).toEqual([]);
    });

    it("should parse batch data from job data", async () => {
      const operations: BatchOperation[] = [
        { type: "embedding", entityId: "entity-1" },
        { type: "embedding", entityId: "entity-2" },
      ];

      const batchId = await batchManager.enqueueBatch(operations);
      const status = await batchManager.getBatchStatus(batchId);

      expect(status?.totalOperations).toBe(2);
    });
  });

  describe("updateBatchProgress", () => {
    it("should update batch progress and keep processing status", async () => {
      const operations: BatchOperation[] = [
        { type: "embedding", entityId: "entity-1" },
        { type: "embedding", entityId: "entity-2" },
        { type: "embedding", entityId: "entity-3" },
      ];

      const batchId = await batchManager.enqueueBatch(operations);

      // Update progress - partial completion
      await batchManager.updateBatchProgress(batchId, {
        completedOperations: 1,
        currentOperation: "Processing entity-2",
      });

      const status = await batchManager.getBatchStatus(batchId);
      expect(status?.completedOperations).toBe(1);
      expect(status?.currentOperation).toBe("Processing entity-2");
      expect(status?.status).toBe(JOB_STATUS.PROCESSING);
    });

    it("should mark batch as completed when all operations finish", async () => {
      const operations: BatchOperation[] = [
        { type: "embedding", entityId: "entity-1" },
      ];

      const batchId = await batchManager.enqueueBatch(operations);

      // Complete all operations
      await batchManager.updateBatchProgress(batchId, {
        completedOperations: 1,
      });

      const status = await batchManager.getBatchStatus(batchId);
      expect(status?.status).toBe(JOB_STATUS.COMPLETED);

      // Verify job was marked as completed
      const job = await jobQueueService.getStatus(batchId);
      expect(job?.status).toBe(JOB_STATUS.COMPLETED);
    });

    it("should mark batch as failed when some operations fail", async () => {
      const operations: BatchOperation[] = [
        { type: "embedding", entityId: "entity-1" },
        { type: "embedding", entityId: "entity-2" },
      ];

      const batchId = await batchManager.enqueueBatch(operations, {
        maxRetries: 0, // Ensure job fails immediately
      });

      // Complete with failures
      await batchManager.updateBatchProgress(batchId, {
        completedOperations: 1,
        failedOperations: 1,
        errors: ["Failed to process entity-2"],
      });

      const status = await batchManager.getBatchStatus(batchId);
      expect(status?.status).toBe(JOB_STATUS.FAILED);
      expect(status?.failedOperations).toBe(1);
      expect(status?.errors).toContain("Failed to process entity-2");

      // Verify job was marked as failed
      const job = await jobQueueService.getStatus(batchId);
      expect(job?.status).toBe(JOB_STATUS.FAILED);
    });

    it("should accumulate errors from multiple updates", async () => {
      const operations: BatchOperation[] = [
        { type: "embedding", entityId: "entity-1" },
        { type: "embedding", entityId: "entity-2" },
      ];

      const batchId = await batchManager.enqueueBatch(operations);

      // First update with error
      await batchManager.updateBatchProgress(batchId, {
        failedOperations: 1,
        errors: ["Error 1"],
      });

      // Second update with another error
      await batchManager.updateBatchProgress(batchId, {
        completedOperations: 1,
        errors: ["Error 2"],
      });

      const status = await batchManager.getBatchStatus(batchId);
      expect(status?.errors).toEqual(["Error 1", "Error 2"]);
    });

    it("should throw error for non-existent batch", async () => {
      expect(async () => {
        await batchManager.updateBatchProgress("non-existent", {
          completedOperations: 1,
        });
      }).toThrow("Batch non-existent not found");
    });
  });
});