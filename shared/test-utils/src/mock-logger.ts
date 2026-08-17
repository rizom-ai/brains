import { mock } from "bun:test";
import { Logger, LogLevel } from "@brains/utils/logger";
import type { PublicSurface } from "./public-surface";

/**
 * Create a silent logger for tests
 * This is a real logger with LogLevel.NONE - no output
 *
 * Use when you just need a logger that doesn't print anything
 */
export function createSilentLogger(context?: string): Logger {
  return Logger.createFresh({
    level: LogLevel.NONE,
    ...(context ? { context } : {}),
  });
}

/**
 * Create a test logger with a specific log level
 * Useful for debugging tests
 */
export function createTestLogger(
  level: LogLevel = LogLevel.NONE,
  context?: string,
): Logger {
  return Logger.createFresh({
    level,
    ...(context ? { context } : {}),
  });
}

/**
 * Create a mock Logger for testing with spyable methods
 *
 * Returns a Logger-typed object where all methods are bun mock functions, so
 * test files need no casts of their own. The literal is declared against
 * `PublicSurface<Logger>`, so a new or changed public Logger method fails to
 * compile here rather than leaving a silently incomplete mock.
 *
 * Use when you need to assert that specific log calls were made
 *
 * @example
 * ```typescript
 * const mockLogger = createMockLogger();
 * const handler = new MyHandler(mockLogger);
 * await handler.process(data);
 *
 * expect(mockLogger.info).toHaveBeenCalledWith("Processing started");
 * ```
 */
export function createMockLogger(): Logger {
  const mockLogger: PublicSurface<Logger> = {
    silly: mock(() => {}),
    verbose: mock(() => {}),
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    child: mock((): Logger => mockLogger as Logger),
    setUseStderr: mock(() => {}),
  };

  // Only the nominal private-field gap remains; the shape is checked above.
  return mockLogger as Logger;
}
