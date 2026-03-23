import type {
  Plugin,
  PluginCapabilities,
  PluginType,
  ToolResponse,
  ToolConfirmation,
} from "../interfaces";
import { type z } from "@brains/utils";
import { toolSuccessSchema, toolErrorSchema } from "@brains/mcp-service";

type ToolSuccess = z.infer<typeof toolSuccessSchema>;
type ToolError = z.infer<typeof toolErrorSchema>;
import type { Logger } from "@brains/utils";
import { createSilentLogger } from "@brains/test-utils";
import type { Template } from "@brains/templates";
import type { MessageHandler } from "@brains/messaging-service";
import type {
  DataSource,
  IEntityService,
  IEntityRegistry,
} from "@brains/entity-service";
import { createMockShell, type MockShell } from "./mock-shell";
import {
  createServicePluginContext,
  type ServicePluginContext,
} from "../service/context";

export interface HarnessOptions {
  logger?: Logger;
  logContext?: string;
  dataDir?: string;
  /** Bare domain for context.domain/siteUrl/previewUrl */
  domain?: string;
}

/**
 * Unified test harness for all plugin types
 * Provides a simple way to test plugins with automatic type detection
 */
export class PluginTestHarness<TPlugin extends Plugin = Plugin> {
  private mockShell: MockShell;
  private plugin: TPlugin | undefined;
  private capabilities: PluginCapabilities | undefined;
  private readonly options: HarnessOptions;

  constructor(options: HarnessOptions = {}) {
    this.options = options;
    const logger =
      options.logger ?? createSilentLogger(options.logContext ?? "plugin-test");
    const mockShellOptions: {
      logger: Logger;
      dataDir?: string;
      domain?: string;
    } = { logger };
    if (options.dataDir !== undefined) {
      mockShellOptions.dataDir = options.dataDir;
    }
    if (options.domain !== undefined) {
      mockShellOptions.domain = options.domain;
    }
    this.mockShell = createMockShell(mockShellOptions);
  }

  /**
   * Install a plugin for testing
   * The plugin will create its own typed context from the mock shell
   */
  async installPlugin(plugin: TPlugin): Promise<PluginCapabilities> {
    this.plugin = plugin;

    // Update logger context based on plugin type if not explicitly set
    // If no custom logger was provided in options, create one with the plugin type context
    if (!this.options.logger && !this.options.logContext) {
      const pluginType = this.getPluginType(plugin);
      const context = `${pluginType}-plugin-test`;
      const mockShellOptions: { logger: Logger; dataDir?: string } = {
        logger: createSilentLogger(context),
      };
      if (this.options.dataDir !== undefined) {
        mockShellOptions.dataDir = this.options.dataDir;
      }
      this.mockShell = createMockShell(mockShellOptions);
    }

    this.capabilities = await plugin.register(this.mockShell);
    this.mockShell.addPlugin(plugin);
    return this.capabilities;
  }

  /**
   * Get the installed plugin for direct testing
   */
  getPlugin(): TPlugin {
    if (!this.plugin) {
      throw new Error("No plugin installed. Call installPlugin() first.");
    }
    return this.plugin;
  }

  /**
   * Get the plugin capabilities
   */
  getCapabilities(): PluginCapabilities {
    if (!this.capabilities) {
      throw new Error("No plugin installed. Call installPlugin() first.");
    }
    return this.capabilities;
  }

  /**
   * Get the entity service for creating/querying test entities
   */
  getEntityService(): IEntityService {
    return this.mockShell.getEntityService();
  }

  /**
   * Get the underlying mock shell for direct access in tests
   */
  getMockShell(): MockShell {
    return this.mockShell;
  }

  /**
   * Get the entity registry for registering entity types in tests
   */
  getEntityRegistry(): IEntityRegistry {
    return this.mockShell.getEntityRegistry();
  }

  /**
   * Create a ServicePluginContext for testing tools/handlers/datasources in isolation
   */
  getServiceContext(pluginId: string): ServicePluginContext {
    return createServicePluginContext(this.mockShell, pluginId);
  }

  /**
   * Override the agent service (for interface plugin tests that mock AI responses)
   */
  setAgentService(
    agentService: Parameters<MockShell["setAgentService"]>[0],
  ): void {
    this.mockShell.setAgentService(agentService);
  }

  /**
   * Get the permission service for reading permission levels
   */
  getPermissionService(): ReturnType<MockShell["getPermissionService"]> {
    return this.mockShell.getPermissionService();
  }

  /**
   * Override the permission service (for interface tests that need custom permission config)
   */
  setPermissionService(
    service: ReturnType<MockShell["getPermissionService"]>,
  ): void {
    this.mockShell.getPermissionService = () => service;
  }

  /**
   * Bulk-add test entities (registers entity types automatically)
   */
  addEntities(
    entities: Array<{
      id: string;
      entityType: string;
      content: string;
      metadata: Record<string, unknown>;
      contentHash?: string;
      created?: string;
      updated?: string;
    }>,
  ): void {
    this.mockShell.addEntities(
      entities.map((e) => ({
        contentHash: "test",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        ...e,
      })),
    );
  }

