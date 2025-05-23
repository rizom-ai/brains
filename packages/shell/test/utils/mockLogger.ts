import type { Logger } from "@/utils/logger";
import { LogLevel } from "@/utils/logger";

/**
 * Creates a silent logger for tests
 * Implements the same interface as the real Logger but doesn't output anything
 * Following the Component Interface Standardization pattern
 */
export class MockLogger {
  private static instance: MockLogger | null = null;

  // Allow capturing logs in tests if needed
  public logs: Array<{
    level: LogLevel;
    message: string;
    args: unknown[];
  }> = [];

  /**
   * Get the singleton instance of MockLogger
   */
  public static getInstance(): Logger {
    if (!MockLogger.instance) {
      MockLogger.instance = new MockLogger();
    }
    return MockLogger.instance as unknown as Logger;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    MockLogger.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(): Logger {
    return new MockLogger() as unknown as Logger;
  }

  public child(_context: string): Logger {
    return this as unknown as Logger;
  }

  /**
   * Log a message at the 'silly' level
   */
  public silly(message: string, ...args: unknown[]): void {
    this.logs.push({ level: LogLevel.SILLY, message, args });
  }

  /**
   * Log a message at the 'verbose' level
   */
  public verbose(message: string, ...args: unknown[]): void {
    this.logs.push({ level: LogLevel.VERBOSE, message, args });
  }

  /**
   * Log a message at the 'debug' level
   */
  public debug(message: string, ...args: unknown[]): void {
    this.logs.push({ level: LogLevel.DEBUG, message, args });
  }

  /**
   * Log a message at the 'info' level
   */
  public info(message: string, ...args: unknown[]): void {
    this.logs.push({ level: LogLevel.INFO, message, args });
  }

  /**
   * Log a message at the 'warn' level
   */
  public warn(message: string, ...args: unknown[]): void {
    this.logs.push({ level: LogLevel.WARN, message, args });
  }

  /**
   * Log a message at the 'error' level
   */
  public error(message: string, ...args: unknown[]): void {
    this.logs.push({ level: LogLevel.ERROR, message, args });
  }
}
