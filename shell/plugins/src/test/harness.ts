import type { Plugin, PluginCapabilities, PluginType } from "../interfaces";
import type { CorePlugin } from "../core/core-plugin";
import type { ServicePlugin } from "../service/service-plugin";
import type { InterfacePlugin } from "../interface/interface-plugin";
import type { Logger } from "@brains/utils";
import { createSilentLogger } from "@brains/utils";
import type { Template } from "@brains/templates";
import type { MessageHandler } from "@brains/messaging-service";
import type { DataSource } from "@brains/datasource";
import { MockShell } from "@brains/core";

export interface HarnessOptions {
  logger?: Logger;
  logContext?: string;
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
    this.mockShell = new MockShell({ logger });
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
      this.mockShell = new MockShell({
        logger: createSilentLogger(context),
      });
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
   * Get the plugin's session ID (for MessageInterfacePlugin)
   */
  getSessionId(): string {
    const plugin = this.getPlugin();
    if ("sessionId" in plugin && typeof plugin.sessionId === "string") {
      return plugin.sessionId;
    }
    throw new Error("Plugin does not have a sessionId property");
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
 * Create a test harness for core plugins
 */
export function createCorePluginHarness<T extends CorePlugin = CorePlugin>(
  options?: HarnessOptions,
): PluginTestHarness<T> {
  return new PluginTestHarness<T>({
    logContext: "core-plugin-test",
    ...options,
  });
}

/**
 * Create a test harness for service plugins
 */
export function createServicePluginHarness<
  T extends ServicePlugin = ServicePlugin,
>(options?: HarnessOptions): PluginTestHarness<T> {
  return new PluginTestHarness<T>({
    logContext: "service-plugin-test",
    ...options,
  });
}

/**
 * Create a test harness for interface plugins
 */
export function createInterfacePluginHarness<
  T extends InterfacePlugin = InterfacePlugin,
>(options?: HarnessOptions): PluginTestHarness<T> {
  return new PluginTestHarness<T>({
    logContext: "interface-plugin-test",
    ...options,
  });
}