  /**
   * Register a template for testing
   */
  registerTemplate(name: string, template: Template): void {
    this.mockShell.registerTemplates({ [name]: template });
  }

  /**
   * Get registered templates
   */
  getTemplates(): Map<string, Template> {
    return this.mockShell.getTemplates();
  }

  /**
   * Register a DataSource for testing
   */
  registerDataSource(dataSource: DataSource): void {
    // Just register the DataSource directly - the register method handles prefixing
    this.mockShell.getDataSourceRegistry().register(dataSource);
  }

  /**
   * Get registered DataSources
   */
  getDataSources(): Map<string, DataSource> {
    const registry = this.mockShell.getDataSourceRegistry();
    const dataSources = new Map<string, DataSource>();

    // Get all DataSource IDs and their corresponding DataSources
    registry.getIds().forEach((id) => {
      const dataSource = registry.get(id);
      if (dataSource) {
        dataSources.set(id, dataSource);
      }
    });

    return dataSources;
  }

  /**
   * Send a message through the message bus
   */
  async sendMessage<T = unknown, R = unknown>(
    channel: string,
    payload: T,
    source = "test",
    broadcast?: boolean,
  ): Promise<R | undefined> {
    const response = await this.mockShell
      .getMessageBus()
      .send<T, R>(channel, payload, source, undefined, undefined, broadcast);
    if ("data" in response) {
      return response.data;
    }
    return undefined;
  }

  /**
   * Subscribe to messages
   */
  subscribe<T = unknown, R = unknown>(
    channel: string,
    handler: MessageHandler<T, R>,
  ): () => void {
    return this.mockShell.getMessageBus().subscribe(channel, handler);
  }

  /**
   * Get the plugin's session ID (for InterfacePlugin)
   */
  getSessionId(): string {
    const plugin = this.getPlugin();
    if ("sessionId" in plugin && typeof plugin.sessionId === "string") {
      return plugin.sessionId;
    }
    throw new Error("Plugin does not have a sessionId property");
  }

  /**
   * Execute a tool by name
   * @param toolName - Full tool name (e.g., "system_search")
   * @param input - Tool input parameters
   * @param context - Optional tool context override
   * @returns Tool result with success/error status
   */
  async executeTool(
    toolName: string,
    input: Record<string, unknown> = {},
    context?: { interfaceType?: string; userId?: string; channelId?: string },
  ): Promise<ToolResponse> {
    if (!this.capabilities) {
      throw new Error("No plugin installed. Call installPlugin() first.");
    }

    const tool = this.capabilities.tools.find((t) => t.name === toolName);
    if (!tool) {
      const availableTools = this.capabilities.tools.map((t) => t.name);
      throw new Error(
        `Tool not found: ${toolName}. Available tools: ${availableTools.join(", ")}`,
      );
    }

    // Create a default test context
    const toolContext: {
      interfaceType: string;
      userId: string;
      channelId?: string;
    } = {
      interfaceType: context?.interfaceType ?? "test",
      userId: context?.userId ?? "test-user",
    };
    if (context?.channelId) {
      toolContext.channelId = context.channelId;
    }

    return tool.handler(input, toolContext);
  }

  /**
   * Reset the harness
   */
  reset(): void {
    this.plugin = undefined;
    this.capabilities = undefined;
    // Create a fresh MockShell
    this.mockShell = createMockShell({
      logger: this.mockShell.getLogger(),
    });
  }

  /**
   * Detect plugin type from plugin instance
   */
  private getPluginType(plugin: Plugin): PluginType {
    return plugin.type;
  }
}

/**
 * Create a test harness for any plugin type
 */
export function createPluginHarness<T extends Plugin = Plugin>(
  options?: HarnessOptions,
): PluginTestHarness<T> {
  return new PluginTestHarness<T>({
    logContext: "plugin-test",
    ...options,
  });
}

// ── Test assertion helpers ──

/**
 * Assert a tool result is the success variant.
 * Throws if not — narrows the type for subsequent access.
 */
export function expectSuccess(
  result: ToolResponse,
): asserts result is ToolSuccess {
  if (!("success" in result) || !result.success) {
    throw new Error(`Expected tool success but got: ${JSON.stringify(result)}`);
  }
}

/**
 * Assert a tool result is the error variant.
 * Throws if not — narrows the type for subsequent access.
 */
export function expectError(result: ToolResponse): asserts result is ToolError {
  if (!("success" in result) || result.success !== false) {
    throw new Error(`Expected tool error but got: ${JSON.stringify(result)}`);
  }
}

/**
 * Assert a tool result is a confirmation request.
 * Throws if not — narrows the type for subsequent access.
 */
export function expectConfirmation(
  result: ToolResponse,
): asserts result is ToolConfirmation {
  if (!("needsConfirmation" in result)) {
    throw new Error(`Expected confirmation but got: ${JSON.stringify(result)}`);
  }
}
