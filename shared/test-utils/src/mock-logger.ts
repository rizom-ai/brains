import { mock } from "bun:test";
import { Logger, LogLevel } from "@brains/utils";

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
 * Mock logger type with spyable methods
 */
export type MockLogger = {
  debug: ReturnType<typeof mock>;
  info: ReturnType<typeof mock>;
  warn: ReturnType<typeof mock>;
  error: ReturnType<typeof mock>;
  child: ReturnType<typeof mock>;
};

/**
 * Create a mock Logger for testing with spyable methods
 *
 * Use when you need to assert that specific log calls were made
 *
 * @example
 * ```typescript
 * const mockLogger = createMockLogger();
 * const handler = new MyHandler(mockLogger);
 * await handler.process(data);
 *
 * expect(mockLogger.info).toHaveBeenCalledWith("Processing started", { id: "123" });
 * ```
 */
export function createMockLogger(): MockLogger {
  const mockLogger: MockLogger = {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    child: mock(() => mockLogger),
  };

  return mockLogger;
}
