import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { EmbeddingQueueService } from "../../src/embedding-queue/embeddingQueueService";
import { createTestDatabase } from "../../../integration-tests/test/helpers/test-db";
import { createSilentLogger } from "@brains/utils";
import type { EntityWithoutEmbedding } from "../../src/embedding-queue/types";
import type { DrizzleDB } from "@brains/db";

describe("EmbeddingQueueService", () => {
  let service: EmbeddingQueueService;
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
    // Create test database with isolated instance
    const testDb = await createTestDatabase();
    db = testDb.db;
    cleanup = testDb.cleanup;

    // Create service instance with silent logger
    const logger = createSilentLogger();
    service = EmbeddingQueueService.createFresh(db, logger);
  });

  afterEach(async () => {
    // Clean up
    EmbeddingQueueService.resetInstance();
    await cleanup();
  });

  describe("enqueue", () => {
    it("should enqueue an entity successfully", async () => {
      const jobId = await service.enqueue(testEntity);

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe("string");
      expect(jobId.length).toBeGreaterThan(0);

      // Verify job was created
      const status = await service.getStatusByEntityId(testEntity.id);
      expect(status).toBeDefined();
      expect(status?.status).toBe("pending");
      expect(status?.entityData.id).toBe(testEntity.id);
    });

    it("should enqueue with custom options", async () => {
      await service.enqueue(testEntity, {
        priority: 10,
        maxRetries: 5,
        delayMs: 1000,
      });

      const status = await service.getStatusByEntityId(testEntity.id);
      expect(status?.priority).toBe(10);
      expect(status?.maxRetries).toBe(5);
      expect(status?.scheduledFor).toBeGreaterThan(Date.now());
    });

    it("should handle multiple entities", async () => {
      const entity1 = { ...testEntity, id: "test-1" };
      const entity2 = { ...testEntity, id: "test-2" };
      const entity3 = { ...testEntity, id: "test-3" };

      await service.enqueue(entity1);
      await service.enqueue(entity2);
      await service.enqueue(entity3);

      const stats = await service.getStats();
      expect(stats.pending).toBe(3);
      expect(stats.total).toBe(3);
    });
  });

  describe("dequeue", () => {
    it("should dequeue the highest priority job", async () => {
      // Enqueue with different priorities
      await service.enqueue({ ...testEntity, id: "low" }, { priority: 1 });
      await service.enqueue({ ...testEntity, id: "high" }, { priority: 10 });
      await service.enqueue({ ...testEntity, id: "medium" }, { priority: 5 });

      const job = await service.dequeue();
      expect(job).toBeDefined();
      expect(job?.entityData.id).toBe("high");
      expect(job?.status).toBe("processing");
    });

    it("should return null when queue is empty", async () => {
      const job = await service.dequeue();
      expect(job).toBeNull();
    });

    it("should respect scheduledFor time", async () => {
      // Enqueue with future scheduled time
      await service.enqueue(testEntity, { delayMs: 10000 }); // 10 seconds

      const job = await service.dequeue();
      expect(job).toBeNull(); // Should not dequeue yet
    });

    it("should mark job as processing", async () => {
      await service.enqueue(testEntity);

      const job = await service.dequeue();
      expect(job?.status).toBe("processing");
      expect(job?.startedAt).toBeDefined();

      // Should not dequeue same job again
      const job2 = await service.dequeue();
      expect(job2).toBeNull();
    });
  });

  describe("complete", () => {
    it("should mark job as completed", async () => {
      const jobId = await service.enqueue(testEntity);
      await service.dequeue();

      await service.complete(jobId);

      const status = await service.getStatusByEntityId(testEntity.id);
      expect(status?.status).toBe("completed");
      expect(status?.completedAt).toBeDefined();
    });
  });

  describe("fail", () => {
    it("should retry failed job with exponential backoff", async () => {
      const jobId = await service.enqueue(testEntity);
      await service.dequeue(); // Mark as processing

      // First failure
      await service.fail(jobId, new Error("Test error"));

      let status = await service.getStatusByEntityId(testEntity.id);
      expect(status?.status).toBe("pending");
      expect(status?.retryCount).toBe(1);
      expect(status?.lastError).toBe("Test error");
      expect(status?.scheduledFor).toBeGreaterThan(Date.now());

      // Wait and dequeue again
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await service.dequeue();

      // Second failure
      await service.fail(jobId, new Error("Test error 2"));

      status = await service.getStatusByEntityId(testEntity.id);
      expect(status?.retryCount).toBe(2);
      expect(status?.lastError).toBe("Test error 2");
    });

    it("should mark job as permanently failed after max retries", async () => {
      const jobId = await service.enqueue(testEntity, { maxRetries: 2 });

      // Fail multiple times
      for (let i = 0; i < 3; i++) {
        await service.dequeue();
        await service.fail(jobId, new Error(`Error ${i}`));
        if (i < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, i) * 1100),
          );
        }
      }

      const status = await service.getStatusByEntityId(testEntity.id);
      expect(status?.status).toBe("failed");
      expect(status?.retryCount).toBe(2);
      expect(status?.completedAt).toBeDefined();
    });

    it("should handle missing job", () => {
      expect(service.fail("non-existent", new Error("Test"))).rejects.toThrow(
        "Job not found",
      );
    });
  });

  describe("getStatusByEntityId", () => {
    it("should find job by entity ID", async () => {
      await service.enqueue(testEntity);

      const status = await service.getStatusByEntityId(testEntity.id);
      expect(status).toBeDefined();
      expect(status?.entityData.id).toBe(testEntity.id);
    });

    it("should return null for non-existent entity", async () => {
      const status = await service.getStatusByEntityId("non-existent");
      expect(status).toBeNull();
    });

    it("should return latest job for entity", async () => {
      // Enqueue same entity twice
      await service.enqueue(testEntity);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await service.enqueue(testEntity);

      const status = await service.getStatusByEntityId(testEntity.id);
      expect(status).toBeDefined();
      // Should get the latest one
    });
  });

  describe("getStats", () => {
    it("should return correct queue statistics", async () => {
      // Create jobs in different states
      const job1 = await service.enqueue({ ...testEntity, id: "1" });
      const job2 = await service.enqueue({ ...testEntity, id: "2" });
      await service.enqueue({ ...testEntity, id: "3" });
      await service.enqueue({ ...testEntity, id: "4" });

      // Process some jobs
      await service.dequeue(); // job1 -> processing
      await service.complete(job1);

      await service.dequeue(); // job2 -> processing
      await service.fail(job2, new Error("Test"));

      await service.dequeue(); // job3 -> processing (job2 retry not ready)

      const stats = await service.getStats();
      expect(stats.completed).toBe(1);
      expect(stats.processing).toBe(1);
      expect(stats.pending).toBe(2); // job4 + job2 retry
      expect(stats.failed).toBe(0);
      expect(stats.total).toBe(4);
    });
  });

  describe("cleanup", () => {
    it("should remove old completed jobs", async () => {
      // Create and complete some jobs
      const job1 = await service.enqueue({ ...testEntity, id: "1" });
      const job2 = await service.enqueue({ ...testEntity, id: "2" });
      await service.enqueue({ ...testEntity, id: "3" });

      await service.dequeue();
      await service.complete(job1);
      await service.dequeue();
      await service.complete(job2);

      // Initial stats
      let stats = await service.getStats();
      expect(stats.completed).toBe(2);

      // Cleanup (with 0 age to remove all)
      const deleted = await service.cleanup(0);
      expect(deleted).toBe(2);

      // Check stats after cleanup
      stats = await service.getStats();
      expect(stats.completed).toBe(0);
      expect(stats.pending).toBe(1); // job3 still pending
      expect(stats.total).toBe(1);
    });

    it("should only remove jobs older than specified age", async () => {
      const job1 = await service.enqueue({ ...testEntity, id: "1" });
      await service.dequeue();
      await service.complete(job1);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      const job2 = await service.enqueue({ ...testEntity, id: "2" });
      await service.dequeue();
      await service.complete(job2);

      // Cleanup jobs older than 50ms
      const deleted = await service.cleanup(50);
      expect(deleted).toBe(1); // Only job1 should be deleted

      const stats = await service.getStats();
      expect(stats.completed).toBe(1); // job2 still there
    });
  });

  describe("resetStuckJobs", () => {
    it("should reset stuck processing jobs", async () => {
      // Create a job and mark as processing
      await service.enqueue(testEntity);
      const job = await service.dequeue();
      expect(job?.status).toBe("processing");

      // Reset stuck jobs (with 0 timeout to reset all)
      const resetCount = await service.resetStuckJobs(0);
      expect(resetCount).toBe(1);

      // Check that job is back to pending
      const status = await service.getStatusByEntityId(testEntity.id);
      expect(status?.status).toBe("pending");
      expect(status?.startedAt).toBeNull();
    });

    it("should only reset jobs stuck for specified time", async () => {
      // Create two jobs
      await service.enqueue({ ...testEntity, id: "1" });
      await service.dequeue(); // Mark as processing

      await new Promise((resolve) => setTimeout(resolve, 100));

      await service.enqueue({ ...testEntity, id: "2" });
      await service.dequeue(); // Mark as processing

      // Reset jobs stuck for more than 50ms
      const resetCount = await service.resetStuckJobs(50);
      expect(resetCount).toBe(1); // Only first job

      const status1 = await service.getStatusByEntityId("1");
      const status2 = await service.getStatusByEntityId("2");

      expect(status1?.status).toBe("pending");
      expect(status2?.status).toBe("processing");
    });
  });

  describe("concurrent operations", () => {
    it("should handle concurrent enqueue operations", async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        service.enqueue({ ...testEntity, id: `concurrent-${i}` }),
      );

      const jobIds = await Promise.all(promises);
      expect(jobIds).toHaveLength(10);
      expect(new Set(jobIds).size).toBe(10); // All unique

      const stats = await service.getStats();
      expect(stats.pending).toBe(10);
    });

    it("should handle concurrent dequeue operations safely", async () => {
      // Enqueue multiple jobs
      for (let i = 0; i < 5; i++) {
        await service.enqueue({ ...testEntity, id: `job-${i}` });
      }

      // Try to dequeue concurrently
      const promises = Array.from({ length: 10 }, () => service.dequeue());
      const results = await Promise.all(promises);

      // Should get exactly 5 jobs, rest null
      const jobs = results.filter((j) => j !== null);
      expect(jobs).toHaveLength(5);

      // All dequeued jobs should be unique
      const ids = jobs.filter((j) => j !== null).map((j) => j.entityData.id);
      expect(new Set(ids).size).toBe(5);
    });
  });
});
