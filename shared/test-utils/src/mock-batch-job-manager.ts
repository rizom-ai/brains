import { mock } from "bun:test";
import type {
  Batch,
  BatchJobStatus,
  IBatchJobManager,
} from "@brains/job-queue";

/**
 * Options for configuring mock BatchJobManager behavior
 */
export interface MockBatchJobManagerOptions {
  returns?: MockBatchJobManagerReturns;
}

/**
 * Configure what the mock methods return
 */
export interface MockBatchJobManagerReturns {
  enqueueBatch?: string;
  getBatchStatus?: BatchJobStatus | null;
  getActiveBatches?: Batch[];
}

/**
 * Create a mock IBatchJobManager for testing
 *
 * Returns an IBatchJobManager-typed object where all methods are bun mock functions.
 * The cast is centralized here so test files don't need `as unknown as` casts.
 *
 * @example
 * ```typescript
 * const mockBatchJobManager = createMockBatchJobManager();
 *
 * const monitor = JobProgressMonitor.createFresh(
 *   mockJobQueueService,
 *   mockMessageBus,
 *   mockBatchJobManager,
 *   mockLogger,
 * );
 *
 * expect(mockBatchJobManager.getBatchStatus).toHaveBeenCalledWith("batch-123");
 * ```
 */
export function createMockBatchJobManager(
  options: MockBatchJobManagerOptions = {},
): IBatchJobManager {
  const returns = options.returns ?? {};

  const mockManager: IBatchJobManager = {
    start: mock(() => {}),
    stop: mock(() => {}),
    registerBatch: mock(() => {}),
    enqueueBatch: mock(() =>
      Promise.resolve(returns.enqueueBatch ?? "batch-id"),
    ),
    getBatchStatus: mock(() => Promise.resolve(returns.getBatchStatus ?? null)),
    getActiveBatches: mock(() =>
      Promise.resolve(returns.getActiveBatches ?? []),
    ),
  };

  return mockManager;
}
