import { mock } from "bun:test";
import { ConsoleLogger, LogLevel, type Logger } from "@brains/utils/logger";

/**
 * Create a silent logger for tests
 * This is a real logger with LogLevel.NONE - no output
 *
 * Use when you just need a logger that doesn't print anything
 */
export function createSilentLogger(context?: string): Logger {
  return ConsoleLogger.createFresh({
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
  return ConsoleLogger.createFresh({
    level,
    ...(context ? { context } : {}),
  });
}

/**
 * Create a mock Logger for testing with spyable methods
 *
 * Returns a Logger-typed object where all methods are bun mock functions. The
 * literal is declared against `Logger` itself, so a method added to the
 * interface — or a signature that changes — fails to compile here rather than
 * leaving a silently incomplete mock.
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
  const mockLogger: Logger = {
    silly: mock(() => {}),
    verbose: mock(() => {}),
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    child: mock((): Logger => mockLogger),
    setUseStderr: mock(() => {}),
  };

  return mockLogger;
}
