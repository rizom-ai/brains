import { mock } from "bun:test";
import type {
  IJobQueueService,
  JobInfo,
  JobHandler,
  JobValidator,
  JobQueueDiagnostics,
  JobQueueEnqueueRequest,
  PreparedJobEnqueue,
} from "@brains/job-queue";

/**
 * Options for configuring mock job queue service return values
 */
export interface MockJobQueueServiceReturns {
  enqueue?: string;
  dequeue?: unknown | null;
  getStatus?: JobInfo | null;
  getStatusByEntityId?: JobInfo | null;
  getHandler?: JobHandler | undefined;
  getValidator?: JobValidator | undefined;
  getStats?: {
    pending: number;
    processing: number;
    failed: number;
    completed: number;
    total: number;
  };
  getDiagnostics?: JobQueueDiagnostics;
  getActiveJobs?: JobInfo[];
  getFailedJobs?: JobInfo[];
  getRegisteredTypes?: string[];
  cleanup?: number;
}

/**
 * Options for creating a mock job queue service
 */
export interface MockJobQueueServiceOptions {
  returns?: MockJobQueueServiceReturns;
}

const defaultStats = {
  pending: 0,
  processing: 0,
  failed: 0,
  completed: 0,
  total: 0,
};

/**
 * Create a mock job queue service with all methods pre-configured.
 * The cast to IJobQueueService is centralized here so test files don't need unsafe casts.
 *
 * @example
 * ```ts
 * const mockQueue = createMockJobQueueService({
 *   returns: {
 *     enqueue: "job-123",
 *     getStatus: { id: "job-123", status: "completed", ... },
 *   },
 * });
 * ```
 */
