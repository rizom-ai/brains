import { z } from "@brains/utils/zod-v4";

/**
 * Minimal logger interface for transport layers
 * Transport loggers need special handling:
 * - STDIO must log to stderr only (stdout is for protocol)
 * - HTTP can use regular console
 */
export interface TransportLogger {
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
}

const transportLoggerSchema = z.custom<TransportLogger>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "info" in value &&
    typeof value.info === "function" &&
    "debug" in value &&
    typeof value.debug === "function" &&
    "error" in value &&
    typeof value.error === "function" &&
    "warn" in value &&
    typeof value.warn === "function",
);

/**
 * Create a stderr logger for STDIO transport
 * All output goes to stderr to avoid interfering with stdout protocol
 */
export function createStderrLogger(): TransportLogger {
  return {
    info: (msg: string, ...args: unknown[]): void =>
      console.error(`[STDIO MCP] ${msg}`, ...args),
    debug: (msg: string, ...args: unknown[]): void =>
      console.error(`[STDIO MCP DEBUG] ${msg}`, ...args),
    error: (msg: string, ...args: unknown[]): void =>
      console.error(`[STDIO MCP ERROR] ${msg}`, ...args),
    warn: (msg: string, ...args: unknown[]): void =>
      console.error(`[STDIO MCP WARN] ${msg}`, ...args),
  };
}

/**
 * Create a console logger for HTTP transport
 * Uses regular console methods
 */
export function createConsoleLogger(): TransportLogger {
  return {
    info: (msg: string, ...args: unknown[]): void =>
      console.log(`[HTTP MCP] ${msg}`, ...args),
    debug: (msg: string, ...args: unknown[]): void =>
      console.debug(`[HTTP MCP DEBUG] ${msg}`, ...args),
    error: (msg: string, ...args: unknown[]): void =>
      console.error(`[HTTP MCP ERROR] ${msg}`, ...args),
    warn: (msg: string, ...args: unknown[]): void =>
      console.warn(`[HTTP MCP WARN] ${msg}`, ...args),
  };
}

/**
 * Adapt a full Logger to TransportLogger
 * Extracts just the methods needed by transports
 */
export function adaptLogger(logger: unknown): TransportLogger {
  // If it already has the right shape, use it
  const parsed = transportLoggerSchema.safeParse(logger);
  if (parsed.success) {
    return {
      info: (msg: string, ...args: unknown[]) => parsed.data.info(msg, ...args),
      debug: (msg: string, ...args: unknown[]) =>
        parsed.data.debug(msg, ...args),
      error: (msg: string, ...args: unknown[]) =>
        parsed.data.error(msg, ...args),
      warn: (msg: string, ...args: unknown[]) => parsed.data.warn(msg, ...args),
    };
  }

  // Fallback to console logger
  return createConsoleLogger();
}
