/**
 * MCP Server configuration
 */
export interface MCPServerConfig {
  /** Server name */
  name?: string;
  /** Server version */
  version?: string;
  /** Optional logger instance */
  logger?: Logger;
}

/**
 * Logger interface for internal use
 */
export interface Logger {
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
}
