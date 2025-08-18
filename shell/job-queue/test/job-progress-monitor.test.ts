import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { JobProgressMonitor } from "../src/job-progress-monitor";
import type { IJobQueueService } from "../src/types";
// Removed BatchJobManager dependency for simplicity
import type { MessageBus } from "@brains/messaging-service";
import { createSilentLogger, type Logger } from "@brains/utils";
import type { JobQueue, JobContext } from "../src/schema/job-queue";
import type { BatchJobStatus } from "../src/schemas";
import type { Mock } from "bun:test";

describe("JobProgressMonitor", () => {
  let monitor: JobProgressMonitor;
  let mockJobQueueService: IJobQueueService;
  // Removed BatchJobManager from JobProgressMonitor for simplicity
  let mockMessageBus: MessageBus;
  let mockLogger: Logger;

  // Properly typed mock functions
  let getStatusMock: Mock<(id: string) => Promise<JobQueue | null>>;
  let messageBusSendMock: Mock<(...args: unknown[]) => Promise<void>>;

  beforeEach(() => {
    // Create fresh mocks for each test
    getStatusMock = mock(() => Promise.resolve(null));

    mockJobQueueService = {
      enqueue: mock(() => Promise.resolve("job-id")),
      dequeue: mock(() => Promise.resolve(null)),
      getStatus: getStatusMock,
      complete: mock(() => Promise.resolve()),
      fail: mock(() => Promise.resolve()),
      getActiveJobs: mock(() => Promise.resolve([])),
      registerHandler: mock(() => {}),
      unregisterHandler: mock(() => {}),
      unregisterPluginHandlers: mock(() => {}),
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

    // No longer needed - BatchJobManager removed from JobProgressMonitor

    messageBusSendMock = mock(() => Promise.resolve());

    mockMessageBus = {
      send: messageBusSendMock,
      subscribe: mock((): (() => void) => () => {}),
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
      mockMessageBus,
      mockLogger,
    );
  });

  afterEach(() => {
    monitor.stop();
  });

  describe("basic functionality", () => {
    it("should be running in event-driven mode", () => {
      const stats = monitor.getStats();
      expect(stats.isRunning).toBe(true);
    });

    it("should handle start/stop gracefully", () => {
      monitor.start();
      monitor.stop();
      expect(monitor.getStats().isRunning).toBe(true);
    });
  });

  describe("progress reporting", () => {
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
        interfaceType: "test",
        userId: "test-user",
        operationType: "data_processing",
      },
      source: "test-source",
      ...overrides,
    });

    it("should emit progress event when progress is reported", async () => {
      const mockJob = createMockJob();
      getStatusMock.mockResolvedValue(mockJob);

      const progressReporter = monitor.createProgressReporter("job-123");
      await progressReporter.report({
        progress: 5,
        total: 10,
        message: "Processing step 5",
      });

      expect(messageBusSendMock).toHaveBeenCalledWith(
        "job-progress",
        {
          id: "job-123",
          type: "job",
          status: "processing",
          message: "Processing step 5",
          metadata: {
            interfaceType: "test",
            userId: "test-user",
            operationType: "data_processing",
          },
          progress: {
            current: 5,
            total: 10,
            percentage: 50,
          },
        },
        "job-progress-monitor",
        undefined,
        undefined,
        true,
      );
    });

    it("should handle progress without totals", async () => {
      const mockJob = createMockJob();
      getStatusMock.mockResolvedValue(mockJob);

      const progressReporter = monitor.createProgressReporter("job-123");
      await progressReporter.report({
        progress: 5,
        message: "Processing...",
      });

      expect(messageBusSendMock).toHaveBeenCalledWith(
        "job-progress",
        {
          id: "job-123",
          type: "job",
          status: "processing",
          message: "Processing...",
          metadata: {
            interfaceType: "test",
            userId: "test-user",
            operationType: "data_processing",
          },
        },
        "job-progress-monitor",
        undefined,
        undefined,
        true,
      );
    });

    it("should handle missing job gracefully", async () => {
      getStatusMock.mockResolvedValue(null);

      const progressReporter = monitor.createProgressReporter("missing-job");
      await progressReporter.report({
        progress: 1,
        total: 10,
        message: "Processing...",
      });

      // Should not emit any event for missing job
      expect(messageBusSendMock).not.toHaveBeenCalled();
    });
  });

  describe("batch progress", () => {
    it("should emit batch progress event", async () => {
      const batchStatus: BatchJobStatus = {
        batchId: "batch-456",
        totalOperations: 10,
        completedOperations: 3,
        failedOperations: 0,
        errors: [],
        status: "processing",
        currentOperation: "Processing operation 4",
      };

      const metadata: JobContext = {
        interfaceType: "test",
        userId: "test-user",
        operationType: "batch_processing",
      };

      await monitor.emitBatchProgress("batch-456", batchStatus, metadata);

      expect(messageBusSendMock).toHaveBeenCalledWith(
        "job-progress",
        {
          id: "batch-456",
          type: "batch",
          status: "processing",
          metadata,
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
        "job-progress-monitor",
        undefined,
        undefined,
        true,
      );
    });

    it("should calculate percentage correctly", async () => {
      const batchStatus: BatchJobStatus = {
        batchId: "batch-456",
        totalOperations: 4,
        completedOperations: 3,
        failedOperations: 0,
        errors: [],
        status: "processing",
      };

      const metadata: JobContext = {
        interfaceType: "test",
        userId: "test-user",
        operationType: "batch_processing",
      };

      await monitor.emitBatchProgress("batch-456", batchStatus, metadata);

      const call = messageBusSendMock.mock.calls[0];
      if (call) {
        expect(call[1]).toMatchObject({
          progress: {
            current: 3,
            total: 4,
            percentage: 75,
          },
        });
      }
    });
  });

  describe("completion events", () => {
    const createMockJob = (overrides: Partial<JobQueue> = {}): JobQueue => ({
      id: "job-123",
      type: "test-job",
      status: "completed",
      data: "{}",
      priority: 5,
      retryCount: 0,
      createdAt: Date.now(),
      maxRetries: 3,
      lastError: null,
      result: null,
      completedAt: Date.now(),
      startedAt: null,
      scheduledFor: Date.now(),
      metadata: {
        interfaceType: "test",
        userId: "test-user",
        operationType: "data_processing",
      },
      source: "test-source",
      ...overrides,
    });

    it("should emit job completion event", async () => {
      const mockJob = createMockJob();
      getStatusMock.mockResolvedValue(mockJob);

      await monitor.emitJobCompletion("job-123");

      expect(messageBusSendMock).toHaveBeenCalledWith(
        "job-progress",
        {
          id: "job-123",
          type: "job",
          status: "completed",
          metadata: {
            interfaceType: "test",
            userId: "test-user",
            operationType: "data_processing",
          },
          jobDetails: {
            jobType: "test-job",
            priority: 5,
            retryCount: 0,
          },
        },
        "job-progress-monitor",
        undefined,
        undefined,
        true,
      );
    });

    it("should emit job failure event", async () => {
      const mockJob = createMockJob({
        status: "failed",
        lastError: "Something went wrong",
      });
      getStatusMock.mockResolvedValue(mockJob);

      await monitor.emitJobFailure("job-123");

      expect(messageBusSendMock).toHaveBeenCalledWith(
        "job-progress",
        {
          id: "job-123",
          type: "job",
          status: "failed",
          message: "Something went wrong",
          metadata: {
            interfaceType: "test",
            userId: "test-user",
            operationType: "data_processing",
          },
          jobDetails: {
            jobType: "test-job",
            priority: 5,
            retryCount: 0,
          },
        },
        "job-progress-monitor",
        undefined,
        undefined,
        true,
      );
    });

    it("should handle missing job in completion gracefully", async () => {
      getStatusMock.mockResolvedValue(null);

      await monitor.emitJobCompletion("missing-job");
      await monitor.emitJobFailure("missing-job");

      expect(messageBusSendMock).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should handle message bus errors gracefully", async () => {
      messageBusSendMock.mockRejectedValue(new Error("Message bus error"));

      const mockJob = {
        id: "job-123",
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
        source: "test-source",
        metadata: {
          interfaceType: "test",
          userId: "test-user",
          operationType: "data_processing" as const,
        },
      };
      getStatusMock.mockResolvedValue(mockJob);

      const progressReporter = monitor.createProgressReporter("job-123");

      // Should handle message bus errors and not throw unhandled errors
      try {
        await progressReporter.report({
          progress: 1,
          total: 10,
          message: "Processing...",
        });
      } catch (error) {
        // Error is expected and handled
        expect(error).toEqual(new Error("Message bus error"));
      }
    });
  });

  describe("singleton behavior", () => {
    it("should return the same instance when using getInstance", () => {
      const instance1 = JobProgressMonitor.getInstance(
        mockJobQueueService,
        mockMessageBus,
        mockLogger,
      );

      const instance2 = JobProgressMonitor.getInstance(
        mockJobQueueService,
        mockMessageBus,
        mockLogger,
      );

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", () => {
      const instance1 = JobProgressMonitor.getInstance(
        mockJobQueueService,
        mockMessageBus,
        mockLogger,
      );

      JobProgressMonitor.resetInstance();

      const instance2 = JobProgressMonitor.getInstance(
        mockJobQueueService,
        mockMessageBus,
        mockLogger,
      );

      expect(instance1).not.toBe(instance2);
    });
  });
});