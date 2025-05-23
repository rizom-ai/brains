/**
 * MCP Server configuration
 */
export interface MCPServerConfig {
  /** Server name */
  name?: string;
  /** Server version */
  version?: string;
}

/**
 * Logger interface for internal use
 */
export interface Logger {
  info(message: string, meta?: unknown): void;
  debug(message: string, meta?: unknown): void;
  error(message: string, error?: unknown): void;
  warn(message: string, meta?: unknown): void;
}