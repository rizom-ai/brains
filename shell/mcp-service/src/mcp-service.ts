import type { IMessageBus } from "@brains/messaging-service";
import { type UserPermissionLevel } from "@brains/templates";
import type { Logger } from "@brains/utils/logger";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  canExposePrompt,
  canExposeResource,
  canExposeResourceTemplate,
  canExposeToolOnProtocol,
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
import type {
  IMCPService,
  MCPProtocolMode,
  Prompt,
  Resource,
  ResourceTemplate,
  Tool,
} from "./types";
import { wrapToolWithResponseValidation } from "./tool-response-validation";

/**
 * MCP Service for managing tool and resource registration
 * Provides the core MCP server instance that interfaces can use
 */
export class MCPService implements IMCPService {
  private static instance: MCPService | null = null;

  private readonly logger: Logger;
  private readonly messageBus: IMessageBus;
  private mcpServer: McpServer;

  // Track registered tools and resources
  private readonly registeredTools = new Map<string, RegisteredTool>();
  private readonly registeredResources = new Map<string, RegisteredResource>();
  private readonly registeredTemplates: RegisteredTemplate[] = [];
  private readonly registeredPrompts: RegisteredPrompt[] = [];

  // Track plugin instructions for agent system prompt
  private readonly pluginInstructions = new Map<string, string>();

  // Default permission level and external protocol mode for the service
  private permissionLevel: UserPermissionLevel = "anchor";
  private protocolMode: MCPProtocolMode = "basic";

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
    this.registerEntriesOnServer(
      server,
      permissionLevel ?? this.permissionLevel,
      this.protocolMode,
    );
    return server;
  }

  /**
   * Set the permission level for this service
   */
  public setPermissionLevel(level: UserPermissionLevel): void {
    this.permissionLevel = level;
    this.mcpServer = createMcpServerInstance();
    this.registerEntriesOnServer(
      this.mcpServer,
      this.permissionLevel,
      this.protocolMode,
    );
    this.logger.debug(`Permission level set to ${level}`);
  }

  /**
   * Select which tools are exposed on the external MCP protocol server.
   */
  public setProtocolMode(mode: MCPProtocolMode): void {
    this.protocolMode = mode;
    this.mcpServer = createMcpServerInstance();
    this.registerEntriesOnServer(
      this.mcpServer,
      this.permissionLevel,
      this.protocolMode,
    );
    this.logger.debug(`MCP protocol mode set to ${mode}`);
  }

  /**
   * Register a tool with the MCP server
   */
  public registerTool(pluginId: string, tool: Tool): void {
    const validatedTool = wrapToolWithResponseValidation(
      pluginId,
      tool,
      this.logger,
    );

    // Always store in the internal registry. The agent reads from here via
    // listToolsForPermissionLevel() which filters per-call. Without this,
    // setPermissionLevel("public") called by an interface before system tools
    // are registered would silently drop anchor tools from the registry.
    this.registeredTools.set(validatedTool.name, {
      pluginId,
      tool: validatedTool,
    });

    // Only expose on the MCP protocol server if transport permission allows.
    if (
      canExposeToolOnProtocol(
        this.permissionLevel,
        validatedTool,
        this.protocolMode,
      )
    ) {
      this.registerToolOnServer(
        this.mcpServer,
        pluginId,
        validatedTool,
        this.permissionLevel,
      );
    }

    this.logger.debug(`Registered tool ${validatedTool.name} from ${pluginId}`);
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
   * Register a resource template with parameterized URI.
   *
   * Always stores in the internal registry so that per-session servers
   * (createMcpServer(anchor)) can re-expose the template even when the
   * default service permission is lower. The protocol server only sees the
   * template if the current permission allows it, matching plain resources.
   */
  public registerResourceTemplate<K extends string = string>(
    pluginId: string,
    template: ResourceTemplate<K>,
  ): void {
    this.registeredTemplates.push({ pluginId, template });

    if (canExposeResourceTemplate(this.permissionLevel)) {
      registerResourceTemplateOnServer(this.mcpServer, template);
    }

    this.logger.debug(
      `Registered resource template ${template.uriTemplate} from ${pluginId}`,
    );
  }

  /**
   * Register an MCP prompt.
   *
   * Mirrors registerTool: always store in the internal registry so per-session
   * servers (createMcpServer(anchor)) can re-expose the prompt even when the
   * default service permission is lower. The protocol server only sees the
   * prompt if the current permission allows it.
   */
  public registerPrompt(pluginId: string, prompt: Prompt): void {
    this.registeredPrompts.push({ pluginId, prompt });

    if (canExposePrompt(this.permissionLevel, prompt)) {
      registerPromptOnServer(this.mcpServer, prompt);
    }

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
    protocolMode: MCPProtocolMode,
  ): void {
    for (const { pluginId, tool } of this.registeredTools.values()) {
      if (canExposeToolOnProtocol(permissionLevel, tool, protocolMode)) {
        this.registerToolOnServer(server, pluginId, tool, permissionLevel);
      }
    }

    if (canExposeResource(permissionLevel)) {
      for (const { resource } of this.registeredResources.values()) {
        registerResourceOnServer(server, resource);
      }
    }

    if (canExposeResourceTemplate(permissionLevel)) {
      for (const { template } of this.registeredTemplates) {
        registerResourceTemplateOnServer(server, template);
      }
    }

    for (const { prompt } of this.registeredPrompts) {
      if (canExposePrompt(permissionLevel, prompt)) {
        registerPromptOnServer(server, prompt);
      }
    }
  }

  private registerToolOnServer(
    server: McpServer,
    pluginId: string,
    tool: Tool,
    permissionLevel: UserPermissionLevel,
  ): void {
    registerToolOnServer(
      server,
      pluginId,
      tool,
      this.messageBus,
      this.logger,
      permissionLevel,
    );
  }
}
