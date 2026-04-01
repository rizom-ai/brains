import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IMessageBus, MessageResponse } from "@brains/messaging-service";
import type { Logger } from "@brains/utils";
import { PermissionService, type UserPermissionLevel } from "@brains/templates";
import type { Tool, Resource, ResourceTemplate, Prompt } from "./types";
import type { IMCPService } from "./types";
import { ResourceTemplate as MCPResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
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
  private registeredTools = new Map<string, { pluginId: string; tool: Tool }>();
  private registeredResources = new Map<
    string,
    { pluginId: string; resource: Resource }
  >();
  private registeredTemplates: Array<{
    pluginId: string;
    template: ResourceTemplate;
  }> = [];
  private registeredPrompts: Array<{
    pluginId: string;
    prompt: Prompt;
  }> = [];

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
  public createMcpServer(permissionLevel?: UserPermissionLevel): McpServer {
    const level = permissionLevel ?? this.permissionLevel;
    const server = new McpServer({
      name: "brain-mcp",
      version: "1.0.0",
    });

    for (const [, { pluginId, tool }] of this.registeredTools) {
      const toolVisibility = tool.visibility ?? "anchor";
      if (!PermissionService.hasPermission(level, toolVisibility)) continue;
      this.registerToolOnServer(server, pluginId, tool);
    }

    for (const [, { pluginId, resource }] of this.registeredResources) {
      this.registerResourceOnServer(server, pluginId, resource);
    }

    for (const { template } of this.registeredTemplates) {
      this.registerResourceTemplateOnServer(server, template);
    }

    for (const { prompt } of this.registeredPrompts) {
      this.registerPromptOnServer(server, prompt);
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
  public registerTool(pluginId: string, tool: Tool): void {
    // Always store in the internal registry. The agent reads from here via
    // listToolsForPermissionLevel() which filters per-call. Without this,
    // setPermissionLevel("public") called by an interface before system tools
    // are registered would silently drop anchor tools from the registry.
    this.registeredTools.set(tool.name, { pluginId, tool });

    // Only expose on the MCP protocol server if transport permission allows.
    const toolVisibility = tool.visibility ?? "anchor";
    if (PermissionService.hasPermission(this.permissionLevel, toolVisibility)) {
      this.registerToolOnServer(this.mcpServer, pluginId, tool);
    }

    this.logger.debug(`Registered tool ${tool.name} from ${pluginId}`);
  }

  /**
   * Register a resource with the MCP server
   */
  public registerResource(pluginId: string, resource: Resource): void {
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

    this.registerResourceOnServer(this.mcpServer, pluginId, resource);
    this.registeredResources.set(resource.uri, { pluginId, resource });
    this.logger.debug(`Registered resource ${resource.uri} from ${pluginId}`);
  }

  /**
   * Register a prompt on a specific MCP server instance
   */
  private registerPromptOnServer(server: McpServer, prompt: Prompt): void {
    const argsSchema = Object.fromEntries(
      Object.entries(prompt.args).map(([key, arg]) => [
        key,
        arg.required
          ? z.string().describe(arg.description)
          : z.string().optional().describe(arg.description),
      ]),
    );

    server.prompt(
      prompt.name,
      prompt.description ?? "Prompt",
      argsSchema,
      async (args) => prompt.handler(args as Record<string, string>),
    );
  }

  /**
   * Register a tool on a specific MCP server instance
   */
  private registerToolOnServer(
    server: McpServer,
    pluginId: string,
    tool: Tool,
  ): void {
    server.tool(
      tool.name,
      tool.description,
      tool.inputSchema,
      async (params, extra) => {
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
        } catch (error) {
          this.logger.error(`Tool execution error for ${tool.name}`, error);
          throw error;
        }
      },
    );
  }

  /**
   * Register a resource on a specific MCP server instance
   */
  private registerResourceOnServer(
    server: McpServer,
    _pluginId: string,
    resource: Resource,
  ): void {
    server.resource(
      resource.name,
      resource.uri,
      { description: resource.description, mimeType: resource.mimeType },
      async () => resource.handler(),
    );
  }

  /**
   * Register a resource template with parameterized URI
   */
  public registerResourceTemplate<K extends string = string>(
    pluginId: string,
    template: ResourceTemplate<K>,
  ): void {
    this.registerResourceTemplateOnServer(this.mcpServer, template);

    this.registeredTemplates.push({ pluginId, template });
    this.logger.debug(
      `Registered resource template ${template.uriTemplate} from ${pluginId}`,
    );
  }

  private registerResourceTemplateOnServer(
    server: McpServer,
    template: ResourceTemplate,
  ): void {
    const listFn = template.list;

    const sdkTemplate = new MCPResourceTemplate(template.uriTemplate, {
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
      ...(template.complete && {
        complete: Object.fromEntries(
          Object.entries(template.complete).map(([k, fn]) => [
            k,
            (v: string): string[] | Promise<string[]> => fn(v),
          ]),
        ),
      }),
    });

    server.registerResource(
      template.name,
      sdkTemplate,
      { description: template.description, mimeType: template.mimeType },
      async (_uri, vars) => {
        const flatVars: Record<string, string> = {};
        for (const [k, v] of Object.entries(vars)) {
          flatVars[k] = Array.isArray(v) ? (v[0] ?? "") : v;
        }
        return template.handler(flatVars);
      },
    );
  }

  /**
   * Register an MCP prompt
   */
  public registerPrompt(pluginId: string, prompt: Prompt): void {
    this.registerPromptOnServer(this.mcpServer, prompt);
    this.registeredPrompts.push({ pluginId, prompt });
    this.logger.debug(`Registered prompt ${prompt.name} from ${pluginId}`);
  }

  /**
   * List all registered tools
   */
  public listTools(): Array<{ pluginId: string; tool: Tool }> {
    return Array.from(this.registeredTools.values());
  }

  public getCliTools(): Array<{ pluginId: string; tool: Tool }> {
    return this.listTools().filter(({ tool }) => tool.cli !== undefined);
  }

  /**
   * List tools filtered by user permission level
   * Used for per-message filtering in multi-user contexts (e.g., Matrix rooms)
   * @param userLevel The user's permission level for this message
   * @returns Tools the user is allowed to use
   */
  public listToolsForPermissionLevel(
    userLevel: UserPermissionLevel,
  ): Array<{ pluginId: string; tool: Tool }> {
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
    resource: Resource;
  }> {
    return Array.from(this.registeredResources.values());
  }

  public registerInstructions(pluginId: string, instructions: string): void {
    this.pluginInstructions.set(pluginId, instructions);
    this.logger.debug(`Registered instructions from plugin: ${pluginId}`);
  }

  public getInstructions(): string[] {
    return Array.from(this.pluginInstructions.values());
  }
}
