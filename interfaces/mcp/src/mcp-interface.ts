import {
  BasePlugin,
  PluginInitializationError,
  type PluginContext,
  type PluginCapabilities,
} from "@brains/plugin-utils";
import type { UserPermissionLevel } from "@brains/utils";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpConfigSchema, MCP_CONFIG_DEFAULTS } from "./schemas";
import type { MCPConfigInput, MCPConfig } from "./types";
import packageJson from "../package.json";

/**
 * MCP Interface Plugin
 * Provides Model Context Protocol server functionality with transport-based permissions
 *
 * Usage:
 * - For STDIO: new MCPInterface({ transport: "stdio" })
 * - For HTTP: new MCPInterface({ transport: "http", httpPort: 3000 })
 * - For both: Add two instances with different configs
 */
export class MCPInterface extends BasePlugin<MCPConfigInput> {
  // After validation with defaults, config is complete
  declare protected config: MCPConfig;

  private mcpServer: McpServer | undefined;
  private transport: StdioServerTransport | undefined;

  constructor(config: MCPConfigInput = {}) {
    super("mcp", packageJson, config, mcpConfigSchema, MCP_CONFIG_DEFAULTS);
  }

  /**
   * Get permission level based on transport type
   */
  private getPermissionLevel(): UserPermissionLevel {
    // STDIO = trusted local process = anchor permissions
    // HTTP = remote access = public permissions (for now)
    return this.config.transport === "stdio" ? "anchor" : "public";
  }

  public override async register(
    context: PluginContext,
  ): Promise<PluginCapabilities> {
    const capabilities = await super.register(context);

    if (!this.context) {
      throw new PluginInitializationError(
        this.id,
        "Plugin context not initialized",
      );
    }

    const permissionLevel = this.getPermissionLevel();
    this.logger.info(
      `MCP interface initialized with ${this.config.transport} transport and ${permissionLevel} permissions`,
    );

    // Create MCP server instance
    this.mcpServer = new McpServer({
      name: "brain-mcp",
      version: "1.0.0",
    });

    return capabilities;
  }

  public async start(): Promise<void> {
    if (!this.mcpServer) {
      throw new Error("MCP server not initialized");
    }

    this.logger.info(`Starting MCP ${this.config.transport} transport`);

    if (this.config.transport === "stdio") {
      // Start STDIO transport
      this.transport = new StdioServerTransport();
      await this.mcpServer.connect(this.transport);
      this.logger.info("MCP STDIO transport started");
    } else {
      // HTTP transport
      // TODO: Implement HTTP transport using StreamableHttpServer
      this.logger.warn("HTTP transport not yet implemented");
    }
  }

  public async stop(): Promise<void> {
    this.logger.info(`Stopping MCP ${this.config.transport} transport`);

    if (this.transport) {
      await this.transport.close();
      this.transport = undefined;
    }

    if (this.mcpServer) {
      await this.mcpServer.close();
      this.mcpServer = undefined;
    }
  }
}
