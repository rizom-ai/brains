import {
  InterfacePlugin,
  type InterfacePluginContext,
  type PluginTool,
  type PluginResource,
  type Daemon,
  type DaemonHealth,
  type UserPermissionLevel,
} from "@brains/plugins";
import { StdioMCPServer, StreamableHTTPServer } from "@brains/mcp-server";
import type { IMCPTransport } from "@brains/mcp-service";
import { mcpConfigSchema, type MCPConfig, type MCPConfigInput } from "./config";
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

  constructor(config: MCPConfigInput = {}) {
    const defaults: MCPConfig = {
      transport: "stdio",
      httpPort: 3333,
    };

    super("mcp", packageJson, config, mcpConfigSchema, defaults);
  }

  /**
   * Get permission level based on transport type
   */
  private getPermissionLevel(): UserPermissionLevel {
    // STDIO = trusted local process = anchor permissions
    // HTTP = remote access = public permissions (for now)
    return this.config.transport === "stdio" ? "anchor" : "anchor";
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
    const permissionLevel = this.getPermissionLevel();
    this.logger.info(
      `MCP interface initialized with ${this.config.transport} transport and ${permissionLevel} permissions`,
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

    // Set permission level based on transport type
    const permissionLevel = this.getPermissionLevel();
    this.mcpTransport.setPermissionLevel(permissionLevel);

    this.logger.info(`Starting MCP ${this.config.transport} transport`);

    if (this.config.transport === "stdio") {
      // Start STDIO transport
      this.stdioServer = StdioMCPServer.createFresh({
        logger: this.logger,
      });

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
}
