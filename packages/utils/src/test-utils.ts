import { Logger, LogLevel } from "./logger";

/**
 * Create a silent logger for tests
 * This is just a regular logger with LogLevel.NONE
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
