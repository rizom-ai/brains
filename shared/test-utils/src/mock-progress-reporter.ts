import { mock } from "bun:test";
import type { ProgressReporter } from "@brains/utils/progress";
import type { PublicSurface } from "./public-surface";

/**
 * Create a mock ProgressReporter for testing
 *
 * Returns a ProgressReporter-typed object where all methods are bun mock
 * functions, so test files need no casts of their own. The literal is declared
 * against `PublicSurface<ProgressReporter>`, so a new or changed public method
 * fails to compile here rather than leaving a silently incomplete mock.
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
  const mockReporter: PublicSurface<ProgressReporter> = {
    report: mock(() => Promise.resolve()),
    createSub: mock((): ProgressReporter => mockReporter as ProgressReporter),
    toCallback: mock((): (() => Promise<void>) => () => Promise.resolve()),
    startHeartbeat: mock(() => {}),
    stopHeartbeat: mock(() => {}),
  };

  // Only the nominal private-field gap remains; the shape is checked above.
  return mockReporter as ProgressReporter;
}
