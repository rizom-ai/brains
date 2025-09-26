import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { TransportLogger } from "./types";
import { createStderrLogger, adaptLogger } from "./types";
import type { Logger } from "@brains/plugins";

export interface StdioMCPServerConfig {
  logger?: Logger | TransportLogger;
}

/**
 * Stdio transport for MCP servers
 * Handles stdio communication, similar to StreamableHTTPServer
 * Does NOT create its own MCP server - accepts one via connectMCPServer
 */
export class StdioMCPServer {
  private static instance: StdioMCPServer | null = null;

  private mcpServer: McpServer | null = null;
  private transport: StdioServerTransport | null = null;
  private readonly config: StdioMCPServerConfig;
  private readonly logger: TransportLogger;

  /**
   * Get the singleton instance of StdioMCPServer
   */
  public static getInstance(config?: StdioMCPServerConfig): StdioMCPServer {
    StdioMCPServer.instance ??= new StdioMCPServer(config);
    return StdioMCPServer.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    if (StdioMCPServer.instance) {
      StdioMCPServer.instance.stop();
      StdioMCPServer.instance = null;
    }
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(config?: StdioMCPServerConfig): StdioMCPServer {
    return new StdioMCPServer(config);
  }

  constructor(config: StdioMCPServerConfig = {}) {
    this.config = config;
    // Use the provided logger or default to stderr logger for STDIO
    this.logger = this.config.logger
      ? adaptLogger(this.config.logger)
      : createStderrLogger();
  }

  /**
   * Connect an MCP server to this transport
   */
  public connectMCPServer(mcpServer: McpServer): void {
    this.mcpServer = mcpServer;
    this.logger.debug("MCP server connected to stdio transport");
  }

  /**
   * Start the stdio transport
   */
  public async start(): Promise<void> {
    if (!this.mcpServer) {
      throw new Error(
        "MCP server not connected. Call connectMCPServer() first.",
      );
    }

    if (this.transport) {
      throw new Error("Server is already running");
    }

    this.logger.info("Starting stdio transport");

    // Create stdio transport
    this.transport = new StdioServerTransport();

    // Connect the MCP server to the transport
    await this.mcpServer.connect(this.transport);

    this.logger.info("Stdio transport started successfully");
  }

  /**
   * Stop the stdio transport
   */
  public stop(): void {
    this.logger.info("Stopping stdio transport");

    if (this.transport) {
      // The SDK handles cleanup when the transport is closed
      this.transport = null;
    }

    this.logger.info("Stdio transport stopped");
  }

  /**
   * Check if transport is running
   */
  public isRunning(): boolean {
    return this.transport !== null;
  }
}
