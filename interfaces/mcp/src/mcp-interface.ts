import {
  InterfacePlugin,
  type InterfacePluginContext,
  type PluginTool,
  type PluginResource,
  type Daemon,
  type DaemonHealth,
  type JobProgressEvent,
  type JobContext,
} from "@brains/plugins";
import { StdioMCPServer } from "./transports/stdio-server";
import { StreamableHTTPServer } from "./transports/http-server";
import type { IMCPTransport } from "@brains/mcp-service";
import { mcpConfigSchema, type MCPConfig } from "./config";
import { createMCPTools } from "./tools";
import { setupJobProgressListener } from "./handlers";
import packageJson from "../package.json";

/**
 * MCP Interface Plugin
 * Provides Model Context Protocol server functionality with transport-based permissions
 *
 * Usage:
 * - For STDIO: new MCPInterface({ transport: "stdio" })
 * - For HTTP: new MCPInterface({ transport: "http", httpPort: 3333 })
 * - For both: Add two instances with different configs
 */
export class MCPInterface extends InterfacePlugin<MCPConfig> {
  // After validation with defaults, config is complete
  declare protected config: MCPConfig;

  private mcpTransport: IMCPTransport | undefined;
  private stdioServer: StdioMCPServer | undefined;
  private httpServer: StreamableHTTPServer | undefined;

  constructor(config: Partial<MCPConfig> = {}) {
    super("mcp", packageJson, config, mcpConfigSchema, {});
  }

  /**
   * Get MCP's own tools
   */
  protected override async getTools(): Promise<PluginTool[]> {
    return createMCPTools(this.id, () => this.context);
  }

  /**
   * Override getResources to provide MCP-specific resources
   */
  protected override async getResources(): Promise<PluginResource[]> {
    return [
      {
        uri: "entity://types",
        name: "Entity Types",
        description: "List of supported entity types",
        mimeType: "text/plain",
        handler: async (): Promise<{
          contents: Array<{ text: string; uri: string; mimeType?: string }>;
        }> => {
          const entityTypes =
            this.context?.entityService.getEntityTypes() ?? [];
          return {
            contents: [
              {
                uri: "entity://types",
                mimeType: "text/plain",
                text: entityTypes.join("\n"),
              },
            ],
          };
        },
      },
    ];
  }

  /**
   * Override onRegister to set up MCP server during plugin registration
   */
  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    this.logger.info(
      `MCP interface initialized with ${this.config.transport} transport`,
    );

    // Subscribe to job progress events for MCP progress reporting
    setupJobProgressListener(context, this.logger);
  }

  /**
   * Create daemon for managing MCP server lifecycle
   */
  protected override createDaemon(): Daemon | undefined {
    return {
      start: async (): Promise<void> => {
        await this.startServer();
      },
      stop: async (): Promise<void> => {
        await this.stopServer();
      },
      healthCheck: async (): Promise<DaemonHealth> => {
        const isRunning = this.isServerRunning();

        return {
          status: isRunning ? "healthy" : "error",
          message: isRunning
            ? `MCP ${this.config.transport} server running${this.config.transport === "http" ? ` on port ${this.config.httpPort}` : ""}`
            : "MCP server not running",
          lastCheck: new Date(),
          details: {
            transport: this.config.transport,
            port:
              this.config.transport === "http"
                ? this.config.httpPort
                : undefined,
            running: isRunning,
          },
        };
      },
    };
  }

  /**
   * Check if the server is running
   */
  private isServerRunning(): boolean {
    if (this.config.transport === "stdio") {
      return this.stdioServer !== undefined && this.mcpTransport !== undefined;
    } else {
      return this.httpServer !== undefined && this.mcpTransport !== undefined;
    }
  }

  /**
   * Start the MCP server
   */
  private async startServer(): Promise<void> {
    // Get MCP transport from context when starting
    // Context is guaranteed to be set by the time daemon starts
    if (!this.context) {
      throw new Error("Context not initialized");
    }

    this.mcpTransport = this.context.mcpTransport;

    // Determine the user ID based on transport for permission rules
    // This will be used by the centralized PermissionService to determine actual permissions
    const transportUserId =
      this.config.transport === "stdio" ? "stdio" : "http";
    const userLevel = this.context.getUserPermissionLevel(
      "mcp",
      transportUserId,
    );

    // Pass the determined permission level to the MCP transport
    this.mcpTransport.setPermissionLevel(userLevel);

    this.logger.info(
      `Starting MCP ${this.config.transport} transport with ${userLevel} permissions`,
    );

    if (this.config.transport === "stdio") {
      // Start STDIO transport
      // Don't pass the regular logger for stdio - it will use stderr logger
      this.stdioServer = StdioMCPServer.createFresh();

      // Connect MCP server from service to STDIO transport
      const mcpServer = this.mcpTransport.getMcpServer();
      this.stdioServer.connectMCPServer(mcpServer);

      // Start STDIO server
      await this.stdioServer.start();
      this.logger.info("MCP STDIO transport started");
    } else {
      // HTTP transport
      this.httpServer = StreamableHTTPServer.createFresh({
        port: this.config.httpPort,
        logger: this.logger,
      });

      // Connect MCP server from service to HTTP transport
      const mcpServer = this.mcpTransport.getMcpServer();
      this.httpServer.connectMCPServer(mcpServer);

      // Start HTTP server
      await this.httpServer.start();
      this.logger.info(
        `MCP HTTP transport started on port ${this.config.httpPort}`,
      );
    }
  }

  /**
   * Stop the MCP server
   */
  private async stopServer(): Promise<void> {
    this.logger.info(`Stopping MCP ${this.config.transport} transport`);

    if (this.stdioServer) {
      this.stdioServer.stop();
      this.stdioServer = undefined;
    }

    if (this.httpServer) {
      await this.httpServer.stop();
      this.httpServer = undefined;
    }

    // MCPService manages the lifecycle of mcpServer
    // We just clear our reference
    this.mcpTransport = undefined;
  }

  /**
   * Handle progress events - MCP interface doesn't need to handle these directly
   * since progress is handled through the MCP transport layer
   */
  protected async handleProgressEvent(
    _progressEvent: JobProgressEvent,
    _context: JobContext,
  ): Promise<void> {
    // MCP doesn't directly handle progress events - they're routed through the transport layer
    // The setupJobProgressListener in onRegister() handles MCP-specific progress reporting
  }
}
