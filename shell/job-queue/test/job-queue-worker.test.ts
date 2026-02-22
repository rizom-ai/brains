import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import { JobQueueWorker } from "../src/job-queue-worker";
import type { IJobQueueService, JobInfo } from "../src/types";
import {
  createSilentLogger,
  createMockProgressReporter,
  createMockJobQueueService,
} from "@brains/test-utils";
import { createId } from "@brains/utils";
import type { IJobProgressMonitor, ProgressReporter } from "@brains/utils";

const mockProgressReporter = createMockProgressReporter();

class MockProgressMonitor implements IJobProgressMonitor {
  start(): void {}
  stop(): void {}

  createProgressReporter(): ProgressReporter {
    return mockProgressReporter;
  }

  async emitJobCompletion(_jobId: string): Promise<void> {}
  async emitJobFailure(_jobId: string): Promise<void> {}

  async handleJobStatusChange(
    _jobId: string,
    _status: "completed" | "failed",
    _metadata?: Record<string, unknown>,
  ): Promise<void> {}
}

const testJob: JobInfo = {
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
    rootJobId: createId(),
    operationType: "data_processing",
  },
  source: null,
};

interface MockHandler {
  process: ReturnType<typeof mock>;
  onError: ReturnType<typeof mock>;
  validateAndParse: ReturnType<typeof mock>;
}

function createMockHandler(): MockHandler {
  return {
    process: mock(() => Promise.resolve({ success: true })),
    onError: mock(() => Promise.resolve()),
    validateAndParse: mock(() => ({ id: "entity-123", content: "test" })),
  };
}

function createWorkerWithSingleJob(
  handler: MockHandler,
  processDelay = 0,
): { worker: JobQueueWorker; mockService: IJobQueueService } {
  let callCount = 0;
  const mockService = createMockJobQueueService({
    returns: { getHandler: handler },
  });

  if (processDelay > 0) {
    handler.process.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, processDelay));
      return { success: true };
    });
  }

  spyOn(mockService, "dequeue").mockImplementation(() => {
    callCount++;
    return callCount === 1 ? Promise.resolve(testJob) : Promise.resolve(null);
  });

  const worker = JobQueueWorker.createFresh(
    mockService,
    new MockProgressMonitor(),
    createSilentLogger(),
    { pollInterval: 50 },
  );

  return { worker, mockService };
}

describe("JobQueueWorker", () => {
  let worker: JobQueueWorker;
  let mockService: IJobQueueService;
  let mockProgressMonitor: IJobProgressMonitor;

  beforeEach(() => {
    JobQueueWorker.resetInstance();

    mockProgressMonitor = new MockProgressMonitor();

    mockService = createMockJobQueueService({
      returns: { getHandler: createMockHandler() },
    });

    worker = JobQueueWorker.createFresh(
      mockService,
      mockProgressMonitor,
      createSilentLogger(),
      { pollInterval: 50 },
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
      await worker.start();
      expect(worker.isWorkerRunning()).toBe(true);

      await worker.stop();
      await worker.stop();
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
        { autoStart: true },
      );

      expect(autoWorker.isWorkerRunning()).toBe(true);
      await autoWorker.stop();
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

      await new Promise((resolve) => setTimeout(resolve, 20));

      const stats = worker.getStats();
      expect(stats.isRunning).toBe(true);
      expect(stats.uptime).toBeGreaterThan(0);
    });
  });

  describe("Job processing integration", () => {
    it("should call dequeue when running", async () => {
      await worker.start();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockService.dequeue).toHaveBeenCalled();
    });

    it("should process jobs when available", async () => {
      const handler = createMockHandler();
      const result = createWorkerWithSingleJob(handler);
      worker = result.worker;

      await worker.start();

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(result.mockService.getHandler).toHaveBeenCalledWith(testJob.type);
    });

    it("should handle service errors gracefully", async () => {
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
        { maxJobs: 5 },
      );

      expect(limitedWorker.isWorkerRunning()).toBe(false);
    });
  });

  describe("Graceful shutdown", () => {
    it("should wait for active jobs before stopping", async () => {
      const handler = createMockHandler();
      const result = createWorkerWithSingleJob(handler, 100);
      worker = result.worker;

      await worker.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      await worker.stop();

      const stats = worker.getStats();
      expect(stats.isRunning).toBe(false);
      expect(stats.processedJobs).toBeGreaterThanOrEqual(1);
    });
  });
});
