import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import type { Mock } from "bun:test";
import { JobProgressMonitor } from "../src/job-progress-monitor";
import type {
  IBatchJobManager,
  IJobQueueService,
  JobContext,
} from "../src/types";
import type { JobQueue } from "../src/schema/job-queue";
import type { BatchJobStatus } from "../src/batch-schemas";
import {
  createSilentLogger,
  createMockBatchJobManager,
} from "@brains/test-utils";
import { createMockMessageBus } from "@brains/messaging-service/test";
import type { Logger } from "@brains/utils/logger";
import type { MessageBus } from "@brains/messaging-service";

const testRootJobId = "test-root-job-id";

function createMockJob(overrides: Partial<JobQueue> = {}): JobQueue {
  return {
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
    progress: null,
    completedAt: null,
    startedAt: null,
    scheduledFor: Date.now(),
    metadata: {
      rootJobId: "job-123",
      operationType: "data_processing",
    },
    source: "test-source",
    attemptId: "attempt-123",
    workerSlotId: "worker-a",
    workerSessionId: "session-a",
    leaseExpiresAt: Date.now() + 10_000,
    attemptHeartbeatAt: Date.now(),
    runtimeUpdatedAt: Date.now(),
    ...overrides,
  };
}

describe("JobProgressMonitor", () => {
  let monitor: JobProgressMonitor;
  let mockJobQueueService: IJobQueueService;
  let mockBatchJobManager: IBatchJobManager;
  let mockMessageBus: MessageBus;
  let mockLogger: Logger;

  let getStatusMock: Mock<(id: string) => Promise<JobQueue | null>>;
  let recordAttemptProgressMock: Mock<
    IJobQueueService["recordAttemptProgress"]
  >;
  let messageBusSendMock: ReturnType<typeof mock>;
  let getRuntimeUpdatesMock: Mock<IJobQueueService["getRuntimeUpdates"]>;

  beforeEach(() => {
    getStatusMock = mock(() => Promise.resolve(null));
    recordAttemptProgressMock = mock(() => Promise.resolve(true));
    getRuntimeUpdatesMock = mock(() => Promise.resolve([]));

    mockJobQueueService = {
      enqueue: mock(() => Promise.resolve("job-id")),
      dequeue: mock(() => Promise.resolve(null)),
      startWorkerSession: mock(() => Promise.resolve()),
      heartbeatWorkerSession: mock(() => Promise.resolve(true)),
      endWorkerSession: mock(() => Promise.resolve(true)),
      renewAttemptLease: mock(() => Promise.resolve(true)),
      recordAttemptProgress: recordAttemptProgressMock,
      getStatus: getStatusMock,
      complete: mock(() => Promise.resolve(true)),
      fail: mock(() => Promise.resolve(true)),
      getActiveJobs: mock(() => Promise.resolve([])),
      getFailedJobs: mock(() => Promise.resolve([])),
      registerHandler: mock(() => {}),
      unregisterHandler: mock(() => {}),
      unregisterPluginHandlers: mock(() => {}),
      getRegisteredTypes: mock(() => []),
      getHandler: mock(() => undefined),
      finalizeHandlerRegistrations: mock(() => []),
      getExecutionRegistrations: mock(() => []),
      update: mock(() => Promise.resolve(true)),
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
      getDiagnostics: mock(() =>
        Promise.resolve({
          totals: { pending: 0, processing: 0, failed: 0, completed: 0 },
          byType: [],
          oldestPendingAgeMs: null,
          oldestProcessingAgeMs: null,
          staleLeaseCount: 0,
        }),
      ),
      getRuntimeUpdates: getRuntimeUpdatesMock,
      cleanup: mock(() => Promise.resolve(0)),
      close: mock(() => {}),
    };

    mockBatchJobManager = createMockBatchJobManager();
    mockMessageBus = createMockMessageBus();
    messageBusSendMock = spyOn(mockMessageBus, "send");
    mockLogger = createSilentLogger();

    monitor = JobProgressMonitor.createFresh(
      mockJobQueueService,
      mockMessageBus,
      mockBatchJobManager,
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
    it("should emit progress event when progress is reported", async () => {
      getStatusMock.mockResolvedValue(createMockJob());

      const progressReporter = monitor.createProgressReporter("job-123");
      await progressReporter.report({
        progress: 5,
        total: 10,
        message: "Processing step 5",
      });

      expect(messageBusSendMock).toHaveBeenCalledWith({
        type: "job-progress",
        payload: {
          id: "job-123",
          type: "job",
          status: "processing",
          message: "Processing step 5",
          metadata: {
            rootJobId: "job-123",
            operationType: "data_processing",
          },
          progress: {
            current: 5,
            total: 10,
            percentage: 50,
          },
        },
        sender: "job-progress-monitor",
        broadcast: true,
      });
    });

    it("should handle progress without totals", async () => {
      getStatusMock.mockResolvedValue(createMockJob());

      const progressReporter = monitor.createProgressReporter("job-123");
      await progressReporter.report({
        progress: 5,
        message: "Processing...",
      });

      expect(messageBusSendMock).toHaveBeenCalledWith({
        type: "job-progress",
        payload: {
          id: "job-123",
          type: "job",
          status: "processing",
          message: "Processing...",
          metadata: {
            rootJobId: "job-123",
            operationType: "data_processing",
          },
        },
        sender: "job-progress-monitor",
        broadcast: true,
      });
    });

    it("should handle missing job gracefully", async () => {
      getStatusMock.mockResolvedValue(null);

      const progressReporter = monitor.createProgressReporter("missing-job");
      await progressReporter.report({
        progress: 1,
        total: 10,
        message: "Processing...",
      });

      expect(messageBusSendMock).not.toHaveBeenCalled();
    });

    it("drops progress from an obsolete fenced attempt", async () => {
      recordAttemptProgressMock.mockResolvedValue(false);
      getStatusMock.mockResolvedValue(createMockJob());

      const progressReporter = monitor.createProgressReporter(
        "job-123",
        "obsolete-attempt",
      );
      await progressReporter.report({
        progress: 5,
        total: 10,
        message: "Stale progress",
      });

      expect(recordAttemptProgressMock).toHaveBeenCalledWith(
        "job-123",
        "obsolete-attempt",
        { progress: 5, total: 10, message: "Stale progress" },
      );
      expect(getStatusMock).not.toHaveBeenCalled();
      expect(messageBusSendMock).not.toHaveBeenCalled();
    });

    it("persists worker progress without publishing on its local bus", async () => {
      const writerMonitor = JobProgressMonitor.createFresh(
        mockJobQueueService,
        mockMessageBus,
        mockBatchJobManager,
        mockLogger,
        "durable-writer",
      );
      getStatusMock.mockResolvedValue(createMockJob());

      await writerMonitor
        .createProgressReporter("job-123", "attempt-123")
        .report({ progress: 4, total: 10, message: "Durable" });

      expect(recordAttemptProgressMock).toHaveBeenCalledWith(
        "job-123",
        "attempt-123",
        { progress: 4, total: 10, message: "Durable" },
      );
      expect(getStatusMock).not.toHaveBeenCalled();
      expect(messageBusSendMock).not.toHaveBeenCalled();
    });

    it("publishes durable worker progress from the web process", async () => {
      const job = createMockJob({
        progress: { progress: 4, total: 10, message: "Durable" },
        attemptHeartbeatAt: 2_000,
      });
      getRuntimeUpdatesMock
        .mockResolvedValueOnce([
          { job, cursor: { updatedAt: 2_000, jobId: job.id } },
        ])
        .mockResolvedValueOnce([]);
      const readerMonitor = JobProgressMonitor.createFresh(
        mockJobQueueService,
        mockMessageBus,
        mockBatchJobManager,
        mockLogger,
        "durable-reader",
      );

      await readerMonitor.pollDurableUpdates();

      expect(messageBusSendMock).toHaveBeenCalledWith({
        type: "job-progress",
        payload: expect.objectContaining({
          id: "job-123",
          status: "processing",
          message: "Durable",
          progress: { current: 4, total: 10, percentage: 40 },
        }),
        sender: "job-progress-monitor",
        broadcast: true,
      });
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
        rootJobId: testRootJobId,
        operationType: "batch_processing",
      };

      await monitor.emitBatchProgress("batch-456", batchStatus, metadata);

      expect(messageBusSendMock).toHaveBeenCalledWith({
        type: "job-progress",
        payload: {
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
        sender: "job-progress-monitor",
        broadcast: true,
      });
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
        rootJobId: testRootJobId,
        operationType: "batch_processing",
      };

      await monitor.emitBatchProgress("batch-456", batchStatus, metadata);

      const call = messageBusSendMock.mock.calls[0];
      if (call) {
        expect(call[0]).toMatchObject({
          payload: {
            progress: {
              current: 3,
              total: 4,
              percentage: 75,
            },
          },
        });
      }
    });
  });

  describe("completion events", () => {
    it("should emit job completion event", async () => {
      const mockJob = createMockJob({
        status: "completed",
        completedAt: Date.now(),
        metadata: {
          rootJobId: "job-123",
          operationType: "data_processing",
        },
      });
      getStatusMock.mockResolvedValue(mockJob);

      await monitor.emitJobCompletion("job-123");

      expect(messageBusSendMock).toHaveBeenCalledWith({
        type: "job-progress",
        payload: {
          id: "job-123",
          type: "job",
          status: "completed",
          metadata: {
            rootJobId: "job-123",
            operationType: "data_processing",
          },
          jobDetails: {
            jobType: "test-job",
            priority: 5,
            retryCount: 0,
          },
        },
        sender: "job-progress-monitor",
        broadcast: true,
      });
    });

    it("should emit job failure event", async () => {
      const mockJob = createMockJob({
        status: "failed",
        completedAt: Date.now(),
        lastError: "Something went wrong",
        metadata: {
          rootJobId: "job-123",
          operationType: "data_processing",
        },
      });
      getStatusMock.mockResolvedValue(mockJob);

      await monitor.emitJobFailure("job-123");

      expect(messageBusSendMock).toHaveBeenCalledWith({
        type: "job-progress",
        payload: {
          id: "job-123",
          type: "job",
          status: "failed",
          message: "Something went wrong",
          metadata: {
            rootJobId: "job-123",
            operationType: "data_processing",
          },
          jobDetails: {
            jobType: "test-job",
            priority: 5,
            retryCount: 0,
          },
        },
        sender: "job-progress-monitor",
        broadcast: true,
      });
    });

    it("should handle missing job in completion gracefully", async () => {
      getStatusMock.mockResolvedValue(null);

      await monitor.emitJobCompletion("missing-job");
      await monitor.emitJobFailure("missing-job");

      expect(messageBusSendMock).not.toHaveBeenCalled();
    });

    it("should skip individual job completion for batch operations", async () => {
      const mockJob = createMockJob({
        id: "child-job-456",
        status: "completed",
        completedAt: Date.now(),
        metadata: {
          rootJobId: "batch-789",
          operationType: "data_processing",
        },
      });
      getStatusMock.mockResolvedValue(mockJob);

      await monitor.emitJobCompletion("child-job-456");

      expect(messageBusSendMock).not.toHaveBeenCalled();
    });

    it("should skip individual job failure for batch operations", async () => {
      const mockJob = createMockJob({
        id: "child-job-456",
        status: "failed",
        completedAt: Date.now(),
        lastError: "Something went wrong",
        metadata: {
          rootJobId: "batch-789",
          operationType: "data_processing",
        },
      });
      getStatusMock.mockResolvedValue(mockJob);

      await monitor.emitJobFailure("child-job-456");

      expect(messageBusSendMock).not.toHaveBeenCalled();
    });
  });

  describe("silent jobs", () => {
    const silentMetadata: JobContext = {
      rootJobId: "job-123",
      operationType: "data_processing",
      silent: true,
    };

    it("does not emit progress events", async () => {
      getStatusMock.mockResolvedValue(
        createMockJob({ metadata: silentMetadata }),
      );

      const progressReporter = monitor.createProgressReporter("job-123");
      await progressReporter.report({
        progress: 5,
        total: 10,
        message: "Processing step 5",
      });

      expect(messageBusSendMock).not.toHaveBeenCalled();
    });

    it("does not emit completion or failure events", async () => {
      getStatusMock.mockResolvedValue(
        createMockJob({
          status: "completed",
          completedAt: Date.now(),
          metadata: silentMetadata,
        }),
      );

      await monitor.emitJobCompletion("job-123");
      await monitor.emitJobFailure("job-123");

      expect(messageBusSendMock).not.toHaveBeenCalled();
    });

    it("handleJobStatusChange performs no lookups and emits nothing", async () => {
      getStatusMock.mockResolvedValue(
        createMockJob({
          status: "completed",
          completedAt: Date.now(),
          metadata: silentMetadata,
        }),
      );
      const getBatchStatusSpy = spyOn(mockBatchJobManager, "getBatchStatus");

      await monitor.handleJobStatusChange(
        "job-123",
        "completed",
        silentMetadata,
      );

      expect(messageBusSendMock).not.toHaveBeenCalled();
      expect(getBatchStatusSpy).not.toHaveBeenCalled();
      expect(getStatusMock).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should handle message bus errors gracefully", async () => {
      messageBusSendMock.mockRejectedValue(new Error("Message bus error"));
      getStatusMock.mockResolvedValue(createMockJob());

      const progressReporter = monitor.createProgressReporter("job-123");

      try {
        await progressReporter.report({
          progress: 1,
          total: 10,
          message: "Processing...",
        });
      } catch (error) {
        expect(error).toEqual(new Error("Message bus error"));
      }
    });
  });
});
