/**
 * Logger interface for consistent logging across the application
 * Simplified version without Winston dependency
 */

/**
 * Log levels
 */
export enum LogLevel {
  SILLY = 0,
  VERBOSE = 1,
  DEBUG = 2,
  INFO = 3,
  WARN = 4,
  ERROR = 5,
  NONE = 6, // Silent mode - no output
}

/**
 * Logger implementation with Component Interface Standardization pattern
 */
export class Logger {
  /** The singleton instance */
  private static instance: Logger | null = null;

  private level: LogLevel;
  private context: string | undefined;
  private useStderr: boolean;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(options: { level?: LogLevel; context?: string; useStderr?: boolean } = {}) {
    this.level = options.level ?? LogLevel.INFO;
    this.context = options.context ?? undefined;
    this.useStderr = options.useStderr ?? false;
  }

  /**
   * Get the singleton instance of Logger
   */
  public static getInstance(options?: {
    level?: LogLevel;
    context?: string;
    useStderr?: boolean;
  }): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(options);
    } else if (options?.useStderr !== undefined) {
      // Update useStderr if explicitly provided
      Logger.instance.useStderr = options.useStderr;
    }
    return Logger.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    Logger.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(options?: {
    level?: LogLevel;
    context?: string;
    useStderr?: boolean;
  }): Logger {
    return new Logger(options);
  }

  /**
   * Format a log message with optional context
   */
  private formatMessage(message: string): string {
    const timestamp = new Date().toISOString();
    return this.context
      ? `[${timestamp}] [${this.context}] ${message}`
      : `[${timestamp}] ${message}`;
  }

  /**
   * Log a message at the 'silly' level
   */
  public silly(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.SILLY) {
      console.debug(this.formatMessage(message), ...args);
    }
  }

  /**
   * Log a message at the 'verbose' level
   */
  public verbose(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.VERBOSE) {
      console.debug(this.formatMessage(message), ...args);
    }
  }

  /**
   * Log a message at the 'debug' level
   */
  public debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(this.formatMessage(message), ...args);
    }
  }

  /**
   * Log a message at the 'info' level
   */
  public info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      if (this.useStderr) {
        console.error(this.formatMessage(message), ...args);
      } else {
        console.info(this.formatMessage(message), ...args);
      }
    }
  }

  /**
   * Log a message at the 'warn' level
   */
  public warn(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.formatMessage(message), ...args);
    }
  }

  /**
   * Log a message at the 'error' level
   */
  public error(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(this.formatMessage(message), ...args);
    }
  }

  /**
   * Create a child logger with a specific context
   */
  public child(context: string): Logger {
    const childLogger = Logger.createFresh({
      level: this.level,
      context,
      useStderr: this.useStderr,
    });
    return childLogger;
  }

  /**
   * Configure the logger to use stderr for all output
   * Useful for MCP servers that need stdout for JSON-RPC
   */
  public setUseStderr(useStderr: boolean): void {
    this.useStderr = useStderr;
  }
}

// Export default logger instance
export default Logger.getInstance();
