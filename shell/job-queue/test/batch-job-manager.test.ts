import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { BatchJobManager } from "../src/batch-job-manager";
import { JobQueueService } from "../src/job-queue-service";
import type { JobHandler, JobQueueDbConfig } from "../src/types";
import type { BatchOperation } from "../src/batch-schemas";
import type { JobOptions } from "../src/schema/types";
import { JOB_STATUS } from "../src/schemas";
import { createTestJobQueueDatabase } from "./helpers/test-job-queue-db";
import { createSilentLogger } from "@brains/test-utils";
import { createId } from "@brains/utils";

const defaultBatchOptions: JobOptions = {
  source: "test:batch-manager",
  metadata: { operationType: "data_processing" },
};

function batchOpts(overrides: Partial<JobOptions> = {}): JobOptions {
  return { ...defaultBatchOptions, ...overrides };
}

class MockEmbeddingHandler {
  public processCallCount = 0;
  public shouldFail = false;

  async process(_data: unknown, _jobId: string): Promise<void> {
    this.processCallCount++;
    if (this.shouldFail) {
      throw new Error("Embedding operation failed");
    }
  }

  async onError(_error: Error, _data: unknown, _jobId: string): Promise<void> {}

  validateAndParse(data: unknown): unknown {
    return data;
  }
}

