import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { EmbeddingQueueService } from "../../src/embedding-queue/embeddingQueueService";
import { EmbeddingQueueWorker } from "../../src/embedding-queue/embeddingQueueWorker";
import { createTestDatabase } from "../../../integration-tests/test/helpers/test-db";
import { createSilentLogger } from "@brains/utils";
import type { EntityWithoutEmbedding } from "../../src/embedding-queue/types";
import type { DrizzleDB } from "@brains/db";
import { entities, eq } from "@brains/db";
import type { IEmbeddingService } from "@brains/embedding-service";

describe("EmbeddingQueueWorker", () => {
  let worker: EmbeddingQueueWorker;
  let queueService: EmbeddingQueueService;
  let mockEmbeddingService: IEmbeddingService;
  let db: DrizzleDB;
  let cleanup: () => Promise<void>;

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
    // Create test database
    const testDb = await createTestDatabase();
    db = testDb.db;
    cleanup = testDb.cleanup;

    // Create mock embedding service
    mockEmbeddingService = {
      generateEmbedding: mock(async () => new Float32Array(384).fill(0.5)),
      generateEmbeddings: mock(async (texts: string[]) =>
        texts.map(() => new Float32Array(384).fill(0.5)),
      ),
    };

    // Create services
    const logger = createSilentLogger();
    queueService = EmbeddingQueueService.createFresh(db, logger);
    worker = EmbeddingQueueWorker.createFresh(
      db,
      queueService,
      mockEmbeddingService,
      { pollInterval: 10 }, // Fast polling for tests
      logger,
    );
  });

  afterEach(async () => {
    // Stop worker and clean up
    worker.stop();
    EmbeddingQueueService.resetInstance();
    EmbeddingQueueWorker.resetInstance();
    await cleanup();
  });

  describe("start/stop", () => {
    it("should start and stop the worker", async () => {
      expect(worker.isRunning()).toBe(false);

      await worker.start();
      expect(worker.isRunning()).toBe(true);

      worker.stop();
      expect(worker.isRunning()).toBe(false);
    });

    it("should handle multiple start calls", async () => {
      await worker.start();
      expect(worker.isRunning()).toBe(true);

      // Second start should not throw
      await worker.start();
      expect(worker.isRunning()).toBe(true);
    });

    it("should handle stop when not running", () => {
      expect(() => worker.stop()).not.toThrow();
    });
  });

  describe("job processing", () => {
    it("should process queued jobs", async () => {
      // Enqueue a job
      await queueService.enqueue(testEntity);

      // Start worker
      await worker.start();

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check that embedding was generated
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
        testEntity.content,
      );

      // Check that entity was saved
      const [savedEntity] = await db
        .select()
        .from(entities)
        .where(eq(entities.id, testEntity.id));

      expect(savedEntity).toBeDefined();
      expect(savedEntity?.id).toBe(testEntity.id);
      expect(savedEntity?.embedding).toBeDefined();

      // Check that job was completed
      const status = await queueService.getStatusByEntityId(testEntity.id);
      expect(status?.status).toBe("completed");
    });

    it("should process multiple jobs", async () => {
      // Enqueue multiple jobs
      const entity1 = { ...testEntity, id: "test-1" };
      const entity2 = { ...testEntity, id: "test-2" };
      const entity3 = { ...testEntity, id: "test-3" };

      await queueService.enqueue(entity1);
      await queueService.enqueue(entity2);
      await queueService.enqueue(entity3);

      // Start worker
      await worker.start();

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check all were processed
      const stats = await queueService.getStats();
      expect(stats.completed).toBe(3);
      expect(stats.pending).toBe(0);

      // Check all entities were saved
      const savedEntities = await db.select().from(entities);
      expect(savedEntities).toHaveLength(3);
    });

    it("should handle job failures", async () => {
      // Mock embedding service to fail
      mockEmbeddingService.generateEmbedding = mock(async () => {
        throw new Error("Embedding generation failed");
      });

      // Enqueue a job
      await queueService.enqueue(testEntity);

      // Start worker
      await worker.start();

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check that job was retried
      const status = await queueService.getStatusByEntityId(testEntity.id);
      expect(status?.status).toBe("pending");
      expect(status?.retryCount).toBeGreaterThan(0);
      expect(status?.lastError).toBe("Embedding generation failed");
    });

    it("should respect job priority", async () => {
      const processedIds: string[] = [];

      // Mock to track processing order
      mockEmbeddingService.generateEmbedding = mock(async (content: string) => {
        // Extract ID from content (hacky but works for test)
        const match = content.match(/test-(\w+)/);
        if (match) {
          processedIds.push(match[0]);
        }
        return new Float32Array(384).fill(0.5);
      });

      // Enqueue with different priorities
      await queueService.enqueue(
        { ...testEntity, id: "test-low", content: "test-low content" },
        { priority: 1 },
      );
      await queueService.enqueue(
        { ...testEntity, id: "test-high", content: "test-high content" },
        { priority: 10 },
      );
      await queueService.enqueue(
        { ...testEntity, id: "test-medium", content: "test-medium content" },
        { priority: 5 },
      );

      // Start worker
      await worker.start();

      // Wait for all to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check processing order
      expect(processedIds[0]).toBe("test-high");
      expect(processedIds[1]).toBe("test-medium");
      expect(processedIds[2]).toBe("test-low");
    });
  });

  describe("worker statistics", () => {
    it("should report worker and queue statistics", async () => {
      // Enqueue some jobs
      await queueService.enqueue({ ...testEntity, id: "1" });
      await queueService.enqueue({ ...testEntity, id: "2" });

      // Get initial stats
      let stats = await worker.getStats();
      expect(stats.running).toBe(false);
      expect(stats.queueStats.pending).toBe(2);

      // Start worker
      await worker.start();
      stats = await worker.getStats();
      expect(stats.running).toBe(true);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check final stats
      stats = await worker.getStats();
      expect(stats.running).toBe(true);
      expect(stats.queueStats.completed).toBe(2);
      expect(stats.queueStats.pending).toBe(0);
    });
  });

  describe("cleanup and recovery", () => {
    it("should clean up old completed jobs", async () => {
      // Create and complete a job
      await queueService.enqueue(testEntity);
      await worker.start();

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify job was completed
      let stats = await queueService.getStats();
      expect(stats.completed).toBe(1);

      // Force cleanup (worker does this periodically)
      const cleaned = await queueService.cleanup(0); // Clean all completed
      expect(cleaned).toBe(1);

      // Verify cleanup
      stats = await queueService.getStats();
      expect(stats.completed).toBe(0);
      expect(stats.total).toBe(0);
    });

    it("should recover stuck jobs", async () => {
      // Manually create a stuck job by dequeuing without completing
      await queueService.enqueue(testEntity);
      const job = await queueService.dequeue();
      expect(job?.status).toBe("processing");

      // Reset stuck jobs (worker does this periodically)
      const reset = await queueService.resetStuckJobs(0); // Reset all processing
      expect(reset).toBe(1);

      // Verify job is back to pending
      const status = await queueService.getStatusByEntityId(testEntity.id);
      expect(status?.status).toBe("pending");

      // Now worker can process it
      await worker.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const finalStatus = await queueService.getStatusByEntityId(testEntity.id);
      expect(finalStatus?.status).toBe("completed");
    });
  });

  describe("concurrent workers", () => {
    it("should handle multiple workers safely", async () => {
      // Create a second worker
      const worker2 = EmbeddingQueueWorker.createFresh(
        db,
        queueService,
        mockEmbeddingService,
        { pollInterval: 10 },
        createSilentLogger(),
      );

      // Enqueue multiple jobs
      for (let i = 0; i < 10; i++) {
        await queueService.enqueue({ ...testEntity, id: `test-${i}` });
      }

      // Start both workers
      await worker.start();
      await worker2.start();

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Stop workers
      worker2.stop();

      // Check all jobs were processed
      const stats = await queueService.getStats();
      expect(stats.completed).toBe(10);
      expect(stats.pending).toBe(0);

      // Check no duplicates (each job processed once)
      const savedEntities = await db.select().from(entities);
      expect(savedEntities).toHaveLength(10);
      const ids = savedEntities.map((e) => e.id);
      expect(new Set(ids).size).toBe(10); // All unique
    });
  });
});
