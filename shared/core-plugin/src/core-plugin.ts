import { BasePlugin } from "@brains/plugins";
import type { PluginCapabilities } from "@brains/plugins";
import type { IShell } from "@brains/types";
import type { CorePluginContext } from "./context";
import { createCorePluginContext } from "./context";

/**
 * Base class for core plugins
 * Core plugins provide basic functionality without entity management or interface capabilities
 */
export abstract class CorePlugin<TConfig = unknown> extends BasePlugin<
  TConfig,
  CorePluginContext
> {
  public readonly type = "core" as const;

  /**
   * Register the plugin with shell - creates CorePluginContext internally
   */
  override async register(shell: IShell): Promise<PluginCapabilities> {
    // Create typed context from shell
    const context = createCorePluginContext(shell, this.id);
    this.context = context;

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
    _context: CorePluginContext,
  ): Promise<void> {
    // Default implementation does nothing
  }
}