describe("BatchJobManager", () => {
  let batchManager: BatchJobManager;
  let jobQueueService: JobQueueService;
  let config: JobQueueDbConfig;
  let cleanup: () => Promise<void>;
  let embeddingHandler: MockEmbeddingHandler;

  beforeEach(async () => {
    const dbResult = await createTestJobQueueDatabase();
    config = dbResult.config;
    cleanup = dbResult.cleanup;

    const logger = createSilentLogger();
    jobQueueService = JobQueueService.createFresh(config, logger);
    batchManager = BatchJobManager.createFresh(jobQueueService, logger);

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

  function enqueueBatch(
    operations: BatchOperation[],
    options: JobOptions = defaultBatchOptions,
    batchId: string = createId(),
  ): Promise<string> {
    return batchManager.enqueueBatch(operations, options, batchId);
  }

  describe("enqueueBatch", () => {
    it("should enqueue a batch of operations successfully", async () => {
      const operations: BatchOperation[] = [
        {
          type: "embedding",
          data: { entityId: "entity-1", entityType: "note" },
        },
        {
          type: "embedding",
          data: { entityId: "entity-2", entityType: "note" },
        },
      ];

      const batchId = createId();
      const returnedBatchId = await batchManager.enqueueBatch(
        operations,
        defaultBatchOptions,
        batchId,
      );

      expect(returnedBatchId).toBe(batchId);

      const status = await batchManager.getBatchStatus(batchId);
      expect(status).toBeDefined();
      expect(status?.totalOperations).toBe(2);
      expect(status?.status).toBe(JOB_STATUS.PROCESSING);
    });

    it("should enqueue batch with options", async () => {
      const batchId = createId();
      const returnedBatchId = await batchManager.enqueueBatch(
        [{ type: "embedding", data: { entityId: "entity-1" } }],
        batchOpts({ priority: 5, maxRetries: 1 }),
        batchId,
      );
      expect(returnedBatchId).toBe(batchId);

      const status = await batchManager.getBatchStatus(batchId);
      expect(status).toBeDefined();
      expect(status?.totalOperations).toBe(1);
    });

    it("should throw error for empty batch", async () => {
      expect(async () => {
        await enqueueBatch([]);
      }).toThrow("Cannot enqueue empty batch");
    });
  });

  describe("getBatchStatus", () => {
    it("should return null for non-existent batch", async () => {
      const status = await batchManager.getBatchStatus("non-existent");
      expect(status).toBeNull();
    });

    it("should return basic status for simple batch", async () => {
      const batchId = createId();
      await batchManager.enqueueBatch(
        [{ type: "embedding", data: { entityId: "entity-1" } }],
        defaultBatchOptions,
        batchId,
      );
      const status = await batchManager.getBatchStatus(batchId);

      expect(status).toBeDefined();
      expect(status?.batchId).toBe(batchId);
      expect(status?.totalOperations).toBe(1);
      expect(status?.completedOperations).toBe(0);
      expect(status?.failedOperations).toBe(0);
      expect(status?.status).toBe(JOB_STATUS.PROCESSING);
      expect(status?.errors).toEqual([]);
    });

    it("should track multiple operations in batch", async () => {
      const batchId = createId();
      await batchManager.enqueueBatch(
        [
          { type: "embedding", data: { entityId: "entity-1" } },
          { type: "embedding", data: { entityId: "entity-2" } },
        ],
        defaultBatchOptions,
        batchId,
      );
      const status = await batchManager.getBatchStatus(batchId);

      expect(status?.totalOperations).toBe(2);
      expect(status?.batchId).toBe(batchId);
    });
  });

  describe("batch status tracking", () => {
    it("should show correct status as jobs complete", async () => {
      const batchId = createId();
      await batchManager.enqueueBatch(
        [{ type: "embedding", data: { entityId: "entity-1" } }],
        defaultBatchOptions,
        batchId,
      );
      const status = await batchManager.getBatchStatus(batchId);

      expect(status?.totalOperations).toBe(1);
      expect(status?.completedOperations).toBe(0);
      expect(status?.failedOperations).toBe(0);
    });

    it("should handle cleanup of old batches", async () => {
      const batchId = createId();
      await batchManager.enqueueBatch(
        [{ type: "embedding", data: { entityId: "entity-1" } }],
        defaultBatchOptions,
        batchId,
      );

      const statusBefore = await batchManager.getBatchStatus(batchId);
      expect(statusBefore).toBeDefined();

      const cleaned = await batchManager.cleanup(0);
      expect(cleaned).toBe(0);

      const statusAfter = await batchManager.getBatchStatus(batchId);
      expect(statusAfter).toBeDefined();
    });
  });

  describe("getActiveBatches", () => {
    it("should return only active batches", async () => {
      const batch1Id = createId();
      await batchManager.enqueueBatch(
        [{ type: "embedding", data: { entityId: "entity-1" } }],
        defaultBatchOptions,
        batch1Id,
      );

      const batch2Id = createId();
      await batchManager.enqueueBatch(
        [
          { type: "embedding", data: { entityId: "entity-2" } },
          { type: "embedding", data: { entityId: "entity-3" } },
        ],
        defaultBatchOptions,
        batch2Id,
      );

      const batch3Id = createId();
      const returnedBatch3Id = await batchManager.enqueueBatch(
        [{ type: "embedding", data: { entityId: "entity-4" } }],
        defaultBatchOptions,
        batch3Id,
      );
      expect(returnedBatch3Id).toBe(batch3Id);

      const job = await jobQueueService.dequeue();
      if (job) {
        await jobQueueService.complete(job.id, {});
      }

      const activeBatches = await batchManager.getActiveBatches();

      expect(activeBatches.length).toBeGreaterThanOrEqual(2);

      for (const batch of activeBatches) {
        expect(batch.batchId).toBeDefined();
        expect(batch.status).toBeDefined();
        expect(batch.metadata).toBeDefined();
        expect(batch.metadata.operations).toBeInstanceOf(Array);
        expect(batch.metadata.startedAt).toBeDefined();
      }

      const batch3 = activeBatches.find((b) => b.batchId === batch3Id);
      expect(batch3?.metadata.metadata.rootJobId).toBeDefined();

      for (const batch of activeBatches) {
        expect(batch.metadata.source).toBe("test:batch-manager");
      }
    });

    it("should return empty array when no active batches", async () => {
      const batchId = createId();
      await batchManager.enqueueBatch(
        [{ type: "embedding", data: { entityId: "entity-1" } }],
        defaultBatchOptions,
        batchId,
      );

      const job = await jobQueueService.dequeue();
      if (job) {
        await jobQueueService.complete(job.id, {});
      }

      const activeBatches = await batchManager.getActiveBatches();

      expect(activeBatches.length).toBe(0);
    });

    it("should include processing batches", async () => {
      const batchId = createId();
      const returnedBatchId = await batchManager.enqueueBatch(
        [
          { type: "embedding", data: { entityId: "entity-1" } },
          { type: "embedding", data: { entityId: "entity-2" } },
        ],
        defaultBatchOptions,
        batchId,
      );
      expect(returnedBatchId).toBe(batchId);

      await jobQueueService.dequeue();

      const activeBatches = await batchManager.getActiveBatches();

      expect(activeBatches.length).toBe(1);
      expect(activeBatches[0]?.batchId).toBe(batchId);
      expect(activeBatches[0]?.status.status).toBe("processing");
    });
  });
});
