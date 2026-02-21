import type { Plugin, PluginCapabilities, PluginType } from "../interfaces";
import type { Logger } from "@brains/utils";
import { createSilentLogger } from "@brains/test-utils";
import type { Template } from "@brains/templates";
import type { MessageHandler } from "@brains/messaging-service";
import type { DataSource } from "@brains/datasource";
import { MockShell } from "./mock-shell";

export interface HarnessOptions {
  logger?: Logger;
  logContext?: string;
  dataDir?: string;
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
    const mockShellOptions: { logger: Logger; dataDir?: string } = { logger };
    if (options.dataDir !== undefined) {
      mockShellOptions.dataDir = options.dataDir;
    }
    this.mockShell = new MockShell(mockShellOptions);
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
      this.mockShell = new MockShell(mockShellOptions);
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
   * Get the mock shell for direct access in tests
   */
  getShell(): MockShell {
    return this.mockShell;
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
  ): Promise<R | undefined> {
    const response = await this.mockShell
      .getMessageBus()
      .send(channel, payload, source);
    if ("data" in response) {
      return response.data as R | undefined;
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
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
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
    this.mockShell = new MockShell({
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
