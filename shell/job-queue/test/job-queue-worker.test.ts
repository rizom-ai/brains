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
import type {
  IJobQueueService,
  JobClaimOptions,
  JobInfo,
  JobQueueWorkerConfig,
} from "../src/types";
import {
  createMockLogger,
  createSilentLogger,
  createMockProgressReporter,
  createMockJobQueueService,
  waitUntil,
} from "@brains/test-utils";
import { createId } from "@brains/utils/id";
import type {
  IJobProgressMonitor,
  ProgressReporter,
} from "@brains/utils/progress";
import { Effect } from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import { OperationContext } from "@brains/operation-context";

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
  attemptId: "attempt-123",
  workerSlotId: "worker-a",
  workerSessionId: "session-a",
  leaseExpiresAt: Date.now() + 30_000,
  attemptHeartbeatAt: Date.now(),
  runtimeUpdatedAt: Date.now(),
  progress: null,
  metadata: {
    rootJobId: createId(),
    operationType: "data_processing",
  },
  source: null,
};

interface MockHandler {
  executionTimeoutMs?: number;
  process: ReturnType<typeof mock>;
  onTerminalSuccess: ReturnType<typeof mock>;
  onError: ReturnType<typeof mock>;
  onTerminalError: ReturnType<typeof mock>;
  validateAndParse: ReturnType<typeof mock>;
}

function createMockHandler(): MockHandler {
  return {
    process: mock(() => Promise.resolve({ success: true })),
    onTerminalSuccess: mock(() => Promise.resolve()),
    onError: mock(() => Promise.resolve()),
    onTerminalError: mock(() => Promise.resolve()),
    validateAndParse: mock(() => ({ id: "entity-123", content: "test" })),
  };
}

function createWorkerWithClock(
  service: IJobQueueService,
  progressMonitor: IJobProgressMonitor,
  config: JobQueueWorkerConfig,
  clock: Clock.Clock,
): JobQueueWorker {
  // createFresh already declares runtimeOptions; the cast this replaces
  // re-stated a signature that was there all along.
  return JobQueueWorker.createFresh(
    service,
    progressMonitor,
    createSilentLogger(),
    config,
    { clock },
  );
}

