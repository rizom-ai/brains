import { mock } from "bun:test";
import type { IJobQueueService, JobInfo, JobHandler } from "@brains/job-queue";

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

  return {
    registerHandler: mock(() => {}),
    unregisterHandler: mock(() => {}),
    unregisterPluginHandlers: mock(() => {}),
    getHandler: mock(() => returns.getHandler),
    enqueue: mock(() => Promise.resolve(returns.enqueue ?? "mock-job-id")),
    dequeue: mock(() => Promise.resolve(returns.dequeue ?? null)),
    complete: mock(() => Promise.resolve()),
    fail: mock(() => Promise.resolve()),
    update: mock(() => Promise.resolve()),
    getStatus: mock(() => Promise.resolve(returns.getStatus ?? null)),
    getStatusByEntityId: mock(() =>
      Promise.resolve(returns.getStatusByEntityId ?? null),
    ),
    getStats: mock(() => Promise.resolve(returns.getStats ?? defaultStats)),
    cleanup: mock(() => Promise.resolve(returns.cleanup ?? 0)),
    getActiveJobs: mock(() => Promise.resolve(returns.getActiveJobs ?? [])),
    getRegisteredTypes: mock(() => returns.getRegisteredTypes ?? []),
  } as unknown as IJobQueueService;
}
