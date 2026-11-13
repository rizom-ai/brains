import { openSync, writeSync } from "node:fs";

/**
 * Logger interface for consistent logging across the application
 * Simplified version without Winston dependency
 */

/**
 * Log levels
 */
export const LogLevel = {
  SILLY: 0,
  VERBOSE: 1,
  DEBUG: 2,
  INFO: 3,
  WARN: 4,
  ERROR: 5,
  NONE: 6,
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export type LogFormat = "text" | "json";

/**
 * What a logger provides to callers.
 *
 * Consumers depend on this rather than on `ConsoleLogger`. The class carries
 * private fields and a private constructor, so nothing else can be assignable
 * to it — which is why every test double had to be asserted into place, a cast
 * that also erased the check on the members the double did define.
 */
export interface Logger {
  silly(message: string, ...args: unknown[]): void;
  verbose(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  child(context: string): Logger;
  setUseStderr(useStderr: boolean): void;
}

export interface LoggerOptions {
  level?: LogLevel;
  context?: string;
  useStderr?: boolean;
  format?: LogFormat;
  /** Path to a log file. Always writes JSON, one line per entry. */
  logFile?: string;
}

/** The logger the runtime constructs: console output, optionally mirrored to a file. */
export class ConsoleLogger implements Logger {
  /** The singleton instance */
  private static instance: ConsoleLogger | null = null;

  /**
   * Which of its runtime's processes this one is, such as `web`, `worker` or
   * `git-broker`. Process-wide, because every logger in the process writes to
   * the same stdout the supervisor shares with its other children.
   */
  private static processRole: string | undefined;

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
  public static getInstance(options?: LoggerOptions): ConsoleLogger {
    if (!ConsoleLogger.instance) {
      ConsoleLogger.instance = new ConsoleLogger(options);
    } else {
      // Options asked of the existing logger apply to everyone holding it.
      if (options?.useStderr !== undefined)
        ConsoleLogger.instance.useStderr = options.useStderr;
      if (options?.level !== undefined)
        ConsoleLogger.instance.level = options.level;
    }
    return ConsoleLogger.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    ConsoleLogger.instance = null;
    ConsoleLogger.processRole = undefined;
  }

  /**
   * Label every line this process logs, from any logger, with its role: a
   * `[role]` prefix on text lines and a `role` field on JSON lines. A process
   * that is not one of several sharing an output sets none.
   */
  public static setProcessRole(role: string | undefined): void {
    ConsoleLogger.processRole = role;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(options?: LoggerOptions): ConsoleLogger {
    return new ConsoleLogger(options);
  }

  /**
   * Format a log entry for output.
   * Text: [role] [timestamp] [context] message
   * JSON: {"ts":"...","level":"...","role":"...","msg":"...","ctx":"...","data":[...]}
   * Role and context appear only when set.
   */
  private formatEntry(level: string, message: string, args: unknown[]): string {
    if (this.format === "json") {
      return this.formatJsonEntry(level, message, args);
    }
    const role = ConsoleLogger.processRole;
    return [
      ...(role ? [`[${role}]`] : []),
      `[${new Date().toISOString()}]`,
      ...(this.context ? [`[${this.context}]`] : []),
      message,
    ].join(" ");
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
      ...(ConsoleLogger.processRole && { role: ConsoleLogger.processRole }),
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
    const child = new ConsoleLogger(
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
const defaultLogger: Logger = ConsoleLogger.getInstance();

export default defaultLogger;