function createWorkerWithSingleJob(handler: MockHandler): {
  worker: JobQueueWorker;
  mockService: IJobQueueService;
} {
  let callCount = 0;
  const mockService = createMockJobQueueService({
    returns: { getHandler: handler },
  });

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

    it("serializes a restart requested while stop is draining", async () => {
      const handler = createMockHandler();
      let signalStarted: (() => void) | undefined;
      const started = new Promise<void>((resolve) => {
        signalStarted = resolve;
      });
      let releaseJob: (() => void) | undefined;
      const blocked = new Promise<void>((resolve) => {
        releaseJob = resolve;
      });
      handler.process.mockImplementation(async () => {
        signalStarted?.();
        await blocked;
        return { success: true };
      });
      const result = createWorkerWithSingleJob(handler);
      worker = result.worker;
      await worker.start();
      await started;

      const stopping = worker.stop();
      const joinedStop = worker.stop();
      const restarting = worker.start();
      expect(joinedStop).toBe(stopping);
      releaseJob?.();
      await Promise.all([stopping, restarting]);

      expect(worker.isWorkerRunning()).toBe(true);
      await worker.stop();
    });

    it("should create a fresh fiber scope when restarted", async () => {
      await worker.start();
      await worker.stop();
      await worker.start();

      expect(worker.isWorkerRunning()).toBe(true);

      await worker.stop();
      expect(worker.isWorkerRunning()).toBe(false);
    });
  });

  describe("Fenced worker lifecycle", () => {
    it("registers a fresh session before claiming and ends it after a clean stop", async () => {
      const startWorkerSession = spyOn(mockService, "startWorkerSession");
      let observeClaim: (claim: JobClaimOptions) => void = () => undefined;
      const claimed = new Promise<JobClaimOptions>((resolve) => {
        observeClaim = resolve;
      });
      spyOn(mockService, "dequeue").mockImplementation(async (claim) => {
        if (claim) observeClaim(claim);
        return null;
      });
      worker = JobQueueWorker.createFresh(
        mockService,
        mockProgressMonitor,
        createSilentLogger(),
        {
          pollInterval: 10,
          workerSlotId: "stable-slot",
          leaseDurationMs: 5_000,
          workerSessionTimeoutMs: 15_000,
        },
      );

      await worker.start();
      const observedClaim = await claimed;

      expect(startWorkerSession).toHaveBeenCalledTimes(1);
      const startCall = startWorkerSession.mock.calls[0];
      if (!startCall) throw new Error("Worker session was not registered");
      expect(startCall[0]).toBe("stable-slot");
      expect(startCall[1]).toBeString();
      expect(startCall[2]).toBe(15_000);
      expect(observedClaim).toEqual({
        workerSlotId: "stable-slot",
        workerSessionId: startCall[1],
        leaseDurationMs: 5_000,
      });

      await worker.stop();
      expect(mockService.endWorkerSession).toHaveBeenCalledWith(
        "stable-slot",
        startCall[1],
      );
    });

    it("uses a new session token each time the same worker restarts", async () => {
      const startWorkerSession = spyOn(mockService, "startWorkerSession");
      worker = JobQueueWorker.createFresh(
        mockService,
        mockProgressMonitor,
        createSilentLogger(),
        { pollInterval: 10, workerSlotId: "stable-slot" },
      );

      await worker.start();
      await worker.stop();
      await worker.start();
      await worker.stop();

      const sessionIds = startWorkerSession.mock.calls.map((call) => call[1]);
      expect(sessionIds).toHaveLength(2);
      expect(sessionIds[0]).not.toBe(sessionIds[1]);
    });

    it("fails closed when a claimed processing job has no fencing token", async () => {
      const handler = createMockHandler();
      let dequeueCalls = 0;
      const service = createMockJobQueueService({
        returns: { getHandler: handler },
      });
      spyOn(service, "dequeue").mockImplementation(async () => {
        dequeueCalls++;
        return dequeueCalls === 1 ? { ...testJob, attemptId: null } : null;
      });
      const logger = createMockLogger();
      let signalUnhealthy: () => void = () => undefined;
      const unhealthy = new Promise<void>((resolve) => {
        signalUnhealthy = resolve;
      });
      spyOn(logger, "error").mockImplementation((message) => {
        if (message === "Job queue worker is unhealthy") signalUnhealthy();
      });
      const onUnhealthy = mock((_reason: string) => undefined);
      worker = JobQueueWorker.createFresh(
        service,
        mockProgressMonitor,
        logger,
        { pollInterval: 5, onUnhealthy },
      );

      await worker.start();
      await unhealthy;

      expect(handler.process).not.toHaveBeenCalled();
      expect(service.complete).not.toHaveBeenCalled();
      expect(service.fail).not.toHaveBeenCalled();
      expect(onUnhealthy).toHaveBeenCalledTimes(1);
      expect(onUnhealthy).toHaveBeenCalledWith(
        "Claimed job test-job-123 has no attempt fencing token",
      );
      await worker.stop();
      expect(worker.getStats()).toMatchObject({
        isHealthy: false,
        failedJobs: 1,
      });
    });

    it("heartbeats the worker session and renews a running attempt lease", async () => {
      const handler = createMockHandler();
      let release: () => void = () => {};
      let signalJobStarted: () => void = () => undefined;
      const jobStarted = new Promise<void>((resolve) => {
        signalJobStarted = resolve;
      });
      handler.process.mockImplementation(
        () =>
          new Promise((resolve) => {
            signalJobStarted();
            release = (): void => resolve({ success: true });
          }),
      );
      const result = createWorkerWithSingleJob(handler);
      mockService = result.mockService;
      let signalWorkerHeartbeat: () => void = () => undefined;
      const workerHeartbeat = new Promise<void>((resolve) => {
        signalWorkerHeartbeat = resolve;
      });
      spyOn(mockService, "heartbeatWorkerSession").mockImplementation(
        async () => {
          signalWorkerHeartbeat();
          return true;
        },
      );
      let signalAttemptHeartbeat: () => void = () => undefined;
      const attemptHeartbeat = new Promise<void>((resolve) => {
        signalAttemptHeartbeat = resolve;
      });
      spyOn(mockService, "renewAttemptLease").mockImplementation(async () => {
        signalAttemptHeartbeat();
        return true;
      });
      worker = JobQueueWorker.createFresh(
        mockService,
        mockProgressMonitor,
        createSilentLogger(),
        {
          pollInterval: 5,
          workerSlotId: "stable-slot",
          workerHeartbeatIntervalMs: 10,
          attemptHeartbeatIntervalMs: 10,
          leaseDurationMs: 100,
        },
      );

      await worker.start();
      try {
        await jobStarted;
        await Promise.all([workerHeartbeat, attemptHeartbeat]);

        expect(mockService.heartbeatWorkerSession).toHaveBeenCalled();
        expect(mockService.renewAttemptLease).toHaveBeenCalledWith(
          testJob.id,
          testJob.attemptId,
          100,
        );
      } finally {
        release();
      }
      await worker.stop();
    });
  });

  describe("Job deadlines", () => {
    it("passes an AbortSignal and fails a cooperative timed-out attempt only after it settles", async () => {
      const handler = createMockHandler();
      handler.executionTimeoutMs = 15;
      let receivedSignal: AbortSignal | undefined;
      let signalAborted: () => void = () => undefined;
      const aborted = new Promise<void>((resolve) => {
        signalAborted = resolve;
      });
      let releaseSettlement: () => void = () => undefined;
      const settlementAllowed = new Promise<void>((resolve) => {
        releaseSettlement = resolve;
      });
      let settled = false;
      handler.process.mockImplementation(
        (
          _data: unknown,
          _jobId: string,
          _reporter: ProgressReporter,
          signal: AbortSignal,
        ) =>
          new Promise((resolve) => {
            receivedSignal = signal;
            signal.addEventListener(
              "abort",
              () => {
                signalAborted();
                void settlementAllowed.then(() => {
                  settled = true;
                  resolve({ success: true });
                });
              },
              { once: true },
            );
          }),
      );
      const result = createWorkerWithSingleJob(handler);
      mockService = result.mockService;
      let signalFailed: () => void = () => undefined;
      const failed = new Promise<void>((resolve) => {
        signalFailed = resolve;
      });
      const fail = spyOn(mockService, "fail").mockImplementation(async () => {
        signalFailed();
        return true;
      });
      worker = JobQueueWorker.createFresh(
        mockService,
        mockProgressMonitor,
        createSilentLogger(),
        { pollInterval: 5, cancellationGraceMs: 30 },
      );

      await worker.start();
      await aborted;
      expect(fail).not.toHaveBeenCalled();
      releaseSettlement();
      await failed;

      expect(receivedSignal).toBeInstanceOf(AbortSignal);
      expect(receivedSignal?.aborted).toBe(true);
      expect(settled).toBe(true);
      expect(fail).toHaveBeenCalledWith(
        testJob.id,
        expect.objectContaining({
          message: expect.stringContaining("deadline"),
        }),
        testJob.attemptId,
      );
      expect(mockService.complete).not.toHaveBeenCalled();
      expect(worker.getStats().isHealthy).toBe(true);
    });

    it("keeps an uncooperative timed-out handler fenced in place and stops claiming work", async () => {
      const handler = createMockHandler();
      handler.executionTimeoutMs = 10;
      let release: () => void = () => undefined;
      handler.process.mockImplementation(
        () =>
          new Promise((resolve) => {
            release = (): void => resolve({ success: true });
          }),
      );
      const result = createWorkerWithSingleJob(handler);
      mockService = result.mockService;
      let signalFailed: () => void = () => undefined;
      const failed = new Promise<void>((resolve) => {
        signalFailed = resolve;
      });
      const fail = spyOn(mockService, "fail").mockImplementation(async () => {
        signalFailed();
        return true;
      });
      const logger = createMockLogger();
      let signalUnhealthy: () => void = () => undefined;
      const unhealthy = new Promise<void>((resolve) => {
        signalUnhealthy = resolve;
      });
      spyOn(logger, "error").mockImplementation((message) => {
        if (message === "Job queue worker is unhealthy") signalUnhealthy();
      });
      worker = JobQueueWorker.createFresh(
        mockService,
        mockProgressMonitor,
        logger,
        { pollInterval: 5, cancellationGraceMs: 10 },
      );

      await worker.start();
      try {
        await unhealthy;

        expect(worker.getStats()).toMatchObject({
          isHealthy: false,
          activeJobs: 1,
        });
        expect(mockService.dequeue).toHaveBeenCalledTimes(1);
        expect(fail).not.toHaveBeenCalled();
        expect(mockService.complete).not.toHaveBeenCalled();
      } finally {
        release();
      }
      await failed;
      expect(fail).toHaveBeenCalledWith(
        testJob.id,
        expect.any(Error),
        testJob.attemptId,
      );
    });

    it("bounds an uncooperative handler error callback", async () => {
      const handler = createMockHandler();
      handler.process.mockRejectedValue(new Error("processing failed"));
      let errorSignal: AbortSignal | undefined;
      let releaseOnError: () => void = () => undefined;
      handler.onError.mockImplementation(
        (
          _error: Error,
          _data: unknown,
          _jobId: string,
          _reporter: ProgressReporter,
          signal: AbortSignal,
        ) =>
          new Promise<void>((resolve) => {
            errorSignal = signal;
            releaseOnError = resolve;
          }),
      );
      const result = createWorkerWithSingleJob(handler);
      mockService = result.mockService;
      let signalUnhealthy: () => void = () => undefined;
      const unhealthy = new Promise<void>((resolve) => {
        signalUnhealthy = resolve;
      });
      const onUnhealthy = mock((_reason: string) => signalUnhealthy());
      worker = JobQueueWorker.createFresh(
        mockService,
        mockProgressMonitor,
        createSilentLogger(),
        {
          pollInterval: 5,
          errorCallbackTimeoutMs: 10,
          cancellationGraceMs: 10,
          onUnhealthy,
        },
      );

      await worker.start();
      try {
        await unhealthy;
        expect(errorSignal?.aborted).toBe(true);
        expect(mockService.fail).not.toHaveBeenCalled();
        expect(worker.getStats()).toMatchObject({
          isHealthy: false,
          activeJobs: 1,
        });
      } finally {
        releaseOnError();
      }
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

      await autoWorker.start();
      expect(autoWorker.isWorkerRunning()).toBe(true);
      await autoWorker.stop();
      expect(autoWorker.isWorkerRunning()).toBe(false);
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

      // uptime is the thing under test, so wait for it rather than for a
      // duration chosen to be comfortably longer than one clock tick.
      await waitUntil(
        () => worker.getStats().uptime > 0,
        "the worker's uptime to advance past zero",
      );

      const stats = worker.getStats();
      expect(stats.isRunning).toBe(true);
      expect(stats.uptime).toBeGreaterThan(0);
    });
  });

  describe("Job processing integration", () => {
    it("should poll on schedule and stop polling when stopped", async () => {
      const program = Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        worker = createWorkerWithClock(
          mockService,
          mockProgressMonitor,
          { pollInterval: 50 },
          clock,
        );

        try {
          yield* Effect.promise(() => worker.start());
          yield* Effect.yieldNow();

          yield* TestClock.adjust(49);
          expect(mockService.dequeue).not.toHaveBeenCalled();

          yield* TestClock.adjust(1);
          yield* Effect.yieldNow();
          expect(mockService.dequeue).toHaveBeenCalledTimes(1);

          yield* Effect.promise(() => worker.stop());
          yield* TestClock.adjust(500);
          yield* Effect.yieldNow();
          expect(mockService.dequeue).toHaveBeenCalledTimes(1);
        } finally {
          if (worker.isWorkerRunning()) {
            yield* Effect.promise(() => worker.stop());
          }
        }
      }).pipe(Effect.provide(TestContext.TestContext));

      await Effect.runPromise(program);
    });

    it("should process jobs when available", async () => {
      const handler = createMockHandler();
      const result = createWorkerWithSingleJob(handler);
      worker = result.worker;

      await worker.start();

      await waitUntil(
        () => worker.getStats().processedJobs > 0,
        "the worker to process the available job",
      );

      expect(result.mockService.getHandler).toHaveBeenCalledWith(testJob.type);
    });

    it("should handle service errors gracefully", async () => {
      await worker.start();
      expect(worker.isWorkerRunning()).toBe(true);
    });
  });

  describe("Causal execution context", () => {
    it("restores persisted provenance only for the claimed attempt", async () => {
      const operationContext = OperationContext.createFresh();
      const provenance = {
        rootJobId: "root-job",
        causationId: "topics-message",
        projectionId: "skill-derivation",
        projectionLineage: ["topics-projection", "skill-derivation"],
        derivationDepth: 2,
      };
      let handlerContext: ReturnType<OperationContext["current"]>;
      let handlerEntered!: () => void;
      const entered = new Promise<void>((resolve) => {
        handlerEntered = resolve;
      });
      const handler = createMockHandler();
      handler.process.mockImplementation(async () => {
        handlerContext = operationContext.current();
        handlerEntered();
        return { success: true };
      });
      const service = createMockJobQueueService({
        returns: { getHandler: handler },
      });
      let dequeueCount = 0;
      spyOn(service, "dequeue").mockImplementation(() => {
        dequeueCount++;
        return Promise.resolve(
          dequeueCount === 1
            ? {
                ...testJob,
                metadata: {
                  ...testJob.metadata,
                  provenance,
                },
              }
            : null,
        );
      });
      worker = JobQueueWorker.createFresh(
        service,
        new MockProgressMonitor(),
        createSilentLogger(),
        { pollInterval: 20 },
        { operationContext },
      );

      await worker.start();
      await entered;
      await worker.stop();

      expect(handlerContext).toEqual({
        provenance,
        operationId: testJob.id,
      });
      expect(operationContext.current()).toBeUndefined();
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

    it("should count failed jobs toward maxJobs", async () => {
      const handler = createMockHandler();
      handler.process.mockImplementation(() => {
        throw new Error("boom");
      });

      let dequeueCount = 0;
      const service = createMockJobQueueService({
        returns: {
          getHandler: handler,
          getStatus: { ...testJob, status: "failed", lastError: "boom" },
        },
      });
      spyOn(service, "dequeue").mockImplementation(() => {
        dequeueCount++;
        return Promise.resolve({ ...testJob, id: `failed-${dequeueCount}` });
      });

      worker = JobQueueWorker.createFresh(
        service,
        new MockProgressMonitor(),
        createSilentLogger(),
        { pollInterval: 20, maxJobs: 1 },
      );

      await worker.start();
      await waitUntil(
        () => worker.getStats().failedJobs > 0,
        "the worker to count the failed job",
      );

      const stats = worker.getStats();
      expect(stats.failedJobs).toBe(1);
      expect(service.dequeue).toHaveBeenCalledTimes(1);
    });
  });

  describe("Graceful shutdown", () => {
    it("should wait for active jobs before stopping", async () => {
      const handler = createMockHandler();
      let releaseProcessing = (): void => {};
      const processing = new Promise<void>((resolve) => {
        releaseProcessing = resolve;
      });
      handler.process.mockImplementation(async () => {
        await processing;
        return { success: true };
      });
      const result = createWorkerWithSingleJob(handler);
      worker = result.worker;

      await worker.start();
      await waitUntil(
        () => worker.getStats().activeJobs > 0,
        "the worker to claim a job and begin processing it",
      );

      let stopped = false;
      const stopPromise = worker.stop().then(() => {
        stopped = true;
      });
      await Promise.resolve();
      expect(stopped).toBe(false);
      releaseProcessing();
      await stopPromise;

      const stats = worker.getStats();
      expect(stats.isRunning).toBe(false);
      expect(stats.processedJobs).toBeGreaterThanOrEqual(1);
    });

    it("should wait for jobs claimed by an in-flight poll during stop", async () => {
      const handler = createMockHandler();
      let releaseProcessing = (): void => {};
      let signalProcessingStarted = (): void => {};
      const processing = new Promise<void>((resolve) => {
        releaseProcessing = resolve;
      });
      const processingStarted = new Promise<void>((resolve) => {
        signalProcessingStarted = resolve;
      });
      handler.process.mockImplementation(async () => {
        signalProcessingStarted();
        await processing;
        return { success: true };
      });

      let releaseDequeue: (job: JobInfo | null) => void = () => {};
      let signalDequeueStarted: () => void = () => {};
      const dequeueStarted = new Promise<void>((resolve) => {
        signalDequeueStarted = resolve;
      });

      let dequeueCalls = 0;
      const service = createMockJobQueueService({
        returns: { getHandler: handler },
      });
      spyOn(service, "dequeue").mockImplementation(() => {
        dequeueCalls++;
        if (dequeueCalls === 1) {
          signalDequeueStarted();
          return new Promise<JobInfo | null>((resolve) => {
            releaseDequeue = resolve;
          });
        }
        return Promise.resolve(null);
      });

      // concurrency 2 so the poll loop would try a second dequeue after stop
      worker = JobQueueWorker.createFresh(
        service,
        new MockProgressMonitor(),
        createSilentLogger(),
        { pollInterval: 10, concurrency: 2 },
      );
      await worker.start();

      // Poll is past its shouldStop check and blocked inside dequeue()
      await dequeueStarted;
      let stopped = false;
      const stopPromise = worker.stop().then(() => {
        stopped = true;
      });
      // The in-flight dequeue claims a job after stop() was called.
      releaseDequeue(testJob);
      await processingStarted;
      expect(stopped).toBe(false);
      releaseProcessing();
      await stopPromise;

      // The claimed job must be fully processed before stop() resolves,
      // and no further dequeue may happen once stop was requested
      expect(worker.getStats().processedJobs).toBe(1);
      expect(dequeueCalls).toBe(1);
    });
  });

  describe("Handler failure propagation", () => {
    it("should call fail() when handler returns { success: false }", async () => {
      const handler = createMockHandler();
      handler.process.mockImplementation(() =>
        Promise.resolve({ success: false, error: "Title is required" }),
      );
      const result = createWorkerWithSingleJob(handler);
      worker = result.worker;

      await worker.start();
      await waitUntil(
        () => worker.getStats().failedJobs > 0,
        "the worker to finish failing the job",
      );

      expect(result.mockService.fail).toHaveBeenCalled();
      expect(result.mockService.complete).not.toHaveBeenCalled();
    });

    it("should call complete() when handler returns { success: true }", async () => {
      const handler = createMockHandler();
      handler.process.mockImplementation(() =>
        Promise.resolve({ success: true, entityId: "abc" }),
      );
      const result = createWorkerWithSingleJob(handler);
      worker = result.worker;

      await worker.start();
      await waitUntil(
        () => worker.getStats().processedJobs > 0,
        "the worker to finish completing the job",
      );

      expect(result.mockService.complete).toHaveBeenCalledWith(
        testJob.id,
        { success: true, entityId: "abc" },
        testJob.attemptId,
      );
      expect(result.mockService.fail).not.toHaveBeenCalled();
      expect(handler.onTerminalSuccess).toHaveBeenCalledWith(
        { id: "entity-123", content: "test" },
        testJob.id,
        expect.any(Object),
        expect.any(AbortSignal),
      );
    });

    it("should report failed status to progress monitor when handler returns failure", async () => {
      const handler = createMockHandler();
      handler.process.mockImplementation(() =>
        Promise.resolve({ success: false, error: "No content source" }),
      );

      const progressMonitor = new MockProgressMonitor();
      const handleStatusChange = spyOn(
        progressMonitor,
        "handleJobStatusChange",
      );

      let callCount = 0;
      const service = createMockJobQueueService({
        returns: {
          getHandler: handler,
          getStatus: {
            ...testJob,
            status: "failed",
            lastError: "No content source",
          },
        },
      });
      spyOn(service, "dequeue").mockImplementation(() => {
        callCount++;
        return callCount === 1
          ? Promise.resolve(testJob)
          : Promise.resolve(null);
      });

      worker = JobQueueWorker.createFresh(
        service,
        progressMonitor,
        createSilentLogger(),
        {
          pollInterval: 50,
        },
      );

      await worker.start();
      await waitUntil(
        () => worker.getStats().failedJobs > 0,
        "the worker to finish failing the job",
      );

      expect(handleStatusChange).toHaveBeenCalledWith(
        testJob.id,
        "failed",
        testJob.metadata,
      );
      expect(handler.onTerminalError).toHaveBeenCalledTimes(1);
    });

    it("should not report failed status for controlled failure while retry is pending", async () => {
      const handler = createMockHandler();
      handler.process.mockImplementation(() =>
        Promise.resolve({ success: false, error: "Retry me" }),
      );

      const progressMonitor = new MockProgressMonitor();
      const handleStatusChange = spyOn(
        progressMonitor,
        "handleJobStatusChange",
      );

      let callCount = 0;
      const service = createMockJobQueueService({
        returns: {
          getHandler: handler,
          getStatus: { ...testJob, status: "pending", lastError: "Retry me" },
        },
      });
      spyOn(service, "dequeue").mockImplementation(() => {
        callCount++;
        return callCount === 1
          ? Promise.resolve(testJob)
          : Promise.resolve(null);
      });

      worker = JobQueueWorker.createFresh(
        service,
        progressMonitor,
        createSilentLogger(),
        {
          pollInterval: 50,
        },
      );

      await worker.start();
      // Both assertions below are negative, and nothing can wait for an event
      // that never arrives. Wait instead for the job to be done with — once the
      // worker has counted it, the reporting decision has already been made.
      await waitUntil(
        () => worker.getStats().failedJobs > 0,
        "the worker to finish processing the retryable failure",
      );

      expect(handleStatusChange).not.toHaveBeenCalled();
      expect(handler.onTerminalError).not.toHaveBeenCalled();
    });

    it("should count handler { success: false } as a failed job in stats", async () => {
      const handler = createMockHandler();
      handler.process.mockImplementation(() =>
        Promise.resolve({ success: false, error: "Missing title" }),
      );
      const result = createWorkerWithSingleJob(handler);
      worker = result.worker;

      await worker.start();
      await waitUntil(
        () => worker.getStats().failedJobs > 0,
        "the worker to count the failed job",
      );

      const stats = worker.getStats();
      expect(stats.failedJobs).toBe(1);
      expect(stats.processedJobs).toBe(0);
    });
  });
});
