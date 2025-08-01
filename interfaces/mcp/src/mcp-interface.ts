import {
  InterfacePlugin,
  type InterfacePluginContext,
} from "@brains/interface-plugin";
import {
  type PluginTool,
  type PluginResource,
  type Daemon,
  type DaemonHealth,
} from "@brains/plugin-base";
import type { UserPermissionLevel } from "@brains/utils";
import type { JobProgressEvent } from "@brains/job-queue";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioMCPServer, StreamableHTTPServer } from "@brains/mcp-server";
import {
  mcpConfigSchema,
  type MCPConfig,
  type MCPConfigInput,
} from "./schemas";
import packageJson from "../package.json";
import { z } from "zod";

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

  private mcpServer: McpServer | undefined;
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
   * Set up listener for job progress events (for logging only)
   */
  private setupJobProgressListener(context: InterfacePluginContext): void {
    // Subscribe to job-progress events for debugging
    context.subscribe("job-progress", async (message) => {
      try {
        const event = message.payload as JobProgressEvent;

        // Debug logging only - MCP cannot send async notifications after tool returns
        this.logger.debug("Job progress event", {
          id: event.id,
          type: event.type,
          status: event.status,
          progress: event.progress,
          progressToken: event.metadata.progressToken,
        });

        return { noop: true };
      } catch (error) {
        this.logger.error("Error handling job progress event", error);
        return { noop: true };
      }
    });

    this.logger.info("Subscribed to job progress events for debugging");
  }

  /**
   * Set up listeners for system events
   */
  private setupSystemEventListeners(context: InterfacePluginContext): void {
    // Subscribe to tool registration events
    context.subscribe("system:tool:register", (message) => {
      const { pluginId, tool } = message.payload as {
        pluginId: string;
        tool: PluginTool;
        timestamp: number;
      };
      this.handleToolRegistration(pluginId, tool);
      return { success: true };
    });

    // Subscribe to resource registration events
    context.subscribe("system:resource:register", (message) => {
      const { pluginId, resource } = message.payload as {
        pluginId: string;
        resource: PluginResource;
        timestamp: number;
      };
      this.handleResourceRegistration(pluginId, resource);
      return { success: true };
    });

    this.logger.info("Subscribed to system tool/resource registration events");
  }

  /**
   * Handle tool registration from plugins
   */
  private handleToolRegistration(pluginId: string, tool: PluginTool): void {
    if (!this.mcpServer) return;

    const toolVisibility = tool.visibility ?? "anchor";
    const permissionLevel = this.getPermissionLevel();

    if (!this.shouldRegisterTool(permissionLevel, toolVisibility)) {
      this.logger.debug(
        `Skipping tool ${tool.name} from ${pluginId} - insufficient permissions`,
      );
      return;
    }

    // Register the tool with namespacing
    this.mcpServer.tool(
      `${pluginId}:${tool.name}`,
      tool.description,
      tool.inputSchema,
      async (params, extra) => {
        // Extract context from MCP client metadata
        const interfaceId = extra._meta?.["interfaceId"];
        const userId = extra._meta?.["userId"];
        const channelId = extra._meta?.["channelId"];
        const progressToken = extra._meta?.progressToken;

        // Log metadata for debugging
        this.logger.debug("MCP client metadata", {
          tool: `${pluginId}:${tool.name}`,
          interfaceId,
          userId,
          channelId,
          progressToken,
        });

        try {
          // Execute tool through message bus using plugin-specific message type
          if (!this.context) {
            throw new Error("Plugin context not initialized");
          }

          const response = await this.context.sendMessage(
            `plugin:${pluginId}:tool:execute`,
            {
              toolName: tool.name,
              args: params,
              progressToken,
              hasProgress: progressToken !== undefined,
              // Pass through context from MCP client
              interfaceId,
              userId,
              channelId,
            },
          );

          if ("success" in response && !response.success) {
            throw new Error(response.error ?? "Tool execution failed");
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  "data" in response ? response.data : response,
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          this.logger.error(`Tool execution error for ${tool.name}`, error);
          throw error;
        }
      },
    );

    this.logger.info(`Registered tool ${pluginId}:${tool.name}`);
  }

  /**
   * Handle resource registration from plugins
   */
  private handleResourceRegistration(
    pluginId: string,
    resource: PluginResource,
  ): void {
    if (!this.mcpServer) return;

    // Resources don't have visibility, so we'll default to anchor permission
    // In the future, we might want to add visibility to resources
    const resourceVisibility: UserPermissionLevel = "anchor";
    const permissionLevel = this.getPermissionLevel();

    if (!this.shouldRegisterResource(permissionLevel, resourceVisibility)) {
      this.logger.debug(
        `Skipping resource ${resource.uri} from ${pluginId} - insufficient permissions`,
      );
      return;
    }

    // Register the resource with namespacing
    this.mcpServer.resource(
      `${pluginId}:${resource.uri}`,
      resource.description ?? `Resource from ${pluginId}`,
      async () => {
        try {
          // Get resource through message bus using plugin-specific message type
          if (!this.context) {
            throw new Error("Plugin context not initialized");
          }
          const response = await this.context.sendMessage(
            `plugin:${pluginId}:resource:get`,
            {
              resourceUri: resource.uri,
            },
          );

          if ("success" in response && !response.success) {
            throw new Error(response.error ?? "Resource fetch failed");
          }

          return {
            contents: [
              {
                uri: `${pluginId}:${resource.uri}`,
                mimeType: resource.mimeType ?? "text/plain",
                text: JSON.stringify(
                  "data" in response ? response.data : response,
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          this.logger.error(`Resource fetch error for ${resource.uri}`, error);
          throw error;
        }
      },
    );

    this.logger.info(`Registered resource ${pluginId}:${resource.uri}`);
  }

  /**
   * Check if a tool should be registered based on permissions
   */
  private shouldRegisterTool(
    serverPermission: UserPermissionLevel,
    toolVisibility: UserPermissionLevel,
  ): boolean {
    const hierarchy: Record<UserPermissionLevel, number> = {
      anchor: 3,
      trusted: 2,
      public: 1,
    };

    return hierarchy[serverPermission] >= hierarchy[toolVisibility];
  }

  /**
   * Check if a resource should be registered based on permissions
   */
  private shouldRegisterResource(
    serverPermission: UserPermissionLevel,
    resourceVisibility: UserPermissionLevel,
  ): boolean {
    // Use same logic as tools
    return this.shouldRegisterTool(serverPermission, resourceVisibility);
  }

  /**
   * Register Shell's core tools with the MCP server
   */
  private registerShellTools(context: InterfacePluginContext): void {
    if (!this.mcpServer) return;

    // Register core shell query tool
    this.mcpServer.tool(
      "shell:query",
      "Query the knowledge base using AI-powered search",
      {
        query: z
          .string()
          .describe("Natural language query to search the knowledge base"),
        userId: z.string().optional().describe("Optional user ID for context"),
      },
      async (params) => {
        try {
          const result = await context.query(params["query"] as string, {
            userId: params["userId"] as string | undefined,
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
        entityType: z
          .string()
          .describe("Type of entity to search (e.g., 'note', 'base')"),
        query: z.string().describe("Search query"),
        limit: z.number().optional().describe("Maximum number of results"),
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
        entityType: z.string().describe("Type of entity"),
        id: z.string().describe("Entity ID"),
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

    // Register job status checking tool
    this.mcpServer.tool(
      "shell:check-job-status",
      "Check the status of background operations",
      {
        batchId: z
          .string()
          .optional()
          .describe(
            "Specific batch ID to check (leave empty for all active operations)",
          ),
        jobTypes: z
          .array(z.string())
          .optional()
          .describe(
            "Filter by specific job types (only when batchId is not provided)",
          ),
      },
      async (params) => {
        try {
          const batchId = params["batchId"] as string | undefined;

          if (batchId) {
            // Check specific batch
            const status = await context.getBatchStatus(batchId);

            if (!status) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Batch not found",
                        message: `No batch found with ID: ${batchId}`,
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            }

            const percentComplete =
              status.totalOperations > 0
                ? Math.round(
                    (status.completedOperations / status.totalOperations) * 100,
                  )
                : 0;

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      batchId,
                      status: status.status,
                      progress: {
                        total: status.totalOperations,
                        completed: status.completedOperations,
                        failed: status.failedOperations,
                        percentComplete,
                      },
                      currentOperation: status.currentOperation,
                      errors: status.errors,
                      message:
                        status.status === "processing"
                          ? `Processing: ${status.completedOperations}/${status.totalOperations} operations (${percentComplete}%)`
                          : status.status === "completed"
                            ? `Completed: ${status.completedOperations} operations`
                            : status.status === "failed"
                              ? `Failed: ${status.failedOperations} operations failed`
                              : "Unknown status",
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } else {
            // Show all active operations
            const jobTypes = params["jobTypes"] as string[] | undefined;
            const activeJobs = await context.getActiveJobs(jobTypes);
            const activeBatches = await context.getActiveBatches();

            // Format individual jobs
            const formattedJobs = activeJobs.map((job) => ({
              id: job.id,
              type: job.type,
              status: job.status,
              priority: job.priority,
              retryCount: job.retryCount,
              createdAt: new Date(job.createdAt).toISOString(),
              startedAt: job.startedAt
                ? new Date(job.startedAt).toISOString()
                : null,
            }));

            // Format batch operations
            const formattedBatches = activeBatches.map((batch) => ({
              batchId: batch.batchId,
              status: batch.status.status,
              totalOperations: batch.status.totalOperations,
              completedOperations: batch.status.completedOperations,
              failedOperations: batch.status.failedOperations,
              currentOperation: batch.status.currentOperation,
              userId: batch.metadata.metadata.userId,
              errors: batch.status.errors,
            }));

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      summary: {
                        activeJobs: formattedJobs.length,
                        activeBatches: formattedBatches.length,
                      },
                      jobs: formattedJobs,
                      batches: formattedBatches,
                      tip:
                        formattedBatches.length > 0
                          ? "Use shell:check-job-status --batchId <id> to check specific batch progress"
                          : undefined,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        } catch (error) {
          this.logger.error("Check job status tool error", error);
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
      `Registered ${4} tools and ${1} resources with MCP server`,
    );
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

    // Create MCP server instance
    this.mcpServer = new McpServer({
      name: "brain-mcp",
      version: "1.0.0",
    });

    // Register basic Shell tools
    this.registerShellTools(context);

    // Subscribe to system events for plugin tools
    this.setupSystemEventListeners(context);

    // Subscribe to job progress events for MCP progress reporting
    this.setupJobProgressListener(context);
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
      return this.stdioServer !== undefined && this.mcpServer !== undefined;
    } else {
      return this.httpServer !== undefined && this.mcpServer !== undefined;
    }
  }

  /**
   * Start the MCP server
   */
  private async startServer(): Promise<void> {
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

    if (this.mcpServer) {
      await this.mcpServer.close();
      this.mcpServer = undefined;
    }
  }
}
