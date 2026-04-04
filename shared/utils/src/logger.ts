import { openSync, writeSync } from "node:fs";

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
export type LogFormat = "text" | "json";

export interface LoggerOptions {
  level?: LogLevel;
  context?: string;
  useStderr?: boolean;
  format?: LogFormat;
  /** Path to a log file. Always writes JSON, one line per entry. */
  logFile?: string;
}

export class Logger {
  /** The singleton instance */
  private static instance: Logger | null = null;

  private level: LogLevel;
  private context: string | undefined;
  private useStderr: boolean;
  private format: LogFormat;
  private logFile: string | undefined;
  private fileHandle: number | undefined;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(options: LoggerOptions = {}, fileHandle?: number) {
    this.level = options.level ?? LogLevel.INFO;
    this.context = options.context ?? undefined;
    this.useStderr = options.useStderr ?? false;
    this.format = options.format ?? "text";
    this.logFile = options.logFile;

    if (fileHandle !== undefined) {
      // Reuse parent's file handle (child logger)
      this.fileHandle = fileHandle;
    } else if (this.logFile) {
      try {
        this.fileHandle = openSync(this.logFile, "a");
      } catch {
        // Silently fail — logging should never crash the app
      }
    }
  }

  /**
   * Get the singleton instance of Logger
   */
  public static getInstance(options?: LoggerOptions): Logger {
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
  public static createFresh(options?: LoggerOptions): Logger {
    return new Logger(options);
  }

  /**
   * Format a log entry for output.
   * Text: [timestamp] [context] message
   * JSON: {"ts":"...","level":"...","ctx":"...","msg":"...","data":[...]}
   */
  private formatEntry(level: string, message: string, args: unknown[]): string {
    const timestamp = new Date().toISOString();
    if (this.format === "json") {
      const entry: Record<string, unknown> = {
        ts: timestamp,
        level,
        msg: message,
      };
      if (this.context) entry["ctx"] = this.context;
      if (args.length > 0) entry["data"] = args;
      return JSON.stringify(entry);
    }
    return this.context
      ? `[${timestamp}] [${this.context}] ${message}`
      : `[${timestamp}] ${message}`;
  }

  /**
   * Log a message at the 'silly' level
   */
  /**
   * Write a formatted log entry to the appropriate output stream.
   * JSON format: single string argument (no spread).
   * Text format: message + spread args for console formatting.
   */
  private write(
    consoleFn: (...data: unknown[]) => void,
    level: string,
    message: string,
    args: unknown[],
  ): void {
    // Console output
    if (this.format === "json") {
      consoleFn(this.formatEntry(level, message, args));
    } else {
      if (args.length > 0) {
        consoleFn(this.formatEntry(level, message, []), ...args);
      } else {
        consoleFn(this.formatEntry(level, message, []));
      }
    }

    // File output — always JSON
    if (this.fileHandle !== undefined) {
      const jsonLine = this.formatJsonEntry(level, message, args);
      try {
        writeSync(this.fileHandle, jsonLine + "\n");
      } catch {
        // Silently fail
      }
    }
  }

  /**
   * Format a JSON log entry (used for file output regardless of console format).
   */
  private formatJsonEntry(
    level: string,
    message: string,
    args: unknown[],
  ): string {
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      msg: message,
    };
    if (this.context) entry["ctx"] = this.context;
    if (args.length > 0) entry["data"] = args;
    return JSON.stringify(entry);
  }

  public silly(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.SILLY) {
      this.write(console.debug.bind(console), "silly", message, args);
    }
  }

  public verbose(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.VERBOSE) {
      this.write(console.debug.bind(console), "verbose", message, args);
    }
  }

  public debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      this.write(console.debug.bind(console), "debug", message, args);
    }
  }

  public info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      const fn = this.useStderr
        ? console.error.bind(console)
        : console.info.bind(console);
      this.write(fn, "info", message, args);
    }
  }

  public warn(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      this.write(console.warn.bind(console), "warn", message, args);
    }
  }

  public error(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      this.write(console.error.bind(console), "error", message, args);
    }
  }

  /**
   * Create a child logger with a specific context
   */
  public child(context: string): Logger {
    // Pass file handle directly so children don't open new handles
    const child = new Logger(
      {
        level: this.level,
        context,
        useStderr: this.useStderr,
        format: this.format,
      },
      this.fileHandle,
    );
    return child;
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
