import { createSilentLogger, type Logger } from "@brains/utils";
import type { Plugin, PluginCapabilities } from "@brains/plugin-base";
import { MockShell } from "@brains/core/test";
import type { Template } from "@brains/types";
import type { MessageHandler } from "@brains/messaging-service";

/**
 * Test harness for interface plugins - provides a simple way to test plugins
 * Plugins create their own context when registered with the mock shell
 */
export class InterfacePluginTestHarness<TPlugin extends Plugin = Plugin> {
  private mockShell: MockShell;
  private plugin: TPlugin | undefined;
  private capabilities: PluginCapabilities | undefined;

  constructor(
    options: {
      logger?: Logger;
    } = {},
  ) {
    const logger =
      options.logger ?? createSilentLogger("interface-plugin-test");
    this.mockShell = new MockShell({ logger });
  }

  /**
   * Install a plugin for testing
   * The plugin will create its own typed context from the mock shell
   */
  async installPlugin(plugin: TPlugin): Promise<PluginCapabilities> {
    this.plugin = plugin;
    this.capabilities = await plugin.register(this.mockShell);
    this.mockShell.addPlugin(plugin);
    return this.capabilities;
  }

  /**
   * Get the mock shell for direct access in tests
   */
  getShell(): MockShell {
    return this.mockShell;
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
}
