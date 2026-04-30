import {
  InterfacePlugin,
  type InterfacePluginContext,
  type Tool,
  type Resource,
  type JobProgressEvent,
  type JobContext,
  type WebRouteDefinition,
} from "@brains/plugins";
import type { Daemon, DaemonHealth } from "@brains/plugins";
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
  private domain: string | undefined;

  constructor(config: Partial<MCPConfig> = {}) {
    // Default authToken from environment if not provided
    const configWithDefaults = {
      ...config,
      authToken: config.authToken ?? process.env["MCP_AUTH_TOKEN"],
    };
    super("mcp", packageJson, configWithDefaults, mcpConfigSchema);
  }

  /**
   * Get MCP's own tools
   */
  protected override async getTools(): Promise<Tool[]> {
    return createMCPTools(this.id, () => this.context);
  }

  /**
   * MCP interface provides no resources — they are registered by plugins
   * (system plugin provides entity://types, brain://identity, brain://profile)
   */
  protected override async getResources(): Promise<Resource[]> {
    return [];
  }

  /**
   * Override onRegister to set up MCP server during plugin registration
   */
  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    this.domain = context.domain;

    if (this.config.transport === "http" && !context.plugins.has("webserver")) {
      throw new Error(
        "MCP HTTP transport requires the webserver interface. Standalone HTTP listeners have been removed.",
      );
    }

    this.logger.debug(
      `MCP interface initialized with ${this.config.transport} transport`,
    );

    // Advertise the MCP endpoint so it surfaces in the dashboard's
    // Endpoints card. HTTP transport mounts on the shared webserver
    // at `/mcp`; stdio has no URL to advertise.
    if (this.config.transport === "http") {
      context.endpoints.register({
        label: "MCP",
        url: "/mcp",
        priority: 30,
      });
    }

    // Subscribe to job progress events for MCP progress reporting
    setupJobProgressListener(context, this.logger);
  }

  private getOrCreateHttpServer(): StreamableHTTPServer {
    if (this.httpServer) {
      return this.httpServer;
    }

    this.httpServer = StreamableHTTPServer.createFresh({
      port: this.config.httpPort,
      logger: this.logger,
      auth: this.config.authToken
        ? { token: this.config.authToken }
        : { disabled: true },
    });

    return this.httpServer;
  }

  override getWebRoutes(): WebRouteDefinition[] {
    if (this.config.transport !== "http") {
      return [];
    }

    const handleWithSharedTransport = (request: Request): Promise<Response> =>
      this.getOrCreateHttpServer().handleRequest(request);

    return [
      {
        path: "/status",
        method: "GET",
        public: true,
        handler: handleWithSharedTransport,
      },
      {
        path: "/mcp",
        method: "GET",
        public: true,
        handler: handleWithSharedTransport,
      },
      {
        path: "/mcp",
        method: "POST",
        public: true,
        handler: handleWithSharedTransport,
      },
      {
        path: "/mcp",
        method: "DELETE",
        public: true,
        handler: handleWithSharedTransport,
      },
      {
        path: "/mcp",
        method: "OPTIONS",
        public: true,
        handler: handleWithSharedTransport,
      },
    ];
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

        let message = "MCP server not running";
        if (isRunning) {
          if (this.config.transport === "http") {
            const apiUrl = this.domain
              ? `https://${this.domain}/mcp`
              : "http://localhost:8080/mcp";
            message = `MCP HTTP: ${apiUrl}`;
          } else {
            message = "MCP stdio server running";
          }
        }

        return {
          status: isRunning ? "healthy" : "error",
          message,
          lastCheck: new Date(),
          details: {
            transport: this.config.transport,
            url:
              this.config.transport === "http"
                ? this.domain
                  ? `https://${this.domain}/mcp`
                  : "http://localhost:8080/mcp"
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

    const context = this.context;
    this.mcpTransport = context.mcpTransport;

    // Determine the user ID based on transport for permission rules
    // This will be used by the centralized PermissionService to determine actual permissions
    const transportUserId =
      this.config.transport === "stdio" ? "stdio" : "http";

    let userLevel = this.context.permissions.getUserLevel(
      "mcp",
      transportUserId,
    );

    // For HTTP with auth token, authenticated users get anchor permission
    // For HTTP without auth token, use the configured permission level
    if (this.config.transport === "http" && this.config.authToken) {
      userLevel = "anchor";
      this.logger.debug(
        "HTTP auth token configured - authenticated users will have anchor permissions",
      );
    }

    // Pass the determined permission level to the MCP transport
    this.mcpTransport.setPermissionLevel(userLevel);

    this.logger.debug(
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
      this.logger.debug("MCP STDIO transport started");
    } else {
      // HTTP transport — auth required unless token is absent
      this.httpServer = this.getOrCreateHttpServer();

      // Connect MCP server from service to HTTP transport
      const mcpServer = this.mcpTransport.getMcpServer();
      this.httpServer.connectMCPServer(mcpServer, this.mcpTransport);

      // Connect agent service for /api/chat endpoint
      this.httpServer.connectAgentService(context.agent);

      this.logger.debug("MCP HTTP transport mounted on shared webserver host");
    }
  }

  /**
   * Stop the MCP server
   */
  private async stopServer(): Promise<void> {
    this.logger.debug(`Stopping MCP ${this.config.transport} transport`);

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
  protected override async handleProgressEvent(
    _progressEvent: JobProgressEvent,
    _context: JobContext,
  ): Promise<void> {
    // MCP doesn't directly handle progress events - they're routed through the transport layer
    // The setupJobProgressListener in onRegister() handles MCP-specific progress reporting
  }

  protected override async onShutdown(): Promise<void> {
    StdioMCPServer.resetInstance();
    StreamableHTTPServer.resetInstance();
  }
}
