import type { IMessageBus } from "@brains/messaging-service";
import { type UserPermissionLevel } from "@brains/templates";
import type { Logger } from "@brains/utils";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  canExposeResource,
  canExposeTool,
  createMcpServerInstance,
  filterToolsForPermission,
  registerPromptOnServer,
  registerResourceOnServer,
  registerResourceTemplateOnServer,
  registerToolOnServer,
  type RegisteredPrompt,
  type RegisteredResource,
  type RegisteredTemplate,
  type RegisteredTool,
} from "./mcp-registration";
import type { IMCPService, Prompt, Resource, ResourceTemplate, Tool } from "./types";

/**
 * MCP Service for managing tool and resource registration
 * Provides the core MCP server instance that interfaces can use
 */
export class MCPService implements IMCPService {
  private static instance: MCPService | null = null;

  private readonly logger: Logger;
  private readonly messageBus: IMessageBus;
  private readonly mcpServer: McpServer;

  // Track registered tools and resources
  private readonly registeredTools = new Map<string, RegisteredTool>();
  private readonly registeredResources = new Map<string, RegisteredResource>();
  private readonly registeredTemplates: RegisteredTemplate[] = [];
  private readonly registeredPrompts: RegisteredPrompt[] = [];

  // Track plugin instructions for agent system prompt
  private readonly pluginInstructions = new Map<string, string>();

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
    this.mcpServer = createMcpServerInstance();

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
    const server = createMcpServerInstance();
    this.registerEntriesOnServer(server, permissionLevel ?? this.permissionLevel);
    return server;
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
    if (canExposeTool(this.permissionLevel, tool)) {
      this.registerToolOnServer(this.mcpServer, pluginId, tool);
    }

    this.logger.debug(`Registered tool ${tool.name} from ${pluginId}`);
  }

  /**
   * Register a resource with the MCP server
   */
  public registerResource(pluginId: string, resource: Resource): void {
    // Always store in internal registry (same pattern as registerTool).
    this.registeredResources.set(resource.uri, { pluginId, resource });

    // Only expose on MCP protocol server if transport permission allows.
    if (canExposeResource(this.permissionLevel)) {
      registerResourceOnServer(this.mcpServer, resource);
    }

    this.logger.debug(`Registered resource ${resource.uri} from ${pluginId}`);
  }

  /**
   * Register a resource template with parameterized URI
   */
  public registerResourceTemplate<K extends string = string>(
    pluginId: string,
    template: ResourceTemplate<K>,
  ): void {
    registerResourceTemplateOnServer(this.mcpServer, template);

    this.registeredTemplates.push({ pluginId, template });
    this.logger.debug(
      `Registered resource template ${template.uriTemplate} from ${pluginId}`,
    );
  }

  /**
   * Register an MCP prompt
   */
  public registerPrompt(pluginId: string, prompt: Prompt): void {
    registerPromptOnServer(this.mcpServer, prompt);
    this.registeredPrompts.push({ pluginId, prompt });
    this.logger.debug(`Registered prompt ${prompt.name} from ${pluginId}`);
  }

  /**
   * List all registered tools
   */
  public listTools(): RegisteredTool[] {
    return Array.from(this.registeredTools.values());
  }

  public getCliTools(): RegisteredTool[] {
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
  ): RegisteredTool[] {
    return filterToolsForPermission(this.listTools(), userLevel);
  }

  /**
   * List all registered resources
   */
  public listResources(): RegisteredResource[] {
    return Array.from(this.registeredResources.values());
  }

  public registerInstructions(pluginId: string, instructions: string): void {
    this.pluginInstructions.set(pluginId, instructions);
    this.logger.debug(`Registered instructions from plugin: ${pluginId}`);
  }

  public getInstructions(): string[] {
    return Array.from(this.pluginInstructions.values());
  }

  private registerEntriesOnServer(
    server: McpServer,
    permissionLevel: UserPermissionLevel,
  ): void {
    for (const { pluginId, tool } of this.registeredTools.values()) {
      if (canExposeTool(permissionLevel, tool)) {
        this.registerToolOnServer(server, pluginId, tool);
      }
    }

    for (const { resource } of this.registeredResources.values()) {
      registerResourceOnServer(server, resource);
    }

    for (const { template } of this.registeredTemplates) {
      registerResourceTemplateOnServer(server, template);
    }

    for (const { prompt } of this.registeredPrompts) {
      registerPromptOnServer(server, prompt);
    }
  }

  private registerToolOnServer(
    server: McpServer,
    pluginId: string,
    tool: Tool,
  ): void {
    registerToolOnServer(server, pluginId, tool, this.messageBus, this.logger);
  }
}
