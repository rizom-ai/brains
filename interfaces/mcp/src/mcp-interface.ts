import {
  InterfacePlugin,
  PluginInitializationError,
  type PluginContext,
  type PluginCapabilities,
  type PluginTool,
  type PluginResource,
} from "@brains/plugin-utils";
import type { UserPermissionLevel } from "@brains/utils";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioMCPServer, StreamableHTTPServer } from "@brains/mcp-server";
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
export class MCPInterface extends InterfacePlugin<MCPConfigInput> {
  // After validation with defaults, config is complete
  declare protected config: MCPConfig;

  private mcpServer: McpServer | undefined;
  private stdioServer: StdioMCPServer | undefined;
  private httpServer: StreamableHTTPServer | undefined;

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

  /**
   * Override getTools to return empty array since MCP manages its own tools
   */
  protected override async getTools(): Promise<PluginTool[]> {
    // MCP manages its own tools internally
    return [];
  }

  /**
   * Override getResources to return empty array since MCP manages its own resources
   */
  protected override async getResources(): Promise<PluginResource[]> {
    // MCP manages its own resources internally
    return [];
  }

  /**
   * Register Shell's core tools with the MCP server
   */
  private registerShellTools(context: PluginContext): void {
    if (!this.mcpServer) return;

    // Register core shell query tool
    this.mcpServer.tool(
      "shell:query",
      "Query the knowledge base using AI-powered search",
      {
        query: {
          type: "string",
          description: "Natural language query to search the knowledge base",
        },
        userId: {
          type: "string",
          description: "Optional user ID for context",
          optional: true,
        },
      },
      async (params) => {
        try {
          const result = await context.generateContent({
            templateName: "shell:knowledge-query",
            prompt: params["query"] as string,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          this.logger.error("Query tool error", error);
          throw error;
        }
      },
    );

    // Register entity search tool
    this.mcpServer.tool(
      "shell:search",
      "Search entities by type and query",
      {
        entityType: {
          type: "string",
          description: "Type of entity to search (e.g., 'note', 'base')",
        },
        query: {
          type: "string",
          description: "Search query",
        },
        limit: {
          type: "number",
          description: "Maximum number of results",
          optional: true,
        },
      },
      async (params) => {
        try {
          const results = await context.entityService.search(
            params["query"] as string,
            {
              types: [params["entityType"] as string],
              limit: (params["limit"] as number) || 10,
            },
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        } catch (error) {
          this.logger.error("Search tool error", error);
          throw error;
        }
      },
    );

    // Register entity get tool
    this.mcpServer.tool(
      "shell:get",
      "Get a specific entity by type and ID",
      {
        entityType: {
          type: "string",
          description: "Type of entity",
        },
        id: {
          type: "string",
          description: "Entity ID",
        },
      },
      async (params) => {
        try {
          const entity = await context.entityService.getEntity(
            params["entityType"] as string,
            params["id"] as string,
          );

          return {
            content: [
              {
                type: "text" as const,
                text: entity
                  ? JSON.stringify(entity, null, 2)
                  : "Entity not found",
              },
            ],
          };
        } catch (error) {
          this.logger.error("Get entity tool error", error);
          throw error;
        }
      },
    );

    // Register entity types resource
    this.mcpServer.resource(
      "entity://types",
      "List of supported entity types",
      async () => {
        const types = context.entityService.getEntityTypes();
        return {
          contents: [
            {
              uri: "entity://types",
              mimeType: "text/plain",
              text: types.join("\n"),
            },
          ],
        };
      },
    );

    this.logger.info(
      `Registered ${3} tools and ${1} resources with MCP server`,
    );
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

    // Register basic Shell tools
    this.registerShellTools(context);

    return capabilities;
  }

  public async start(): Promise<void> {
    if (!this.mcpServer) {
      throw new Error("MCP server not initialized");
    }

    this.logger.info(`Starting MCP ${this.config.transport} transport`);

    if (this.config.transport === "stdio") {
      // Start STDIO transport
      this.stdioServer = StdioMCPServer.createFresh({
        logger: this.logger,
      });

      // Connect MCP server to STDIO transport
      this.stdioServer.connectMCPServer(this.mcpServer);

      // Start STDIO server
      await this.stdioServer.start();
      this.logger.info("MCP STDIO transport started");
    } else {
      // HTTP transport
      this.httpServer = StreamableHTTPServer.createFresh({
        port: this.config.httpPort,
        logger: this.logger,
      });

      // Connect MCP server to HTTP transport
      this.httpServer.connectMCPServer(this.mcpServer);

      // Start HTTP server
      await this.httpServer.start();
      this.logger.info(
        `MCP HTTP transport started on port ${this.config.httpPort}`,
      );
    }
  }

  public async stop(): Promise<void> {
    this.logger.info(`Stopping MCP ${this.config.transport} transport`);

    if (this.stdioServer) {
      this.stdioServer.stop();
      this.stdioServer = undefined;
    }

    if (this.httpServer) {
      await this.httpServer.stop();
      this.httpServer = undefined;
    }

    if (this.mcpServer) {
      await this.mcpServer.close();
      this.mcpServer = undefined;
    }
  }
}
