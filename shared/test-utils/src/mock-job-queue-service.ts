import { mock } from "bun:test";
import type {
  IJobQueueService,
  JobInfo,
  JobHandler,
  JobQueueEnqueueRequest,
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
  getStats?: {
    pending: number;
    processing: number;
    failed: number;
    completed: number;
    total: number;
  };
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
    registerHandler: mock(() => {}),
    unregisterHandler: mock(() => {}),
    unregisterPluginHandlers: mock(() => {}),
    getHandler: mock(() => returns.getHandler),
    enqueue: mock((request: JobQueueEnqueueRequest) => {
      const id = returns.enqueue ?? `mock-job-id-${++generatedJobCount}`;
      jobs.set(id, createJobInfo(request, id));
      return Promise.resolve(id);
    }),
    dequeue: mock(() => Promise.resolve(returns.dequeue ?? null)),
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
      return Promise.resolve();
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
      return Promise.resolve();
    }),
    update: mock(() => Promise.resolve()),
    getStatus: mock(() => Promise.resolve(returns.getStatus ?? null)),
    getStatusByEntityId: mock(() =>
      Promise.resolve(returns.getStatusByEntityId ?? null),
    ),
    getStats: mock(() => Promise.resolve(returns.getStats ?? defaultStats)),
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
    getRegisteredTypes: mock(() => returns.getRegisteredTypes ?? []),
  } as unknown as IJobQueueService;
}
