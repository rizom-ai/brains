import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { MCPServerConfig, Logger } from "../types";

// Default console logger that always uses stderr for MCP servers
const defaultLogger = {
  info: (msg: string): void => console.error(`[MCP INFO] ${msg}`),
  debug: (msg: string): void => console.error(`[MCP DEBUG] ${msg}`),
  error: (msg: string, err?: unknown): void =>
    console.error(`[MCP ERROR] ${msg}`, err),
  warn: (msg: string): void => console.error(`[MCP WARN] ${msg}`),
};

/**
 * MCP (Model Context Protocol) Server
 * Provides infrastructure for MCP-compliant servers
 * Other packages register their tools and resources
 * Follows Component Interface Standardization pattern
 */
export class MCPServer {
  private static instance: MCPServer | null = null;

  private readonly mcpServer: McpServer;
  private readonly config: MCPServerConfig;
  private readonly logger: Logger;
  private transport: StdioServerTransport | null = null;

  /**
   * Get the singleton instance of MCPServer
   */
  public static getInstance(config?: MCPServerConfig): MCPServer {
    if (!MCPServer.instance) {
      MCPServer.instance = new MCPServer(config);
    }
    return MCPServer.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    if (MCPServer.instance) {
      MCPServer.instance.stop();
      MCPServer.instance = null;
    }
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(config?: MCPServerConfig): MCPServer {
    return new MCPServer(config);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(config?: MCPServerConfig) {
    this.config = config ?? {};
    this.logger = this.config.logger ?? defaultLogger;

    // Create the MCP server instance
    this.mcpServer = new McpServer({
      name: this.config.name ?? "MCP-Server",
      version: this.config.version ?? "1.0.0",
    });

    this.logger.info(
      `Created MCP server: ${this.config.name ?? "MCP-Server"} v${this.config.version ?? "1.0.0"}`,
    );
  }

  /**
   * Get the underlying MCP server for tool/resource registration
   * This is what other packages use to register their capabilities
   */
  public getServer(): McpServer {
    return this.mcpServer;
  }

  /**
   * Start the MCP server with stdio transport
   */
  public async startStdio(): Promise<void> {
    this.logger.info("Starting MCP Server with stdio transport");

    // Create stdio transport
    this.transport = new StdioServerTransport();

    // Connect the server to the transport
    await this.mcpServer.connect(this.transport);

    this.logger.info("MCP Server started successfully");
  }

  /**
   * Stop the MCP server
   */
  public stop(): void {
    this.logger.info("Stopping MCP Server");

    if (this.transport) {
      // The SDK handles cleanup when the transport is closed
      this.transport = null;
    }

    this.logger.info("MCP Server stopped");
  }

  /**
   * Check if server is running
   */
  public isRunning(): boolean {
    return this.transport !== null;
  }
}
