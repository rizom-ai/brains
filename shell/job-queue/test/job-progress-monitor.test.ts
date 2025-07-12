import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { JobProgressMonitor } from "../src/job-progress-monitor";
import type { IJobQueueService } from "../src/types";
import type { BatchJobManager } from "../src/batch-job-manager";
import type { MessageBus } from "@brains/messaging-service";
import { createSilentLogger, type Logger } from "@brains/utils";
import type { JobQueue } from "@brains/db";
import type { BatchJobStatus } from "../src/schemas";

describe("JobProgressMonitor", () => {
  let monitor: JobProgressMonitor;
  let mockJobQueueService: IJobQueueService;
  let mockBatchJobManager: BatchJobManager;
  let mockMessageBus: MessageBus;
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
      registerHandler: mock(() => {}),
      unregisterHandler: mock(() => {}),
      getRegisteredTypes: mock(() => []),
      getHandler: mock(() => undefined),
      update: mock(() => Promise.resolve()),
      getStatusByEntityId: mock(() => Promise.resolve(null)),
      getStats: mock(() =>
        Promise.resolve({
          pending: 0,
          processing: 0,
          failed: 0,
          completed: 0,
          total: 0,
        }),
      ),
      cleanup: mock(() => Promise.resolve(0)),
    };

    mockBatchJobManager = {
      enqueueBatch: mock(() => Promise.resolve("batch-id")),
      getBatchStatus: mock(() => Promise.resolve(null)),
      getActiveBatches: mock(() => Promise.resolve([])),
      cleanup: mock(() => Promise.resolve(0)),
      getInstance: mock(() => mockBatchJobManager),
      resetInstance: mock(() => {}),
      createFresh: mock(() => mockBatchJobManager),
    } as unknown as BatchJobManager;

    mockMessageBus = {
      send: mock(() => Promise.resolve()),
      subscribe: mock(() => () => {}),
      unsubscribe: mock(() => {}),
      unsubscribeAll: mock(() => {}),
      getInstance: mock(() => mockMessageBus),
      resetInstance: mock(() => {}),
      createFresh: mock(() => mockMessageBus),
    } as unknown as MessageBus;

    mockLogger = createSilentLogger();

    // Reset singleton before each test
    JobProgressMonitor.resetInstance();

    monitor = JobProgressMonitor.createFresh(
      mockJobQueueService,
      mockBatchJobManager,
      mockMessageBus,
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
      metadata: {
        interfaceId: "test",
        userId: "test-user",
      },
      source: null,
      ...overrides,
    });

    it("should emit progress event for active jobs", async () => {
      const mockJob = createMockJob();
      (mockJobQueueService.getActiveJobs as any).mockResolvedValue([mockJob]);

      monitor.start();

      // Wait a bit for the first check
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(mockMessageBus.send).toHaveBeenCalledWith(
        "job-progress",
        {
          id: "job-123",
          type: "job",
          status: "processing",
          operationType: "entity_processing",
          operationTarget: "test-job",
          message: undefined,
          metadata: {
            interfaceId: "test",
            userId: "test-user",
          },
          jobDetails: {
            jobType: "test-job",
            priority: 5,
            retryCount: 0,
          },
        },
        "job-progress-monitor", // source
        undefined, // no target - use metadata for routing
        undefined, // metadata
        true, // broadcast to all subscribers
      );
    });

    it("should include metadata when job has metadata", async () => {
      // Mock active job with metadata
      const mockJob: JobQueue = {
        id: "job-789",
        type: "test-job",
        data: "{}",
        status: "processing",
        priority: 5,
        retryCount: 0,
        maxRetries: 3,
        scheduledFor: Date.now() - 1000,
        createdAt: Date.now() - 2000,
        startedAt: Date.now() - 1500,
        completedAt: null,
        lastError: null,
        source: "matrix:room123", // Job has a source
        metadata: { roomId: "room123", interfaceId: "test", userId: "user123" }, // Job has metadata
      };
      (mockJobQueueService.getActiveJobs as any).mockResolvedValue([mockJob]);

      monitor.start();

      // Wait for check
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(mockMessageBus.send).toHaveBeenCalledWith(
        "job-progress",
        expect.objectContaining({
          id: "job-789",
          type: "job",
          metadata: {
            roomId: "room123",
            interfaceId: "test",
            userId: "user123",
          },
        }),
        "job-progress-monitor", // source
        undefined, // no target - use metadata for routing
        undefined, // metadata
        true, // broadcast to all subscribers
      );
    });
  });

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

  describe("batch monitoring", () => {
    it("should emit progress event for batch operations", async () => {
      const mockBatch = createMockBatch();
      (mockBatchJobManager.getActiveBatches as any).mockResolvedValue([
        {
          batchId: "batch-456",
          status: mockBatch,
          metadata: {
            operations: [],
            source: "test",
            startedAt: new Date().toISOString(),
            metadata: {
              interfaceId: "system",
              userId: "system",
            },
          },
        },
      ]);

      monitor.start();

      // Wait for the first check
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(mockMessageBus.send).toHaveBeenCalledWith(
        "job-progress",
        {
          id: "batch-456",
          type: "batch",
          status: "processing",
          operationType: "batch_processing",
          operationTarget: "Processing operation 4",
          metadata: {
            interfaceId: "system",
            userId: "system",
          },
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
        },
        "job-progress-monitor", // source
        undefined, // no target - use metadata for routing
        undefined, // metadata
        true, // broadcast to all subscribers
      );
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
          metadata: {
            operations: [],
            source: "test",
            startedAt: new Date().toISOString(),
            metadata: {
              interfaceId: "system",
              userId: "system",
            },
          },
        },
      ]);

      monitor.start();
      await new Promise((resolve) => setTimeout(resolve, 600));

      const call = (mockMessageBus.send as any).mock.calls[0];
      expect(call[1].progress.percentage).toBe(75);
    });

    it("should include metadata when batch has roomId", async () => {
      const mockBatch = createMockBatch();
      (mockBatchJobManager.getActiveBatches as any).mockResolvedValue([
        {
          batchId: "batch-789",
          status: mockBatch,
          metadata: {
            operations: [],
            source: "cli:interactive", // Batch has a source
            startedAt: new Date().toISOString(),
            metadata: {
              roomId: "interactive",
              interfaceId: "test",
              userId: "user123",
            }, // Batch has roomId in metadata
          },
        },
      ]);

      monitor.start();

      // Wait for check
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(mockMessageBus.send).toHaveBeenCalledWith(
        "job-progress",
        expect.objectContaining({
          id: "batch-789",
          type: "batch",
          metadata: {
            roomId: "interactive",
            interfaceId: "test",
            userId: "user123",
          },
        }),
        "job-progress-monitor", // source
        undefined, // no target - use metadata for routing
        undefined, // metadata
        true, // broadcast to all subscribers
      );
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
      (mockMessageBus.send as any).mockRejectedValue(
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
        mockMessageBus,
        mockLogger,
      );

      const instance2 = JobProgressMonitor.getInstance(
        mockJobQueueService,
        mockBatchJobManager,
        mockMessageBus,
        mockLogger,
      );

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", () => {
      const instance1 = JobProgressMonitor.getInstance(
        mockJobQueueService,
        mockBatchJobManager,
        mockMessageBus,
        mockLogger,
      );

      JobProgressMonitor.resetInstance();

      const instance2 = JobProgressMonitor.getInstance(
        mockJobQueueService,
        mockBatchJobManager,
        mockMessageBus,
        mockLogger,
      );

      expect(instance1).not.toBe(instance2);
    });
  });

  describe("batch completion event targeting", () => {
    it("should emit final batch completion event with proper targeting", async () => {
      const mockBatch = createMockBatch({
        status: "processing",
        totalOperations: 2,
        completedOperations: 1,
      });

      // First call: batch is active
      (mockBatchJobManager.getActiveBatches as any)
        .mockResolvedValueOnce([
          {
            batchId: "batch-123",
            status: mockBatch,
            metadata: {
              operations: [],
              source: "matrix:!testroom:example.com",
              startedAt: new Date().toISOString(),
              metadata: {
                roomId: "!testroom:example.com",
                interfaceId: "test",
                userId: "user123",
              },
            },
          },
        ])
        // Second call: batch is no longer active (completed)
        .mockResolvedValueOnce([]);

      // When getBatchStatus is called for completed batch
      (mockBatchJobManager.getBatchStatus as any).mockResolvedValue({
        ...mockBatch,
        status: "completed",
        completedOperations: 2,
      });

      monitor.start();

      // Wait for initial check (batch is active)
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Wait for second check (batch completion)
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Verify final completion event was emitted with correct metadata
      const completionCalls = (mockMessageBus.send as any).mock.calls.filter(
        (call: any) => call[1].status === "completed",
      );

      expect(completionCalls).toHaveLength(1);
      expect(completionCalls[0]).toEqual([
        "job-progress",
        expect.objectContaining({
          id: "batch-123",
          type: "batch",
          status: "completed",
          metadata: {
            roomId: "!testroom:example.com",
            interfaceId: "test",
            userId: "user123",
          },
          batchDetails: expect.objectContaining({
            completedOperations: 2,
            totalOperations: 2,
          }),
        }),
        "job-progress-monitor", // source
        undefined, // no target - use metadata for routing
        undefined, // metadata
        true, // broadcast to all subscribers
      ]);
    });

    it("should handle batch completion without cached metadata gracefully", async () => {
      const mockBatch = createMockBatch({
        status: "completed",
        totalOperations: 1,
        completedOperations: 1,
      });

      // Batch is no longer active (completed)
      (mockBatchJobManager.getActiveBatches as any).mockResolvedValue([]);

      // When getBatchStatus is called for unknown batch
      (mockBatchJobManager.getBatchStatus as any).mockResolvedValue(mockBatch);

      monitor.start();

      // Wait for check
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Should not emit any events for unknown batches
      expect(mockMessageBus.send).not.toHaveBeenCalled();
    });

    it("should clean up batch metadata cache after completion", async () => {
      const mockBatch = createMockBatch({
        status: "processing",
        totalOperations: 1,
        completedOperations: 0,
      });

      // First call: batch is active
      (mockBatchJobManager.getActiveBatches as any)
        .mockResolvedValueOnce([
          {
            batchId: "batch-cleanup-test",
            status: mockBatch,
            metadata: {
              operations: [],
              source: "cli:test",
              startedAt: new Date().toISOString(),
              metadata: {
                roomId: "test",
                interfaceId: "test",
                userId: "user123",
              },
            },
          },
        ])
        // Second call: batch is no longer active
        .mockResolvedValueOnce([]);

      // When getBatchStatus is called for completed batch
      (mockBatchJobManager.getBatchStatus as any).mockResolvedValue({
        ...mockBatch,
        status: "completed",
        completedOperations: 1,
      });

      monitor.start();

      // Wait for initial check (caches metadata)
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Wait for completion check (should clean up cache)
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Verify cache was cleaned up by checking that subsequent calls don't use cache
      (mockBatchJobManager.getActiveBatches as any).mockResolvedValue([]);
      (mockBatchJobManager.getBatchStatus as any).mockResolvedValue({
        ...mockBatch,
        status: "completed",
        completedOperations: 1,
      });

      // Reset mock calls
      (mockMessageBus.send as any).mockClear();

      // Wait for another check
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Should not emit events for cleaned up batches
      expect(mockMessageBus.send).not.toHaveBeenCalled();
    });

    it("should handle multiple batches with different sources correctly", async () => {
      const mockBatch1 = createMockBatch({
        status: "processing",
        totalOperations: 1,
        completedOperations: 0,
      });

      const mockBatch2 = createMockBatch({
        status: "processing",
        totalOperations: 1,
        completedOperations: 0,
      });

      // Both batches are initially active
      (mockBatchJobManager.getActiveBatches as any)
        .mockResolvedValueOnce([
          {
            batchId: "batch-matrix",
            status: mockBatch1,
            metadata: {
              operations: [],
              source: "matrix:!room1:example.com",
              startedAt: new Date().toISOString(),
              metadata: {
                roomId: "!room1:example.com",
                interfaceId: "test",
                userId: "user123",
              },
            },
          },
          {
            batchId: "batch-cli",
            status: mockBatch2,
            metadata: {
              operations: [],
              source: "cli:session-123",
              startedAt: new Date().toISOString(),
              metadata: {
                roomId: "session-123",
                interfaceId: "test",
                userId: "user123",
              },
            },
          },
        ])
        // Second call: both batches complete
        .mockResolvedValueOnce([]);

      // Mock completion for both batches
      (mockBatchJobManager.getBatchStatus as any).mockImplementation(
        (batchId: string) => {
          if (batchId === "batch-matrix") {
            return Promise.resolve({
              ...mockBatch1,
              status: "completed",
              completedOperations: 1,
            });
          }
          if (batchId === "batch-cli") {
            return Promise.resolve({
              ...mockBatch2,
              status: "completed",
              completedOperations: 1,
            });
          }
          return Promise.resolve(null);
        },
      );

      monitor.start();

      // Wait for initial check
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Wait for completion check
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Verify both completion events were emitted with correct metadata
      const completionCalls = (mockMessageBus.send as any).mock.calls.filter(
        (call: any) => call[1].status === "completed",
      );

      expect(completionCalls).toHaveLength(2);

      const matrixCall = completionCalls.find(
        (call: any) => call[1].id === "batch-matrix",
      );
      const cliCall = completionCalls.find(
        (call: any) => call[1].id === "batch-cli",
      );

      expect(matrixCall[1].metadata.roomId).toBe("!room1:example.com"); // metadata is in event payload
      expect(cliCall[1].metadata.roomId).toBe("session-123"); // metadata is in event payload
    });
  });
});
