import { mock } from "bun:test";
import type { ProgressReporter } from "@brains/utils";

/**
 * Create a mock ProgressReporter for testing
 *
 * Returns a ProgressReporter-typed object where all methods are bun mock functions.
 * The cast is centralized here so test files don't need `as unknown as` casts.
 *
 * @example
 * ```typescript
 * const mockProgress = createMockProgressReporter();
 *
 * await handler.process(data, jobId, mockProgress);
 *
 * expect(mockProgress.report).toHaveBeenCalledWith({
 *   progress: 100,
 *   message: "Complete"
 * });
 * ```
 */
export function createMockProgressReporter(): ProgressReporter {
  const mockReporter = {
    report: mock(() => Promise.resolve()),
    createSub: mock(() => mockReporter),
    toCallback: mock((): (() => Promise<void>) => () => Promise.resolve()),
    startHeartbeat: mock(() => {}),
    stopHeartbeat: mock(() => {}),
  };

  return mockReporter as unknown as ProgressReporter;
}
