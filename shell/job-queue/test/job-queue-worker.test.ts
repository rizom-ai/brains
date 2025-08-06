import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { JobQueueWorker } from "../src/job-queue-worker";
import type { JobQueue } from "../src/schema/job-queue";
import type { JobQueueService } from "../src/job-queue-service";
import { createSilentLogger } from "@brains/utils";
import type { IJobProgressMonitor, ProgressReporter } from "@brains/utils";

// Mock progress monitor for testing
const mockProgressReporter: ProgressReporter = {
  async report(): Promise<void> {},
  createSub(): ProgressReporter {
    return mockProgressReporter;
  },
  startHeartbeat(): void {},
  stopHeartbeat(): void {},
  toCallback() {
    return async () => {};
  },
} as unknown as ProgressReporter;

class MockProgressMonitor implements IJobProgressMonitor {
  createProgressReporter(): ProgressReporter {
    return mockProgressReporter;
  }

  async emitJobCompletion(_jobId: string): Promise<void> {
    // Mock implementation
  }

  async emitJobFailure(_jobId: string): Promise<void> {
    // Mock implementation
  }
}

describe("JobQueueWorker", () => {
  let worker: JobQueueWorker;
  let mockService: JobQueueService;
  let mockProgressMonitor: IJobProgressMonitor;

  const testJob: JobQueue = {
    id: "test-job-123",
    type: "embedding",
    data: JSON.stringify({ id: "entity-123", content: "test" }),
    result: null,
    status: "processing",
    priority: 0,
    retryCount: 0,
    maxRetries: 3,
    lastError: null,
    createdAt: Date.now(),
    scheduledFor: Date.now(),
    startedAt: Date.now(),
    completedAt: null,
    metadata: {
      interfaceId: "test",
      userId: "test-user",
      operationType: "entity_processing",
    },
    source: null,
  };

  beforeEach(() => {
    JobQueueWorker.resetInstance();

    // Create mock progress monitor
    mockProgressMonitor = new MockProgressMonitor();

    // Create fresh mock service for each test
    mockService = {
      dequeue: mock(() => Promise.resolve(null)),
      complete: mock(() => Promise.resolve()),
      fail: mock(() => Promise.resolve()),
      getHandler: mock(() => ({
        process: mock(() => Promise.resolve({ success: true })),
        onError: mock(() => Promise.resolve()),
        validateAndParse: mock(() => ({ id: "entity-123", content: "test" })),
      })),
    } as unknown as JobQueueService;

    worker = JobQueueWorker.createFresh(
      mockService,
      mockProgressMonitor,
      createSilentLogger(),
      {
        pollInterval: 50, // Fast for tests
      },
    );
  });

  afterEach(async () => {
    if (worker.isWorkerRunning()) {
      await worker.stop();
    }
    JobQueueWorker.resetInstance();
  });

  describe("Basic lifecycle", () => {
    it("should start and stop correctly", async () => {
      expect(worker.isWorkerRunning()).toBe(false);

      await worker.start();
      expect(worker.isWorkerRunning()).toBe(true);

      await worker.stop();
      expect(worker.isWorkerRunning()).toBe(false);
    });

    it("should handle multiple start/stop calls", async () => {
      await worker.start();
      await worker.start(); // Should not throw
      expect(worker.isWorkerRunning()).toBe(true);

      await worker.stop();
      await worker.stop(); // Should not throw
      expect(worker.isWorkerRunning()).toBe(false);
    });
  });

  describe("Configuration", () => {
    it("should accept custom configuration", () => {
      const customWorker = JobQueueWorker.createFresh(
        mockService,
        mockProgressMonitor,
        createSilentLogger(),
        {
          concurrency: 5,
          pollInterval: 2000,
          maxJobs: 100,
          autoStart: false,
        },
      );

      expect(customWorker.isWorkerRunning()).toBe(false);
    });

    it("should auto-start when configured", async () => {
      const autoWorker = JobQueueWorker.createFresh(
        mockService,
        mockProgressMonitor,
        createSilentLogger(),
        {
          autoStart: true,
        },
      );

      expect(autoWorker.isWorkerRunning()).toBe(true);
      await autoWorker.stop(); // Cleanup
    });
  });

  describe("Statistics", () => {
    it("should track basic stats", () => {
      const stats = worker.getStats();

      expect(stats.processedJobs).toBe(0);
      expect(stats.failedJobs).toBe(0);
      expect(stats.activeJobs).toBe(0);
      expect(stats.isRunning).toBe(false);
      expect(stats.uptime).toBe(0);
    });

    it("should show running state when started", async () => {
      await worker.start();

      // Wait a bit for uptime to accumulate
      await new Promise((resolve) => setTimeout(resolve, 20));

      const stats = worker.getStats();
      expect(stats.isRunning).toBe(true);
      expect(stats.uptime).toBeGreaterThan(0);
    });
  });

  describe("Job processing integration", () => {
    it("should call dequeue when running", async () => {
      await worker.start();

      // Wait for at least one poll cycle
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockService.dequeue).toHaveBeenCalled();
    });

    it("should process jobs when available", async () => {
      // Recreate mock service to return a job once, then null
      let callCount = 0;
      mockService = {
        dequeue: mock(() => {
          callCount++;
          return callCount === 1
            ? Promise.resolve(testJob)
            : Promise.resolve(null);
        }),
        complete: mock(() => Promise.resolve()),
        fail: mock(() => Promise.resolve()),
        getHandler: mock(() => ({
          process: mock(() => Promise.resolve({ success: true })),
          onError: mock(() => Promise.resolve()),
          validateAndParse: mock(() => ({ id: "entity-123", content: "test" })),
        })),
      } as unknown as JobQueueService;

      worker = JobQueueWorker.createFresh(
        mockService,
        mockProgressMonitor,
        createSilentLogger(),
        {
          pollInterval: 50,
        },
      );

      await worker.start();

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockService.getHandler).toHaveBeenCalledWith(testJob.type);
    });

    it("should handle service errors gracefully", async () => {
      // Worker should start and continue running even if service has errors
      await worker.start();
      expect(worker.isWorkerRunning()).toBe(true);
    });
  });

  describe("Max jobs limit", () => {
    it("should accept maxJobs configuration", () => {
      const limitedWorker = JobQueueWorker.createFresh(
        mockService,
        mockProgressMonitor,
        createSilentLogger(),
        {
          maxJobs: 5,
        },
      );

      // Worker should be created successfully
      expect(limitedWorker.isWorkerRunning()).toBe(false);
    });
  });

  describe("Graceful shutdown", () => {
    it("should wait for active jobs before stopping", async () => {
      // Recreate mock service with slow job processing
      let callCount = 0;
      mockService = {
        dequeue: mock(() => {
          callCount++;
          return callCount === 1
            ? Promise.resolve(testJob)
            : Promise.resolve(null);
        }),
        complete: mock(() => Promise.resolve()),
        fail: mock(() => Promise.resolve()),
        getHandler: mock(() => ({
          process: mock(async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return { success: true };
          }),
          onError: mock(() => Promise.resolve()),
          validateAndParse: mock(() => ({ id: "entity-123", content: "test" })),
        })),
      } as unknown as JobQueueService;

      worker = JobQueueWorker.createFresh(
        mockService,
        mockProgressMonitor,
        createSilentLogger(),
        {
          pollInterval: 50,
        },
      );

      await worker.start();

      // Wait for job to start processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Stop should wait for job completion
      const stopPromise = worker.stop();

      await stopPromise;

      const stats = worker.getStats();
      expect(stats.isRunning).toBe(false);
      expect(stats.processedJobs).toBeGreaterThanOrEqual(1);
    });
  });
});
