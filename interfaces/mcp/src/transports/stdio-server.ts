import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { TransportLogger } from "./types";
import { createStderrLogger, adaptLogger } from "./types";
import type { Logger } from "@brains/utils/logger";

/**
 * The part of an MCP server this transport uses.
 *
 * Declared here rather than importing McpServer: connect is the only member
 * touched, and asking for the whole SDK class meant a test could not supply a
 * stand-in without asserting it was one.
 */
export interface ConnectableMcpServer {
  connect(transport: StdioServerTransport): Promise<void>;
}

export interface StdioMCPServerConfig {
  logger?: Logger | TransportLogger;
}

/**
 * Stdio transport for MCP servers
 * Handles stdio communication, similar to StreamableHTTPServer
 * Does NOT create its own MCP server - accepts one via connectMCPServer
 */
export class StdioMCPServer {
  private mcpServer: ConnectableMcpServer | null = null;
  private transport: StdioServerTransport | null = null;
  private readonly config: StdioMCPServerConfig;
  private readonly logger: TransportLogger;

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
  public connectMCPServer(mcpServer: ConnectableMcpServer): void {
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
