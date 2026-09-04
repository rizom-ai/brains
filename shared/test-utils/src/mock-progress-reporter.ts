import { mock } from "bun:test";
import type { ProgressReporter } from "@brains/utils/progress";

/**
 * Create a mock ProgressReporter for testing
 *
 * Returns a ProgressReporter-typed object where all methods are bun mock
 * functions. The literal is declared against `ProgressReporter` itself, so a
 * method added to the interface — or a signature that changes — fails to
 * compile here rather than leaving a silently incomplete mock.
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
  const mockReporter: ProgressReporter = {
    report: mock(() => Promise.resolve()),
    createSub: mock((): ProgressReporter => mockReporter),
    toCallback: mock((): (() => Promise<void>) => () => Promise.resolve()),
    startHeartbeat: mock(() => {}),
    stopHeartbeat: mock(() => {}),
  };

  return mockReporter;
}