export function createMockJobQueueService(
  options: MockJobQueueServiceOptions = {},
): IJobQueueService {
  const { returns = {} } = options;
  const jobs = new Map<string, JobInfo>();
  const handlers = new Map<string, JobHandler>();
  let generatedJobCount = 0;

  const createJobInfo = (
    request: JobQueueEnqueueRequest,
    id: string,
  ): JobInfo => {
    const now = Date.now();
    return {
      id,
      type: request.type,
      data: JSON.stringify(request.data),
      status: "pending",
      source: request.options?.source ?? null,
      priority: request.options?.priority ?? 0,
      retryCount: 0,
      maxRetries: request.options?.maxRetries ?? 3,
      lastError: null,
      createdAt: now,
      scheduledFor: request.options?.delayMs
        ? now + request.options.delayMs
        : now,
      startedAt: null,
      completedAt: null,
      attemptId: null,
      workerSlotId: null,
      workerSessionId: null,
      leaseExpiresAt: null,
      attemptHeartbeatAt: null,
      runtimeUpdatedAt: null,
      progress: null,
      metadata: {
        operationType:
          request.options?.metadata.operationType ?? "data_processing",
        ...(request.options?.metadata.pluginId && {
          pluginId: request.options.metadata.pluginId,
        }),
        ...(request.options?.metadata.progressToken !== undefined && {
          progressToken: request.options.metadata.progressToken,
        }),
        ...(request.options?.metadata.operationTarget && {
          operationTarget: request.options.metadata.operationTarget,
        }),
        ...(request.options?.metadata.interfaceType && {
          interfaceType: request.options.metadata.interfaceType,
        }),
        ...(request.options?.metadata.conversationId && {
          conversationId: request.options.metadata.conversationId,
        }),
        ...(request.options?.metadata.channelId && {
          channelId: request.options.metadata.channelId,
        }),
        rootJobId: request.options?.rootJobId ?? id,
      },
      result: null,
    };
  };

  return {
    registerHandler: mock((type: string, handler: JobHandler) => {
      handlers.set(type, handler);
    }),
    unregisterHandler: mock((type: string) => {
      handlers.delete(type);
    }),
    unregisterPluginHandlers: mock(() => {}),
    getHandler: mock(
      (type: string) => returns.getHandler ?? handlers.get(type),
    ),
    getValidator: mock(
      (type: string) =>
        returns.getValidator ?? returns.getHandler ?? handlers.get(type),
    ),
    finalizeHandlerRegistrations: mock(() => []),
    getExecutionRegistrations: mock(() => []),
    prepareEnqueue: mock(
      (request: JobQueueEnqueueRequest): PreparedJobEnqueue => {
        const validator =
          returns.getValidator ??
          returns.getHandler ??
          handlers.get(request.type);
        if (!validator) {
          throw new Error(`No job type declared: ${request.type}`);
        }
        const data = validator.validateAndParse(request.data);
        if (data === null) {
          throw new Error(`Invalid job data for type: ${request.type}`);
        }
        const jobId =
          request.idempotencyKey ?? `mock-job-id-${++generatedJobCount}`;
        return {
          jobId,
          request: { ...request, data, idempotencyKey: jobId },
        };
      },
    ),
    enqueue: mock((request: JobQueueEnqueueRequest) => {
      const id =
        request.idempotencyKey ??
        returns.enqueue ??
        `mock-job-id-${++generatedJobCount}`;
      if (!jobs.has(id)) jobs.set(id, createJobInfo(request, id));
      return Promise.resolve(id);
    }),
    dequeue: mock(() => Promise.resolve(returns.dequeue ?? null)),
    startWorkerSession: mock(() => Promise.resolve()),
    heartbeatWorkerSession: mock(() => Promise.resolve(true)),
    endWorkerSession: mock(() => Promise.resolve(true)),
    renewAttemptLease: mock(() => Promise.resolve(true)),
    recordAttemptProgress: mock(() => Promise.resolve(true)),
    complete: mock((jobId: string, result: unknown) => {
      const job = jobs.get(jobId);
      if (job) {
        jobs.set(jobId, {
          ...job,
          status: "completed",
          result,
          lastError: null,
          completedAt: Date.now(),
        });
      }
      return Promise.resolve(true);
    }),
    fail: mock((jobId: string, error: Error) => {
      const job = jobs.get(jobId);
      if (job) {
        jobs.set(jobId, {
          ...job,
          status: "failed",
          lastError: error.message,
          completedAt: Date.now(),
        });
      }
      return Promise.resolve(true);
    }),
    update: mock(() => Promise.resolve(true)),
    getStatus: mock(() => Promise.resolve(returns.getStatus ?? null)),
    getStatusByEntityId: mock(() =>
      Promise.resolve(returns.getStatusByEntityId ?? null),
    ),
    getStats: mock(() => Promise.resolve(returns.getStats ?? defaultStats)),
    getDiagnostics: mock(() =>
      Promise.resolve(
        returns.getDiagnostics ?? {
          totals: {
            pending: defaultStats.pending,
            processing: defaultStats.processing,
            failed: defaultStats.failed,
            completed: defaultStats.completed,
          },
          byType: [],
          oldestPendingAgeMs: null,
          duePending: 0,
          oldestDuePendingAgeMs: null,
          latestClaimAgeMs: null,
          oldestProcessingAgeMs: null,
          staleLeaseCount: 0,
          workerSessions: {
            total: 1,
            active: 1,
            stale: 0,
            latestHeartbeatAgeMs: 0,
          },
        },
      ),
    ),
    getRuntimeUpdates: mock(() => Promise.resolve([])),
    cleanup: mock(() => Promise.resolve(returns.cleanup ?? 0)),
    getActiveJobs: mock(() =>
      Promise.resolve(
        returns.getActiveJobs ??
          Array.from(jobs.values()).filter(
            (job) => job.status === "pending" || job.status === "processing",
          ),
      ),
    ),
    getFailedJobs: mock(() =>
      Promise.resolve(
        returns.getFailedJobs ??
          Array.from(jobs.values()).filter((job) => job.status === "failed"),
      ),
    ),
    getRegisteredTypes: mock(
      () => returns.getRegisteredTypes ?? [...handlers.keys()],
    ),
  } as unknown as IJobQueueService;
}
