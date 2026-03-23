import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IMessageBus, MessageResponse } from "@brains/messaging-service";
import type { Logger } from "@brains/utils";
import { PermissionService, type UserPermissionLevel } from "@brains/templates";
import type {
  PluginTool,
  PluginResource,
  PluginResourceTemplate,
  PluginPrompt,
} from "./types";
import type { IMCPService } from "./types";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "@brains/utils";

/**
 * MCP Service for managing tool and resource registration
 * Provides the core MCP server instance that interfaces can use
 */
export class MCPService implements IMCPService {
  private static instance: MCPService | null = null;
  private mcpServer: McpServer;
  private logger: Logger;
  private messageBus: IMessageBus;

  // Track registered tools and resources
  private registeredTools = new Map<
    string,
    { pluginId: string; tool: PluginTool }
  >();
  private registeredResources = new Map<
    string,
    { pluginId: string; resource: PluginResource }
  >();

  // Track plugin instructions for agent system prompt
  private pluginInstructions = new Map<string, string>();

  // Default permission level for the service
  private permissionLevel: UserPermissionLevel = "anchor";

  /**
   * Get the singleton instance of MCPService
   */
  public static getInstance(
    messageBus: IMessageBus,
    logger: Logger,
  ): MCPService {
    MCPService.instance ??= new MCPService(messageBus, logger);
    return MCPService.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    MCPService.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    messageBus: IMessageBus,
    logger: Logger,
  ): MCPService {
    return new MCPService(messageBus, logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(messageBus: IMessageBus, logger: Logger) {
    this.messageBus = messageBus;
    this.logger = logger.child("MCPService");

    // Create the MCP server instance
    this.mcpServer = new McpServer({
      name: "brain-mcp",
      version: "1.0.0",
    });

    this.logger.debug("MCPService initialized");
  }

  /**
   * Get the MCP server instance for transport layers
   */
  public getMcpServer(): McpServer {
    return this.mcpServer;
  }

  /**
   * Create a fresh MCP server instance with all registered tools/resources.
   * Required for Streamable HTTP where each session needs its own server.
   */
  public createMcpServer(): McpServer {
    const server = new McpServer({
      name: "brain-mcp",
      version: "1.0.0",
    });

    // Re-register all tools
    for (const [, { pluginId, tool }] of this.registeredTools) {
      server.tool(
        tool.name,
        tool.description,
        tool.inputSchema,
        async (params, extra) => {
          const interfaceType = extra._meta?.["interfaceType"] ?? "mcp";
          const userId = extra._meta?.["userId"] ?? "mcp-user";
          const channelId = extra._meta?.["channelId"];
          const progressToken = extra._meta?.progressToken;

          const response = await this.messageBus.send(
            `plugin:${pluginId}:tool:execute`,
            {
              toolName: tool.name,
              args: params,
              progressToken,
              hasProgress: progressToken !== undefined,
              interfaceType,
              userId,
              channelId,
            },
            "MCPService",
          );

          return {
            content: [
              {
                type: "text" as const,
                text: this.serializeResponse(response),
              },
            ],
          };
        },
      );
    }

    // Re-register all resources
    for (const [, { pluginId, resource }] of this.registeredResources) {
      server.resource(
        resource.uri,
        resource.description ?? `Resource from ${pluginId}`,
        async () => {
          const response = await this.messageBus.send(
            `plugin:${pluginId}:resource:get`,
            { resourceUri: resource.uri },
            "MCPService",
          );

          return {
            contents: [
              {
                uri: resource.uri,
                mimeType: resource.mimeType ?? "text/plain",
                text: this.serializeResponse(response),
              },
            ],
          };
        },
      );
    }

    return server;
  }

  /**
   * Validate a message bus response and serialize its data as JSON
   */
  private serializeResponse(response: MessageResponse): string {
    if ("success" in response && !response.success) {
      throw new Error(response.error ?? "Operation failed");
    }
    return JSON.stringify(
      "data" in response ? response.data : response,
      null,
      2,
    );
  }

  /**
   * Set the permission level for this service
   */
  public setPermissionLevel(level: UserPermissionLevel): void {
    this.permissionLevel = level;
    this.logger.debug(`Permission level set to ${level}`);
  }

  /**
   * Register a tool with the MCP server
   */
  public registerTool(pluginId: string, tool: PluginTool): void {
    const toolVisibility = tool.visibility ?? "anchor";

    // Check permissions
    if (
      !PermissionService.hasPermission(this.permissionLevel, toolVisibility)
    ) {
      this.logger.debug(
        `Skipping tool ${tool.name} from ${pluginId} - insufficient permissions`,
      );
      return;
    }

    // Register the tool with MCP server
    this.mcpServer.tool(
      tool.name,
      tool.description,
      tool.inputSchema,
      async (params, extra) => {
        // Extract context from MCP client metadata
        const interfaceType = extra._meta?.["interfaceType"] ?? "mcp";
        const userId = extra._meta?.["userId"] ?? "mcp-user";
        const channelId = extra._meta?.["channelId"];
        const progressToken = extra._meta?.progressToken;

        this.logger.debug("MCP client metadata", {
          tool: tool.name,
          pluginId,
          interfaceType,
          userId,
          channelId,
          progressToken,
        });

        try {
          // Execute tool through message bus using plugin-specific message type
          const response = await this.messageBus.send(
            `plugin:${pluginId}:tool:execute`,
            {
              toolName: tool.name,
              args: params,
              progressToken,
              hasProgress: progressToken !== undefined,
              // Pass through context from MCP client with defaults
              interfaceType,
              userId,
              channelId,
            },
            "MCPService",
          );

          return {
            content: [
              {
                type: "text" as const,
                text: this.serializeResponse(response),
              },
            ],
          };
        } catch (error) {
          this.logger.error(`Tool execution error for ${tool.name}`, error);
          throw error;
        }
      },
    );

    // Track the tool
    this.registeredTools.set(tool.name, { pluginId, tool });
    this.logger.debug(`Registered tool ${tool.name} from ${pluginId}`);
  }

  /**
   * Register a resource with the MCP server
   */
  public registerResource(pluginId: string, resource: PluginResource): void {
    // Resources don't have visibility, default to anchor permission
    const resourceVisibility: UserPermissionLevel = "anchor";

    if (
      !PermissionService.hasPermission(this.permissionLevel, resourceVisibility)
    ) {
      this.logger.debug(
        `Skipping resource ${resource.uri} from ${pluginId} - insufficient permissions`,
      );
      return;
    }

    // Register the resource with MCP server
    this.mcpServer.resource(
      resource.uri,
      resource.description ?? `Resource from ${pluginId}`,
      async () => {
        try {
          // Get resource through message bus using plugin-specific message type
          const response = await this.messageBus.send(
            `plugin:${pluginId}:resource:get`,
            {
              resourceUri: resource.uri,
            },
            "MCPService",
          );

          return {
            contents: [
              {
                uri: resource.uri,
                mimeType: resource.mimeType ?? "text/plain",
                text: this.serializeResponse(response),
              },
            ],
          };
        } catch (error) {
          this.logger.error(`Resource fetch error for ${resource.uri}`, error);
          throw error;
        }
      },
    );

    // Track the resource
    this.registeredResources.set(resource.uri, { pluginId, resource });
    this.logger.debug(`Registered resource ${resource.uri} from ${pluginId}`);
  }

  /**
   * Register a resource template with parameterized URI
   */
  public registerResourceTemplate(
    pluginId: string,
    template: PluginResourceTemplate,
  ): void {
    const listFn = template.list;
    const sdkTemplate = new ResourceTemplate(template.uriTemplate, {
      list: listFn
        ? async (): Promise<{
            resources: Array<{ uri: string; name: string }>;
          }> => ({
            resources: (await listFn()).map((r) => ({
              uri: r.uri,
              name: r.name,
            })),
          })
        : undefined,
    });

    this.mcpServer.registerResource(
      template.name,
      sdkTemplate,
      { description: template.description, mimeType: template.mimeType },
      async (_uri, vars) => {
        // SDK Variables can be string | string[] — flatten to string for our handler
        const flatVars: Record<string, string> = {};
        for (const [k, v] of Object.entries(vars)) {
          flatVars[k] = Array.isArray(v) ? (v[0] ?? "") : v;
        }
        return template.handler(flatVars);
      },
    );

    this.logger.debug(
      `Registered resource template ${template.uriTemplate} from ${pluginId}`,
    );
  }

  /**
   * Register an MCP prompt
   */
  public registerPrompt(pluginId: string, prompt: PluginPrompt): void {
    // Convert args to Zod schemas for the SDK
    const argsSchema = Object.fromEntries(
      Object.entries(prompt.args).map(([key, arg]) => [
        key,
        arg.required
          ? z.string().describe(arg.description)
          : z.string().optional().describe(arg.description),
      ]),
    );

    this.mcpServer.prompt(
      prompt.name,
      prompt.description ?? `Prompt from ${pluginId}`,
      argsSchema,
      async (args) => prompt.handler(args as Record<string, string>),
    );

    this.logger.debug(`Registered prompt ${prompt.name} from ${pluginId}`);
  }

  /**
   * List all registered tools
   */
  public listTools(): Array<{ pluginId: string; tool: PluginTool }> {
    return Array.from(this.registeredTools.values());
  }

  /**
   * List tools filtered by user permission level
   * Used for per-message filtering in multi-user contexts (e.g., Matrix rooms)
   * @param userLevel The user's permission level for this message
   * @returns Tools the user is allowed to use
   */
  public listToolsForPermissionLevel(
    userLevel: UserPermissionLevel,
  ): Array<{ pluginId: string; tool: PluginTool }> {
    const allTools = this.listTools();

    return allTools.filter(({ tool }) => {
      const toolVisibility = tool.visibility ?? "anchor";
      return PermissionService.hasPermission(userLevel, toolVisibility);
    });
  }

  /**
   * List all registered resources
   */
  public listResources(): Array<{
    pluginId: string;
    resource: PluginResource;
  }> {
    return Array.from(this.registeredResources.values());
  }

  public registerPluginInstructions(
    pluginId: string,
    instructions: string,
  ): void {
    this.pluginInstructions.set(pluginId, instructions);
    this.logger.debug(`Registered instructions from plugin: ${pluginId}`);
  }

  public getPluginInstructions(): string[] {
    return Array.from(this.pluginInstructions.values());
  }
}
