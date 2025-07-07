import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { JobProgressMonitor } from "../src/job-progress-monitor";
import type { IJobQueueService } from "../src/types";
import type { BatchJobManager } from "../src/batch-job-manager";
import type { IEventEmitter } from "../src/job-progress-monitor";
import { Logger } from "@brains/utils";
import type { JobQueue } from "@brains/db";
import type { BatchJobStatus } from "../src/schemas";

describe("JobProgressMonitor", () => {
  let monitor: JobProgressMonitor;
  let mockJobQueueService: IJobQueueService;
  let mockBatchJobManager: BatchJobManager;
  let mockEventEmitter: IEventEmitter;
  let mockLogger: Logger;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockJobQueueService = {
      enqueue: mock(() => Promise.resolve("job-id")),
      dequeue: mock(() => Promise.resolve(null)),
      getStatus: mock(() => Promise.resolve(null)),
      complete: mock(() => Promise.resolve()),
      fail: mock(() => Promise.resolve()),
      getActiveJobs: mock(() => Promise.resolve([])),
      processJob: mock(() =>
        Promise.resolve({ status: "completed" as const, type: "test", jobId: "test" }),
      ),
      registerHandler: mock(() => {}),
      unregisterHandler: mock(() => {}),
      getRegisteredTypes: mock(() => []),
      update: mock(() => Promise.resolve()),
      getStatusByEntityId: mock(() => Promise.resolve(null)),
      getStats: mock(() => Promise.resolve({
        pending: 0,
        processing: 0,
        failed: 0,
        completed: 0,
        total: 0,
      })),
      cleanup: mock(() => Promise.resolve(0)),
    };

    mockBatchJobManager = {
      enqueueBatch: mock(() => Promise.resolve("batch-id")),
      getBatchStatus: mock(() => Promise.resolve(null)),
      getActiveBatches: mock(() => Promise.resolve([])),
      cleanup: mock(() => Promise.resolve(0)),
    } as unknown as BatchJobManager;

    mockEventEmitter = {
      send: mock(() => Promise.resolve()),
    };

    mockLogger = Logger.createFresh({ context: "test" });

    // Reset singleton before each test
    JobProgressMonitor.resetInstance();

    monitor = JobProgressMonitor.createFresh(
      mockJobQueueService,
      mockBatchJobManager,
      mockEventEmitter,
      mockLogger,
    );
  });

  afterEach(() => {
    monitor.stop();
  });

  describe("start/stop", () => {
    it("should start monitoring when start is called", () => {
      const stats = monitor.getStats();
      expect(stats.isRunning).toBe(false);

      monitor.start();

      const newStats = monitor.getStats();
      expect(newStats.isRunning).toBe(true);
    });

    it("should stop monitoring when stop is called", () => {
      monitor.start();
      expect(monitor.getStats().isRunning).toBe(true);

      monitor.stop();
      expect(monitor.getStats().isRunning).toBe(false);
    });

    it("should not start multiple times", () => {
      monitor.start();
      const stats1 = monitor.getStats();

      monitor.start(); // Should not create multiple intervals
      const stats2 = monitor.getStats();

      expect(stats1.isRunning).toBe(true);
      expect(stats2.isRunning).toBe(true);
    });
  });

  describe("individual job monitoring", () => {
    const createMockJob = (overrides: Partial<JobQueue> = {}): JobQueue => ({
      id: "job-123",
      type: "test-job",
      status: "processing",
      data: "{}",
      priority: 5,
      retryCount: 0,
      createdAt: Date.now(),
      maxRetries: 3,
      lastError: null,
      result: null,
      completedAt: null,
      startedAt: null,
      scheduledFor: Date.now(),
      ...overrides,
    });

    it("should emit progress event for active jobs", async () => {
      const mockJob = createMockJob();
      (mockJobQueueService.getActiveJobs as any).mockResolvedValue([mockJob]);

      monitor.start();

      // Wait a bit for the first check
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(mockEventEmitter.send).toHaveBeenCalledWith("job-progress", {
        id: "job-123",
        type: "job",
        status: "processing",
        message: "Processing test-job...",
        jobDetails: {
          jobType: "test-job",
          priority: 5,
          retryCount: 0,
        },
      });
    });

    it("should include progress information when reportProgress is called", () => {
      monitor.reportProgress("job-123", 5, 10, "Processing item 5");

      expect(mockEventEmitter.send).toHaveBeenCalledWith("job-progress", {
        id: "job-123",
        type: "job",
        status: "processing",
        progress: {
          current: 5,
          total: 10,
          percentage: 50,
        },
        message: "Processing item 5",
      });
    });

    it("should track jobs with progress", () => {
      expect(monitor.getStats().jobsWithProgress).toBe(0);

      monitor.reportProgress("job-1", 5, 10);
      expect(monitor.getStats().jobsWithProgress).toBe(1);

      monitor.reportProgress("job-2", 3, 20);
      expect(monitor.getStats().jobsWithProgress).toBe(2);
    });
  });

  describe("batch monitoring", () => {
    const createMockBatch = (
      overrides: Partial<BatchJobStatus> = {},
    ): BatchJobStatus => ({
      batchId: "batch-456",
      totalOperations: 10,
      completedOperations: 3,
      failedOperations: 0,
      errors: [],
      status: "processing",
      currentOperation: "Processing operation 4",
      ...overrides,
    });

    it("should emit progress event for batch operations", async () => {
      const mockBatch = createMockBatch();
      (mockBatchJobManager.getActiveBatches as any).mockResolvedValue([
        {
          batchId: "batch-456",
          status: mockBatch,
          metadata: {},
        },
      ]);

      monitor.start();

      // Wait for the first check
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(mockEventEmitter.send).toHaveBeenCalledWith("job-progress", {
        id: "batch-456",
        type: "batch",
        status: "processing",
        batchDetails: {
          totalOperations: 10,
          completedOperations: 3,
          failedOperations: 0,
          currentOperation: "Processing operation 4",
          errors: [],
        },
        progress: {
          current: 3,
          total: 10,
          percentage: 30,
        },
      });
    });

    it("should calculate percentage correctly", async () => {
      const mockBatch = createMockBatch({
        totalOperations: 4,
        completedOperations: 3,
      });

      (mockBatchJobManager.getActiveBatches as any).mockResolvedValue([
        {
          batchId: "batch-456",
          status: mockBatch,
          metadata: {},
        },
      ]);

      monitor.start();
      await new Promise((resolve) => setTimeout(resolve, 600));

      const call = (mockEventEmitter.send as any).mock.calls[0];
      expect(call[1].progress.percentage).toBe(75);
    });
  });

  describe("error handling", () => {
    it("should handle errors when checking job progress", async () => {
      (mockJobQueueService.getActiveJobs as any).mockRejectedValue(
        new Error("Database error"),
      );

      monitor.start();

      // Should not throw even with errors
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Monitor should still be running
      expect(monitor.getStats().isRunning).toBe(true);
    });

    it("should handle errors when emitting events", async () => {
      (mockEventEmitter.send as any).mockRejectedValue(
        new Error("Event bus error"),
      );

      const mockJob = {
        id: "job-456",
        type: "test-job",
        status: "processing" as const,
        data: "{}",
        priority: 5,
        retryCount: 0,
        createdAt: Date.now(),
        maxRetries: 3,
        lastError: null,
        result: null,
        completedAt: null,
        startedAt: null,
        scheduledFor: Date.now(),
      };
      (mockJobQueueService.getActiveJobs as any).mockResolvedValue([mockJob]);

      monitor.start();

      // Should not throw even if event emission fails
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(monitor.getStats().isRunning).toBe(true);
    });
  });

  describe("singleton behavior", () => {
    it("should return the same instance when using getInstance", () => {
      const instance1 = JobProgressMonitor.getInstance(
        mockJobQueueService,
        mockBatchJobManager,
        mockEventEmitter,
        mockLogger,
      );

      const instance2 = JobProgressMonitor.getInstance(
        mockJobQueueService,
        mockBatchJobManager,
        mockEventEmitter,
        mockLogger,
      );

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", () => {
      const instance1 = JobProgressMonitor.getInstance(
        mockJobQueueService,
        mockBatchJobManager,
        mockEventEmitter,
        mockLogger,
      );

      JobProgressMonitor.resetInstance();

      const instance2 = JobProgressMonitor.getInstance(
        mockJobQueueService,
        mockBatchJobManager,
        mockEventEmitter,
        mockLogger,
      );

      expect(instance1).not.toBe(instance2);
    });
  });
});

