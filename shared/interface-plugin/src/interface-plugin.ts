import { BasePlugin } from "@brains/plugins";
import type { InterfacePluginContext } from "./context";
import { createInterfacePluginContext } from "./context";
import type { Daemon, PluginCapabilities } from "@brains/plugins";
import type { IShell } from "@brains/plugins";

/**
 * Base class for interface plugins
 * Interface plugins provide user interaction capabilities and manage daemons
 */
export abstract class InterfacePlugin<TConfig = unknown> extends BasePlugin<
  TConfig,
  InterfacePluginContext
> {
  public readonly type = "interface" as const;

  /**
   * Daemon instance for long-running processes
   */
  protected daemon?: Daemon;

  /**
   * Register the plugin with shell - creates InterfacePluginContext internally
   */
  override async register(shell: IShell): Promise<PluginCapabilities> {
    // Create typed context from shell
    const context = createInterfacePluginContext(shell, this.id);
    this.context = context;

    // Initialize daemon before registration
    this.initializeDaemon();

    // Register daemon if provided
    if (this.daemon) {
      await this.registerDaemon(context);
    }

    // Set up message handlers
    this.setupMessageHandlers(context);

    // Call lifecycle hook with typed context
    await this.onRegister(context);

    return {
      tools: await this.getTools(),
      resources: await this.getResources(),
      commands: await this.getCommands(),
    };
  }

  /**
   * Lifecycle hook for plugin initialization
   * Override this to perform plugin-specific setup
   */
  protected override async onRegister(
    _context: InterfacePluginContext,
  ): Promise<void> {
    // Default implementation does nothing
  }

  /**
   * Register daemon with the daemon registry
   */
  protected async registerDaemon(
    context: InterfacePluginContext,
  ): Promise<void> {
    if (!this.daemon) return;

    context.registerDaemon(this.id, this.daemon);
    context.logger.info(`Registered daemon for interface: ${this.id}`);
  }

  /**
   * Override to provide daemon implementation
   */
  protected createDaemon(): Daemon | undefined {
    return undefined;
  }

  /**
   * Initialize daemon during plugin construction
   */
  protected initializeDaemon(): void {
    const daemon = this.createDaemon();
    if (daemon) {
      this.daemon = daemon;
    }
  }
}
