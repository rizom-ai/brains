import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { JobQueueService } from "../src/job-queue-service";
import type { JobHandler, JobQueueDbConfig } from "../src/types";
import type { JobOptions } from "../src/schema/types";
import { createTestJobQueueDatabase } from "./helpers/test-job-queue-db";
import { createSilentLogger } from "@brains/test-utils";
import { createId } from "@brains/utils/id";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { OperationContext } from "@brains/operation-context";
import { access, writeFile } from "node:fs/promises";
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

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await Bun.sleep(5);
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
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
  let dbPath: string;
  let testHandler: TestJobHandler;
  let operationContext: OperationContext;
  let reserveJobAdmission: ReturnType<typeof mock>;
  let commitJobAdmission: ReturnType<typeof mock>;
  let rollbackJobAdmission: ReturnType<typeof mock>;
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
    dbPath = testDb.dbPath;
    operationContext = OperationContext.createFresh();
    commitJobAdmission = mock(() => {});
    rollbackJobAdmission = mock(() => {});
    reserveJobAdmission = mock(async () => ({
      commit: commitJobAdmission,
      rollback: rollbackJobAdmission,
    }));
    service = JobQueueService.createFresh(config, createSilentLogger(), {
      operationContext,
      projectionAdmission: { reserveJobAdmission },
    });
    testHandler = new TestJobHandler();
  });
  afterEach(async () => {
    service.close();
    await cleanup();
  });
  describe("Database readiness", () => {
    it("initializes WAL mode once", async () => {
      const first = service.initialize();
      const second = service.initialize();

      expect(second).toBe(first);
      await first;
    });
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
        service.enqueue({
          type: "shell:embedding",
          data: testEntity,
          options: defaultEnqueueOptions,
        }),
      ).rejects.toThrow("No job type declared: shell:embedding");
    });

    it("freezes validation-only execution declarations without exposing handlers", async () => {
      const validationService = JobQueueService.createFresh(
        config,
        createSilentLogger(),
        { handlerRegistrationMode: "validation-only" },
      );
      try {
        validationService.registerHandler(
          "shell:embedding",
          testHandler,
          "shell",
        );
        const registrations = validationService.finalizeHandlerRegistrations();

        expect(Object.isFrozen(registrations)).toBe(true);
        expect(registrations).toEqual([
          { type: "shell:embedding", pluginId: "shell" },
        ]);
        expect(validationService.getRegisteredTypes()).toEqual([]);
        expect(validationService.getHandler("shell:embedding")).toBeUndefined();
        const jobId = await validationService.enqueue({
          type: "shell:embedding",
          data: testEntity,
          options: defaultEnqueueOptions,
        });
        expect(jobId).toBeString();
        expect(() =>
          validationService.registerHandler(
            "shell:content-generation",
            testHandler,
            "shell",
          ),
        ).toThrow("Job handler registrations are finalized");
      } finally {
        validationService.close();
      }
    });
  });
  describe("Job enqueueing", () => {
    beforeEach(() => {
      service.registerHandler("shell:embedding", testHandler);
    });
    it("should enqueue a job successfully with valid data", async () => {
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      expect(typeof jobId).toBe("string");
      expect(jobId.length).toBeGreaterThan(0);
      expect(testHandler.validateCallCount).toBe(1);
      const job = await service.getStatus(jobId);
      expect(job).toBeTruthy();
      expect(job?.type).toBe("shell:embedding");
      expect(job?.status).toBe("pending");
    });
    it("replays a stable idempotency key without inserting another job", async () => {
      const request = {
        type: "shell:embedding",
        data: testEntity,
        idempotencyKey: "stable-embedding-job",
        options: defaultEnqueueOptions,
      };

      const firstId = await service.enqueue(request);
      await service.complete(firstId, { embedded: true });
      const replayedId = await service.enqueue(request);

      expect(firstId).toBe("stable-embedding-job");
      expect(replayedId).toBe(firstId);
      expect((await service.getStatus(firstId))?.status).toBe("completed");
      expect((await service.getStats()).total).toBe(1);
    });

    it("rejects reuse of an idempotency key for different job data", async () => {
      const idempotencyKey = "conflicting-stable-job";
      await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        idempotencyKey,
        options: defaultEnqueueOptions,
      });

      const conflict = await service
        .enqueue({
          type: "shell:embedding",
          data: { ...testEntity, entityId: "different-entity" },
          idempotencyKey,
          options: defaultEnqueueOptions,
        })
        .catch((error: unknown) => error);
      expect(conflict).toBeInstanceOf(Error);
      if (!(conflict instanceof Error)) throw conflict;
      expect(conflict.message).toMatch(/already assigned to a different job/);
      expect((await service.getStats()).total).toBe(1);
    });

    it("rejects empty idempotency keys before queue admission", async () => {
      const rejection = await service
        .enqueue({
          type: "shell:embedding",
          data: testEntity,
          idempotencyKey: "",
          options: defaultEnqueueOptions,
        })
        .catch((error: unknown) => error);
      expect(rejection).toBeInstanceOf(Error);
      if (!(rejection instanceof Error)) throw rejection;
      expect(rejection.message).toMatch(/must not be empty/);
      expect((await service.getStats()).total).toBe(0);
    });

    it("freezes provenance before a prepared enqueue leaves its context", async () => {
      const parentProvenance = {
        rootJobId: "root-job",
        causationId: "parent-job",
        projectionId: "parent-projection",
        projectionLineage: ["parent-projection"],
        derivationDepth: 1,
      };
      const prepared = operationContext.run(
        parentProvenance,
        "entity-write",
        () =>
          service.prepareEnqueue({
            type: "shell:embedding",
            data: testEntity,
            options: enqueueOpts({
              projection: { id: "embedding-projection" },
            }),
          }),
      );

      const jobId = await service.enqueue(prepared.request);

      expect(jobId).toBe(prepared.jobId);
      expect((await service.getStatus(jobId))?.metadata.provenance).toEqual({
        rootJobId: "root-job",
        causationId: "entity-write",
        projectionId: "embedding-projection",
        projectionLineage: ["parent-projection", "embedding-projection"],
        derivationDepth: 2,
      });
    });

    it("should store source and metadata when provided", async () => {
      const source = "matrix:room123";
      const rootJobId = createId();
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: enqueueOpts({ source, rootJobId }),
      });
      const job = await service.getStatus(jobId);
      expect(job).toBeTruthy();
      expect(job?.source).toBe(source);
      expect(job?.metadata).toEqual({
        rootJobId,
        operationType: "data_processing",
        provenance: {
          rootJobId,
          causationId: jobId,
          projectionLineage: [],
          derivationDepth: 0,
        },
      });
    });
    it("inherits causal provenance and advances projection lineage", async () => {
      const parentProvenance = {
        rootJobId: "root-job",
        causationId: "topic-job",
        projectionId: "topics-projection",
        projectionLineage: ["topics-projection"],
        derivationDepth: 1,
      };

      const jobId = await operationContext.run(
        parentProvenance,
        "topics-message",
        () =>
          service.enqueue({
            type: "shell:embedding",
            data: testEntity,
            options: enqueueOpts({
              projection: {
                id: "skill-derivation",
                sourceEntity: {
                  entityType: "topic",
                  entityId: "runtime-resilience",
                  contentHash: "hash-1",
                },
              },
            }),
          }),
      );

      expect((await service.getStatus(jobId))?.metadata.provenance).toEqual({
        rootJobId: "root-job",
        causationId: "topics-message",
        projectionId: "skill-derivation",
        projectionLineage: ["topics-projection", "skill-derivation"],
        sourceEntity: {
          entityType: "topic",
          entityId: "runtime-resilience",
          contentHash: "hash-1",
        },
        derivationDepth: 2,
      });
    });

    it("starts a fresh projection lineage when the root changes", async () => {
      const parentProvenance = {
        rootJobId: "wave-1",
        causationId: "series-job-1",
        projectionId: "series-projection",
        projectionLineage: ["series-projection"],
        derivationDepth: 1,
      };

      const jobId = await operationContext.run(
        parentProvenance,
        "complete-wave-1",
        () =>
          service.enqueue({
            type: "shell:embedding",
            data: testEntity,
            options: enqueueOpts({
              rootJobId: "projection-wave:wave-2",
              projection: { id: "series-projection" },
            }),
          }),
      );

      expect((await service.getStatus(jobId))?.metadata.provenance).toEqual({
        rootJobId: "projection-wave:wave-2",
        causationId: jobId,
        projectionId: "series-projection",
        projectionLineage: ["series-projection"],
        derivationDepth: 1,
      });
    });

    it("creates provenance for a root projection job", async () => {
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: enqueueOpts({
          projection: { id: "topics-projection" },
        }),
      });

      const expectedProvenance = {
        rootJobId: jobId,
        causationId: jobId,
        projectionId: "topics-projection",
        projectionLineage: ["topics-projection"],
        derivationDepth: 1,
      };
      expect((await service.getStatus(jobId))?.metadata.provenance).toEqual(
        expectedProvenance,
      );
      expect(reserveJobAdmission).toHaveBeenCalledWith(expectedProvenance);
      expect(commitJobAdmission).toHaveBeenCalledTimes(1);
      expect(rollbackJobAdmission).not.toHaveBeenCalled();
    });

    it("should store source and metadata correctly", async () => {
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: enqueueOpts({ source: "test-service" }),
      });
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
        service.enqueue({
          type: "shell:embedding",
          data: testEntity,
          options: defaultEnqueueOptions,
        }),
      ).rejects.toThrow("No job type declared: shell:embedding");
    });
    it("should throw error when enqueueing job with invalid data", async () => {
      testHandler.shouldValidationFail = true;
      expect(
        service.enqueue({
          type: "shell:embedding",
          data: testEntity,
          options: defaultEnqueueOptions,
        }),
      ).rejects.toThrow("Invalid job data for type: shell:embedding");
      expect(testHandler.validateCallCount).toBe(1);
    });
    it("should apply job options correctly", async () => {
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: enqueueOpts({ priority: 5, maxRetries: 5, delayMs: 1000 }),
      });
      const job = await service.getStatus(jobId);
      expect(job?.priority).toBe(5);
      expect(job?.maxRetries).toBe(5);
      expect(job?.scheduledFor).toBeGreaterThan(Date.now());
    });
    it("should use default options when metadata provided", async () => {
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
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

    it("claims work for an explicitly registered worker session", async () => {
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      await service.startWorkerSession("worker-a", "session-a");

      const job = await service.dequeue({
        workerSlotId: "worker-a",
        workerSessionId: "session-a",
        leaseDurationMs: 10_000,
      });

      expect(job).toMatchObject({
        id: jobId,
        status: "processing",
        workerSlotId: "worker-a",
        workerSessionId: "session-a",
      });
      expect(job?.attemptId).toBeString();
      expect(job?.leaseExpiresAt).toBeGreaterThan(Date.now());
    });

    it("fences an old service attempt after startup supersedes its stable slot", async () => {
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      const claim = {
        workerSlotId: "worker-a",
        workerSessionId: "session-a",
        leaseDurationMs: 60_000,
      };
      await service.startWorkerSession(
        claim.workerSlotId,
        claim.workerSessionId,
      );
      const first = await service.dequeue(claim);

      await service.startWorkerSession("worker-a", "session-b");
      const second = await service.dequeue({
        ...claim,
        workerSessionId: "session-b",
      });

      expect(second?.id).toBe(jobId);
      expect(second?.attemptId).not.toBe(first?.attemptId);
      expect(
        await service.complete(
          jobId,
          { stale: true },
          first?.attemptId ?? undefined,
        ),
      ).toBe(false);
      expect(
        await service.complete(
          jobId,
          { current: true },
          second?.attemptId ?? undefined,
        ),
      ).toBe(true);
      expect(await service.getStatus(jobId)).toMatchObject({
        status: "completed",
        result: { current: true },
      });
    });

    it("should dequeue next pending job", async () => {
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      const job = await service.dequeue();
      expect(job).toBeTruthy();
      expect(job?.id).toBe(jobId);
      expect(job?.status).toBe("processing");
      expect(job?.type).toBe("shell:embedding");
    });

    it("does not claim work without a local execution handler", async () => {
      const scheduler = JobQueueService.createFresh(
        config,
        createSilentLogger(),
        { handlerRegistrationMode: "validation-only" },
      );
      const successorWorker = JobQueueService.createFresh(
        config,
        createSilentLogger(),
        { handlerRegistrationMode: "execution-only" },
      );
      const projectionHandler =
        testHandler as unknown as JobHandler<"shell:projection-rule">;
      scheduler.registerHandler(
        "shell:projection-rule",
        projectionHandler,
        "shell",
      );
      successorWorker.registerHandler(
        "shell:projection-rule",
        projectionHandler,
        "shell",
      );

      try {
        const jobId = await scheduler.enqueue({
          type: "shell:projection-rule",
          data: testEntity,
          options: defaultEnqueueOptions,
        });

        expect(await service.dequeue()).toBeNull();
        expect(await service.getStatus(jobId)).toMatchObject({
          status: "pending",
          retryCount: 0,
        });
        expect(await successorWorker.dequeue()).toMatchObject({
          id: jobId,
          type: "shell:projection-rule",
          status: "processing",
        });
      } finally {
        scheduler.close();
        successorWorker.close();
      }
    });

    it("should not allow concurrent dequeue calls to claim the same job", async () => {
      const secondService = JobQueueService.createFresh(
        config,
        createSilentLogger(),
      );
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      try {
        const claimedJobs = await Promise.all([
          service.dequeue(),
          secondService.dequeue(),
        ]);
        expect(claimedJobs.filter((job) => job?.id === jobId)).toHaveLength(1);
        expect(claimedJobs.filter(Boolean)).toHaveLength(1);
      } finally {
        secondService.close();
      }
    });
    it("does not reclaim a direct caller's claim while its fallback session is live", async () => {
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      const firstClaim = await service.dequeue();
      const reclaimed = await service.dequeue();
      expect(firstClaim?.id).toBe(jobId);
      expect(reclaimed).toBeNull();
    });
    it("should return null when no jobs are available", async () => {
      const job = await service.dequeue();
      expect(job).toBeNull();
    });
    it("should respect job priority order (lower = higher priority)", async () => {
      const lowPriorityId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: enqueueOpts({ priority: 5 }),
      });
      const highPriorityId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: enqueueOpts({ priority: 1 }),
      });
      const firstJob = await service.dequeue();
      expect(firstJob?.id).toBe(highPriorityId);
      const secondJob = await service.dequeue();
      expect(secondJob?.id).toBe(lowPriorityId);
    });
    it("should respect scheduled time", async () => {
      await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: enqueueOpts({ delayMs: 5000 }),
      });
      const immediateJob = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
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
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      await service.complete(jobId, undefined);
      const job = await service.getStatus(jobId);
      expect(job?.status).toBe("completed");
      expect(job?.completedAt).toBeTruthy();
    });
    it("should clear stale lastError when a retried job completes", async () => {
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      await service.fail(jobId, new Error("Temporary failure"));
      await service.complete(jobId, { success: true });
      const job = await service.getStatus(jobId);
      expect(job?.status).toBe("completed");
      expect(job?.lastError).toBeNull();
    });
    it("should handle job failure with retry", async () => {
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      await service.fail(jobId, new Error("Test error"));
      const job = await service.getStatus(jobId);
      expect(job?.status).toBe("pending");
      expect(job?.retryCount).toBe(1);
      expect(job?.lastError).toBe("Test error");
    });
    it("should mark job as permanently failed when max retries exceeded", async () => {
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: enqueueOpts({ maxRetries: 0 }),
      });
      await service.fail(jobId, new Error("Test error"));
      const job = await service.getStatus(jobId);
      expect(job?.status).toBe("failed");
      expect(job?.completedAt).toBeTruthy();
    });
    it("should use exponential backoff for retries", async () => {
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      const originalTime = Date.now();
      await service.fail(jobId, new Error("Test error"));
      const job = await service.getStatus(jobId);
      expect(job?.scheduledFor).toBeGreaterThan(originalTime);
    });

    it("does not allow an unfenced caller to overwrite a terminal job", async () => {
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: enqueueOpts({ maxRetries: 0 }),
      });
      await service.fail(jobId, new Error("Terminal failure"));

      expect(await service.complete(jobId, { stale: true })).toBe(false);
      expect(await service.getStatus(jobId)).toMatchObject({
        status: "failed",
        lastError: "Terminal failure",
      });
    });
  });
  describe("Queue statistics", () => {
    beforeEach(() => {
      service.registerHandler("shell:embedding", testHandler);
    });
    it("should return accurate queue statistics", async () => {
      await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      const job1Id = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      await service.complete(job1Id, undefined);
      const job2Id = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: enqueueOpts({ maxRetries: 1 }),
      });
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
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      await service.complete(jobId, undefined);
      await new Promise((resolve) => setTimeout(resolve, 2));
      const deletedCount = await service.cleanup(1);
      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });
    it("should not clean up recent completed jobs", async () => {
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
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
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      const job = await service.getStatus(jobId);
      expect(job?.id).toBe(jobId);
      expect(job?.type).toBe("shell:embedding");
      expect(job?.status).toBe("pending");
    });
    it("should get job status by entity ID for embedding jobs", async () => {
      await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
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
      await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      await new Promise((resolve) => setTimeout(resolve, 1));
      const recentJobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
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
      const pendingId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      const processingId = await service.enqueue({
        type: "shell:embedding",
        data: { ...testEntity, id: "test-456" },
        options: defaultEnqueueOptions,
      });
      const completedId = await service.enqueue({
        type: "shell:embedding",
        data: { ...testEntity, id: "test-789" },
        options: defaultEnqueueOptions,
      });
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
      const embeddingId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      const contentId = await service.enqueue({
        type: "shell:content-generation",
        data: { templateName: "test", context: {}, userId: "user-123" },
        options: enqueueOpts({
          metadata: { operationType: "content_operations" },
        }),
      });
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
      const jobId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: defaultEnqueueOptions,
      });
      await service.complete(jobId, {});
      const activeJobs = await service.getActiveJobs();
      expect(activeJobs).toEqual([]);
    });
    it("should order by creation time descending", async () => {
      const job1 = await service.enqueue({
        type: "shell:embedding",
        data: { ...testEntity, id: "test-1" },
        options: defaultEnqueueOptions,
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const job2 = await service.enqueue({
        type: "shell:embedding",
        data: { ...testEntity, id: "test-2" },
        options: defaultEnqueueOptions,
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const job3 = await service.enqueue({
        type: "shell:embedding",
        data: { ...testEntity, id: "test-3" },
        options: defaultEnqueueOptions,
      });
      const activeJobs = await service.getActiveJobs();
      expect(activeJobs[0]?.id).toBe(job3);
      expect(activeJobs[1]?.id).toBe(job2);
      expect(activeJobs[2]?.id).toBe(job1);
    });
  });

  describe("getFailedJobs", () => {
    beforeEach(() => {
      service.registerHandler("shell:embedding", testHandler);
      service.registerHandler("site-build", testHandler);
    });

    it("should return failed jobs filtered by type", async () => {
      const embeddingId = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: enqueueOpts({ maxRetries: 0 }),
      });
      const siteBuildId = await service.enqueue({
        type: "site-build",
        data: { ...testEntity, id: "site-build-1" },
        options: enqueueOpts({ maxRetries: 0 }),
      });
      const activeId = await service.enqueue({
        type: "shell:embedding",
        data: { ...testEntity, id: "active-1" },
        options: defaultEnqueueOptions,
      });

      await service.fail(embeddingId, new Error("embedding failed"));
      await service.fail(siteBuildId, new Error("site build failed"));

      const failedEmbeddings = await service.getFailedJobs(["shell:embedding"]);

      expect(failedEmbeddings.map((job) => job.id)).toEqual([embeddingId]);
      expect(failedEmbeddings[0]?.lastError).toBe("embedding failed");
      expect(failedEmbeddings.some((job) => job.id === activeId)).toBe(false);
    });
  });

  describe("Job deduplication", () => {
    beforeEach(() => {
      service.registerHandler("shell:embedding", testHandler);
      service.registerHandler("site-build", testHandler);
    });
    it("should allow duplicate jobs when deduplication is 'none' (default)", async () => {
      const id1 = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: enqueueOpts({ deduplication: "none" }),
      });
      const id2 = await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: enqueueOpts({ deduplication: "none" }),
      });
      expect(id1).not.toBe(id2);
      const jobs = await service.getActiveJobs(["shell:embedding"]);
      expect(jobs.length).toBe(2);
    });
    it("should skip duplicate job when one is already PENDING", async () => {
      const skipOpts = enqueueOpts({ deduplication: "skip" });
      const id1 = await service.enqueue({
        type: "site-build",
        data: {},
        options: skipOpts,
      });
      const id2 = await service.enqueue({
        type: "site-build",
        data: {},
        options: skipOpts,
      });
      expect(id1).toBe(id2);
      const jobs = await service.getActiveJobs(["site-build"]);
      expect(jobs.length).toBe(1);
      expect(jobs[0]?.status).toBe("pending");
    });
    it("validates a skipped duplicate request before returning its id", async () => {
      const skipOpts = enqueueOpts({ deduplication: "skip" });
      await service.enqueue({
        type: "site-build",
        data: {},
        options: skipOpts,
      });
      testHandler.shouldValidationFail = true;

      void expect(
        service.enqueue({
          type: "site-build",
          data: { invalid: true },
          options: skipOpts,
        }),
      ).rejects.toThrow("Invalid job data for type: site-build");
      expect(testHandler.validateCallCount).toBe(2);
    });
    it("always inserts concurrent requests using none", async () => {
      await service.initialize();
      const ids = await Promise.all(
        Array.from({ length: 20 }, () =>
          service.enqueue({
            type: "site-build",
            data: {},
            options: enqueueOpts({ deduplication: "none" }),
          }),
        ),
      );

      expect(new Set(ids).size).toBe(20);
      expect(await service.getActiveJobs(["site-build"])).toHaveLength(20);
    });
    it("atomically skips repeated waves of twenty concurrent requests", async () => {
      await service.initialize();
      for (let wave = 0; wave < 3; wave++) {
        const ids = await Promise.all(
          Array.from({ length: 20 }, () =>
            service.enqueue({
              type: "site-build",
              data: {},
              options: enqueueOpts({
                deduplication: "skip",
                deduplicationKey: `site-build:preview-${wave}`,
              }),
            }),
          ),
        );
        expect(new Set(ids).size).toBe(1);
      }

      expect(await service.getActiveJobs(["site-build"])).toHaveLength(3);
    });
    it("atomically skips twenty concurrent requests across two clients", async () => {
      const secondService = JobQueueService.createFresh(
        config,
        createSilentLogger(),
        { projectionAdmission: { reserveJobAdmission } },
      );
      secondService.registerHandler("site-build", testHandler);
      try {
        await service.initialize();
        await secondService.initialize();
        const requests = Array.from({ length: 20 }, (_, index) =>
          (index % 2 === 0 ? service : secondService).enqueue({
            type: "site-build",
            data: {},
            options: enqueueOpts({
              deduplication: "skip",
              deduplicationKey: "site-build:production",
            }),
          }),
        );

        const ids = await Promise.all(requests);
        expect(new Set(ids).size).toBe(1);
        expect(await service.getActiveJobs(["site-build"])).toHaveLength(1);
      } finally {
        secondService.close();
      }
    });
    it("preserves atomic skip across independent processes", async () => {
      const startFile = `${dbPath}.start`;
      const readyFiles = [`${dbPath}.ready-a`, `${dbPath}.ready-b`];
      const fixturePath = new URL(
        "./fixtures/concurrent-enqueue-process.ts",
        import.meta.url,
      ).pathname;
      const children = readyFiles.map((readyFile) =>
        Bun.spawn(
          [
            "bun",
            fixturePath,
            config.url,
            startFile,
            readyFile,
            "site-build",
            "site-build:cross-process",
          ],
          { stdout: "pipe", stderr: "pipe" },
        ),
      );

      try {
        await Promise.all(readyFiles.map(waitForFile));
        await writeFile(startFile, "start");
        const outputs = await Promise.all(
          children.map(async (child) => {
            const [exitCode, stdout, stderr] = await Promise.all([
              child.exited,
              new Response(child.stdout).text(),
              new Response(child.stderr).text(),
            ]);
            if (exitCode !== 0) {
              throw new Error(`Concurrent enqueue process failed: ${stderr}`);
            }
            return z.array(z.string()).parse(JSON.parse(stdout));
          }),
        );

        expect(new Set(outputs.flat()).size).toBe(1);
        expect(await service.getActiveJobs(["site-build"])).toHaveLength(1);
      } finally {
        for (const child of children) child.kill();
      }
    });
    it("keeps concurrent keyed groups independent", async () => {
      await service.initialize();
      const ids = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          service.enqueue({
            type: "site-build",
            data: {},
            options: enqueueOpts({
              deduplication: "skip",
              deduplicationKey: `site-build:group-${index % 2}`,
            }),
          }),
        ),
      );

      expect(new Set(ids).size).toBe(2);
      expect(await service.getActiveJobs(["site-build"])).toHaveLength(2);
    });
    it("atomically replaces concurrent pending requests", async () => {
      await service.initialize();
      const ids = await Promise.all(
        Array.from({ length: 20 }, (_, version) =>
          service.enqueue({
            type: "site-build",
            data: { version },
            options: enqueueOpts({
              deduplication: "replace",
              deduplicationKey: "site-build:replace",
            }),
          }),
        ),
      );

      const active = await service.getActiveJobs(["site-build"]);
      const failed = await service.getFailedJobs(["site-build"]);
      expect(new Set(ids).size).toBe(20);
      expect(active).toHaveLength(1);
      expect(active[0]?.id).toBe(ids.at(-1));
      expect(failed).toHaveLength(19);
      expect(reserveJobAdmission).toHaveBeenCalledTimes(20);
      expect(commitJobAdmission).toHaveBeenCalledTimes(20);
      expect(rollbackJobAdmission).not.toHaveBeenCalled();
    });
    it("atomically coalesces concurrent active requests", async () => {
      await service.initialize();
      const ids = await Promise.all(
        Array.from({ length: 20 }, () =>
          service.enqueue({
            type: "site-build",
            data: {},
            options: enqueueOpts({
              deduplication: "coalesce",
              deduplicationKey: "site-build:coalesce",
            }),
          }),
        ),
      );

      expect(new Set(ids).size).toBe(1);
      expect(await service.getActiveJobs(["site-build"])).toHaveLength(1);
      expect(reserveJobAdmission).toHaveBeenCalledTimes(1);
      expect(commitJobAdmission).toHaveBeenCalledTimes(1);
      expect(rollbackJobAdmission).not.toHaveBeenCalled();
    });
    it("creates only one pending successor behind a processing job", async () => {
      await service.initialize();
      const options = enqueueOpts({
        deduplication: "skip",
        deduplicationKey: "site-build:successor",
      });
      const processingId = await service.enqueue({
        type: "site-build",
        data: {},
        options,
      });
      expect((await service.dequeue())?.id).toBe(processingId);
      reserveJobAdmission.mockClear();
      commitJobAdmission.mockClear();

      const ids = await Promise.all(
        Array.from({ length: 20 }, () =>
          service.enqueue({ type: "site-build", data: {}, options }),
        ),
      );
      const active = await service.getActiveJobs(["site-build"]);

      expect(new Set(ids).size).toBe(1);
      expect(ids[0]).not.toBe(processingId);
      expect(active.filter((job) => job.status === "processing")).toHaveLength(
        1,
      );
      expect(active.filter((job) => job.status === "pending")).toHaveLength(1);
      expect(reserveJobAdmission).toHaveBeenCalledTimes(1);
      expect(commitJobAdmission).toHaveBeenCalledTimes(1);
    });
    it("does not reserve admission for skipped or coalesced requests", async () => {
      const skipOptions = enqueueOpts({
        deduplication: "skip",
        deduplicationKey: "site-build:admission",
      });
      const firstId = await service.enqueue({
        type: "site-build",
        data: {},
        options: skipOptions,
      });
      expect(
        await service.enqueue({
          type: "site-build",
          data: {},
          options: skipOptions,
        }),
      ).toBe(firstId);
      expect(
        await service.enqueue({
          type: "site-build",
          data: {},
          options: enqueueOpts({
            deduplication: "coalesce",
            deduplicationKey: "site-build:admission",
          }),
        }),
      ).toBe(firstId);

      expect(reserveJobAdmission).toHaveBeenCalledTimes(1);
      expect(commitJobAdmission).toHaveBeenCalledTimes(1);
    });
    it("rolls back admission when insertion fails after reservation", async () => {
      void expect(
        service.enqueue({
          type: "site-build",
          data: {},
          options: enqueueOpts({
            deduplication: "skip",
            metadata: {
              operationType: "data_processing",
              unserializable: 1n,
            },
          }),
        }),
      ).rejects.toThrow();

      expect(reserveJobAdmission).toHaveBeenCalledTimes(1);
      expect(commitJobAdmission).not.toHaveBeenCalled();
      expect(rollbackJobAdmission).toHaveBeenCalledTimes(1);
      expect(await service.getActiveJobs(["site-build"])).toHaveLength(0);
    });
    it("rolls back the queue transaction when admission rejects", async () => {
      reserveJobAdmission.mockImplementationOnce(async () => {
        throw new Error("projection budget exhausted");
      });

      void expect(
        service.enqueue({
          type: "site-build",
          data: {},
          options: enqueueOpts({ deduplication: "skip" }),
        }),
      ).rejects.toThrow("projection budget exhausted");
      expect(commitJobAdmission).not.toHaveBeenCalled();
      expect(rollbackJobAdmission).not.toHaveBeenCalled();
      expect(await service.getActiveJobs(["site-build"])).toHaveLength(0);
    });
    it("treats an empty deduplication key as unkeyed", async () => {
      const firstId = await service.enqueue({
        type: "site-build",
        data: {},
        options: enqueueOpts({
          deduplication: "none",
          deduplicationKey: "site-build:keyed",
        }),
      });
      const secondId = await service.enqueue({
        type: "site-build",
        data: {},
        options: enqueueOpts({
          deduplication: "skip",
          deduplicationKey: "",
        }),
      });

      expect(secondId).toBe(firstId);
      expect(await service.getActiveJobs(["site-build"])).toHaveLength(1);
    });
    it("coalesces with the newest pending row before a processing row", async () => {
      const processingId = await service.enqueue({
        type: "site-build",
        data: { version: 1 },
        options: enqueueOpts({ deduplication: "none" }),
      });
      await service.dequeue();
      const pendingIds = await Promise.all([
        service.enqueue({
          type: "site-build",
          data: { version: 2 },
          options: enqueueOpts({ deduplication: "none" }),
        }),
        service.enqueue({
          type: "site-build",
          data: { version: 3 },
          options: enqueueOpts({ deduplication: "none" }),
        }),
      ]);
      const pendingRows = (await service.getActiveJobs(["site-build"]))
        .filter((job) => job.status === "pending")
        .sort(
          (left, right) =>
            right.createdAt - left.createdAt || right.id.localeCompare(left.id),
        );

      const selectedId = await service.enqueue({
        type: "site-build",
        data: { version: 4 },
        options: enqueueOpts({ deduplication: "coalesce" }),
      });

      const newestPending = pendingRows[0];
      expect(newestPending).toBeDefined();
      if (!newestPending) throw new Error("Expected a pending candidate");
      expect(pendingIds).toContain(selectedId);
      expect(selectedId).toBe(newestPending.id);
      expect(selectedId).not.toBe(processingId);
      expect(await service.getActiveJobs(["site-build"])).toHaveLength(3);
    });
    it("replaces only the deterministically selected pre-existing pending row", async () => {
      await Promise.all([
        service.enqueue({
          type: "site-build",
          data: { version: 1 },
          options: enqueueOpts({ deduplication: "none" }),
        }),
        service.enqueue({
          type: "site-build",
          data: { version: 2 },
          options: enqueueOpts({ deduplication: "none" }),
        }),
      ]);
      const pendingRows = (await service.getActiveJobs(["site-build"])).sort(
        (left, right) =>
          right.createdAt - left.createdAt || right.id.localeCompare(left.id),
      );
      const selected = pendingRows[0];
      expect(selected).toBeDefined();
      if (!selected) throw new Error("Expected a selected pending row");

      const replacementId = await service.enqueue({
        type: "site-build",
        data: { version: 3 },
        options: enqueueOpts({ deduplication: "replace" }),
      });
      const active = await service.getActiveJobs(["site-build"]);

      expect((await service.getStatus(selected.id))?.status).toBe("failed");
      expect(active).toHaveLength(2);
      expect(active.map((job) => job.id)).toContain(replacementId);
    });
    it("coalesces a processing row without changing attempt ownership", async () => {
      const jobId = await service.enqueue({
        type: "site-build",
        data: { version: 1 },
        options: enqueueOpts({ deduplication: "coalesce" }),
      });
      const claimed = await service.dequeue();
      expect(claimed?.id).toBe(jobId);

      const coalescedId = await service.enqueue({
        type: "site-build",
        data: { version: 2 },
        options: enqueueOpts({ deduplication: "coalesce" }),
      });
      const stored = await service.getStatus(jobId);

      expect(coalescedId).toBe(jobId);
      expect(stored).toMatchObject({
        status: "processing",
        data: claimed?.data,
        attemptId: claimed?.attemptId,
        workerSlotId: claimed?.workerSlotId,
        workerSessionId: claimed?.workerSessionId,
        leaseExpiresAt: claimed?.leaseExpiresAt,
        attemptHeartbeatAt: claimed?.attemptHeartbeatAt,
      });
    });
    it("settles an in-flight enqueue before closing and rejects later work", async () => {
      let releaseAdmission = (): void => {};
      let markAdmissionEntered = (): void => {};
      const admissionGate = new Promise<void>((resolve) => {
        releaseAdmission = resolve;
      });
      const admissionEntered = new Promise<void>((resolve) => {
        markAdmissionEntered = resolve;
      });
      reserveJobAdmission.mockImplementationOnce(async () => {
        markAdmissionEntered();
        await admissionGate;
        return {
          commit: commitJobAdmission,
          rollback: rollbackJobAdmission,
        };
      });
      const inFlight = service.enqueue({
        type: "site-build",
        data: {},
        options: enqueueOpts({ deduplication: "skip" }),
      });
      await admissionEntered;

      service.close();
      void expect(
        service.enqueue({
          type: "site-build",
          data: {},
          options: enqueueOpts({ deduplication: "skip" }),
        }),
      ).rejects.toThrow("queue service is closed");
      releaseAdmission();
      const jobId = await inFlight;

      const inspector = JobQueueService.createFresh(
        config,
        createSilentLogger(),
      );
      try {
        expect((await inspector.getStatus(jobId))?.status).toBe("pending");
      } finally {
        inspector.close();
      }
    });
    it("keeps worker claim and deduplicating enqueue in a sequential shape", async () => {
      await service.initialize();
      const options = enqueueOpts({
        deduplication: "skip",
        deduplicationKey: "site-build:claim-race",
      });
      const firstId = await service.enqueue({
        type: "site-build",
        data: {},
        options,
      });

      const [claimed, enqueuedId] = await Promise.all([
        service.dequeue(),
        service.enqueue({ type: "site-build", data: {}, options }),
      ]);
      const active = await service.getActiveJobs(["site-build"]);
      const pending = active.filter((job) => job.status === "pending");
      const processing = active.filter((job) => job.status === "processing");

      expect(claimed?.id).toBe(firstId);
      expect(processing).toHaveLength(1);
      expect(pending.length).toBeLessThanOrEqual(1);
      expect([firstId, pending[0]?.id]).toContain(enqueuedId);
    });
    it("should allow enqueueing when job is PROCESSING (not PENDING)", async () => {
      const skipOpts = enqueueOpts({ deduplication: "skip" });
      const id1 = await service.enqueue({
        type: "site-build",
        data: {},
        options: skipOpts,
      });
      const job1 = await service.dequeue();
      expect(job1?.id).toBe(id1);
      expect(job1?.status).toBe("processing");
      const id2 = await service.enqueue({
        type: "site-build",
        data: {},
        options: skipOpts,
      });
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
      const id1 = await service.enqueue({
        type: "site-build",
        data: {},
        options: skipOpts,
      });
      await service.dequeue();
      const id2 = await service.enqueue({
        type: "site-build",
        data: {},
        options: skipOpts,
      });
      const id3 = await service.enqueue({
        type: "site-build",
        data: {},
        options: skipOpts,
      });
      expect(id2).toBe(id3);
      expect(id1).not.toBe(id2);
      const jobs = await service.getActiveJobs(["site-build"]);
      expect(jobs.length).toBe(2);
    });
    it("should use deduplicationKey for fine-grained deduplication", async () => {
      const id1 = await service.enqueue({
        type: "site-build",
        data: { key: "app-1" },
        options: enqueueOpts({
          deduplication: "skip",
          deduplicationKey: "app-1",
        }),
      });
      const id2 = await service.enqueue({
        type: "site-build",
        data: { key: "app-2" },
        options: enqueueOpts({
          deduplication: "skip",
          deduplicationKey: "app-2",
        }),
      });
      expect(id1).not.toBe(id2);
      const jobs = await service.getActiveJobs(["site-build"]);
      expect(jobs.length).toBe(2);
      const id3 = await service.enqueue({
        type: "site-build",
        data: { key: "app-1" },
        options: enqueueOpts({
          deduplication: "skip",
          deduplicationKey: "app-1",
        }),
      });
      expect(id3).toBe(id1);
      const jobs2 = await service.getActiveJobs(["site-build"]);
      expect(jobs2.length).toBe(2);
    });
    it("should not inject deduplicationKey into handler payload", async () => {
      const strictSchema = z.object({ key: z.string() }).strict();
      const strictHandler: JobHandler<
        "strict-site-build",
        {
          key: string;
        }
      > = {
        process: async () => undefined,
        validateAndParse: (data) => {
          const result = strictSchema.safeParse(data);
          return result.success ? result.data : null;
        },
      };
      service.registerHandler("strict-site-build", strictHandler);
      const jobId = await service.enqueue({
        type: "strict-site-build",
        data: { key: "app-1" },
        options: enqueueOpts({
          deduplication: "skip",
          deduplicationKey: "app-1",
        }),
      });
      const job = await service.getStatus(jobId);
      expect(JSON.parse(job?.data ?? "{}")).toEqual({ key: "app-1" });
      expect(
        strictHandler.validateAndParse(JSON.parse(job?.data ?? "{}")),
      ).toEqual({
        key: "app-1",
      });
      expect(job?.metadata).toMatchObject({ deduplicationKey: "app-1" });
    });
    it("should replace pending job when deduplication is 'replace'", async () => {
      const replaceOpts = enqueueOpts({ deduplication: "replace" });
      const id1 = await service.enqueue({
        type: "site-build",
        data: { version: 1 },
        options: replaceOpts,
      });
      const id2 = await service.enqueue({
        type: "site-build",
        data: { version: 2 },
        options: replaceOpts,
      });
      expect(id1).not.toBe(id2);
      const job1 = await service.getStatus(id1);
      expect(job1?.status).toBe("failed");
      expect(job1?.lastError).toContain("Replaced");
      const job2 = await service.getStatus(id2);
      expect(job2?.status).toBe("pending");
      const activeJobs = await service.getActiveJobs(["site-build"]);
      expect(activeJobs.length).toBe(1);
      expect(activeJobs[0]?.id).toBe(id2);
      const runtimeUpdates = await service.getRuntimeUpdates(
        { updatedAt: 0, jobId: "" },
        10,
      );
      expect(runtimeUpdates.map((update) => update.job.id)).toEqual([id1]);
      expect(runtimeUpdates[0]?.job.status).toBe("failed");
    });
    it("should not replace a processing job", async () => {
      const replaceOpts = enqueueOpts({ deduplication: "replace" });
      const id1 = await service.enqueue({
        type: "site-build",
        data: { version: 1 },
        options: replaceOpts,
      });
      const processingJob = await service.dequeue();
      expect(processingJob?.id).toBe(id1);
      const id2 = await service.enqueue({
        type: "site-build",
        data: { version: 2 },
        options: replaceOpts,
      });
      expect(id2).not.toBe(id1);
      const job1 = await service.getStatus(id1);
      expect(job1?.status).toBe("processing");
      expect(job1?.lastError).toBeNull();
      const job2 = await service.getStatus(id2);
      expect(job2?.status).toBe("pending");
    });
    it("should coalesce by updating timestamp when deduplication is 'coalesce'", async () => {
      const coalesceOpts = enqueueOpts({ deduplication: "coalesce" });
      const id1 = await service.enqueue({
        type: "site-build",
        data: {},
        options: coalesceOpts,
      });
      const job1Before = await service.getStatus(id1);
      const originalScheduledFor = job1Before?.scheduledFor;
      await new Promise((resolve) => setTimeout(resolve, 10));
      const id2 = await service.enqueue({
        type: "site-build",
        data: {},
        options: coalesceOpts,
      });
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
      const siteBuild1 = await service.enqueue({
        type: "site-build",
        data: {},
        options: skipOpts,
      });
      const otherJob1 = await service.enqueue({
        type: "other-job",
        data: {},
        options: skipOpts,
      });
      const siteBuild2 = await service.enqueue({
        type: "site-build",
        data: {},
        options: skipOpts,
      });
      const otherJob2 = await service.enqueue({
        type: "other-job",
        data: {},
        options: skipOpts,
      });
      expect(siteBuild1).toBe(siteBuild2);
      expect(otherJob1).toBe(otherJob2);
      expect(siteBuild1).not.toBe(otherJob1);
      const activeJobs = await service.getActiveJobs();
      expect(activeJobs.length).toBe(2);
    });
  });

  describe("waitForIdle", () => {
    beforeEach(() => {
      service.registerHandler("shell:embedding", testHandler);
    });

    it("resolves once the queue has been empty for the quiet window", async () => {
      const startedAt = Date.now();
      await service.waitForIdle({ quietMs: 60, pollIntervalMs: 5 });

      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(55);
    });

    it("does not resolve in the gap between cascading jobs", async () => {
      // Work here cascades: finishing one job can enqueue the next. Anything
      // arriving during the quiet window has to restart it, or "idle" would
      // mean "momentarily empty".
      let enqueuedAt = 0;
      const cascade = (async (): Promise<void> => {
        await Bun.sleep(25);
        const jobId = await service.enqueue({
          type: "shell:embedding",
          data: testEntity,
          options: enqueueOpts(),
        });
        enqueuedAt = Date.now();
        await Bun.sleep(25);
        await service.complete(jobId, { processed: true });
      })();

      await service.waitForIdle({ quietMs: 60, pollIntervalMs: 5 });
      const settledAt = Date.now();
      await cascade;

      expect(enqueuedAt).toBeGreaterThan(0);
      expect(settledAt - enqueuedAt).toBeGreaterThanOrEqual(60);
    });

    it("names the outstanding work when it times out", async () => {
      await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: enqueueOpts(),
      });

      expect(
        service.waitForIdle({ quietMs: 10, timeoutMs: 50, pollIntervalMs: 5 }),
      ).rejects.toThrow(/1 pending/);
    });

    it("stops when the caller aborts", async () => {
      await service.enqueue({
        type: "shell:embedding",
        data: testEntity,
        options: enqueueOpts(),
      });
      const controller = new AbortController();
      const idle = service.waitForIdle({
        quietMs: 10,
        pollIntervalMs: 5,
        signal: controller.signal,
      });
      controller.abort();

      expect(idle).rejects.toThrow();
    });
  });
});
