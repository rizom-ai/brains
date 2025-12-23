import { mock } from "bun:test";
import type { ProgressReporter } from "@brains/utils";

/**
 * Mock progress reporter type with spyable methods
 */
export interface MockProgressReporter {
  report: ReturnType<typeof mock>;
  createSub: ReturnType<typeof mock>;
  toCallback: ReturnType<typeof mock>;
  startHeartbeat: ReturnType<typeof mock>;
  stopHeartbeat: ReturnType<typeof mock>;
}

/**
 * Create a mock ProgressReporter for testing
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
export function createMockProgressReporter(): MockProgressReporter {
  const mockReporter: MockProgressReporter = {
    report: mock(() => Promise.resolve()),
    createSub: mock(() => mockReporter),
    toCallback: mock(() => () => Promise.resolve()),
    startHeartbeat: mock(() => {}),
    stopHeartbeat: mock(() => {}),
  };

  return mockReporter;
}

/**
 * Cast MockProgressReporter to ProgressReporter for type compatibility
 */
export function asMockProgressReporter(
  mockReporter: MockProgressReporter,
): ProgressReporter {
  return mockReporter as unknown as ProgressReporter;
}
