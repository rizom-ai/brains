import type { Logger } from "@brains/utils";
import type { IShell } from "@brains/plugins";
import type { EventEmitter } from "events";
import type { PluginCapabilities } from "../interfaces";
import type { DaemonRegistry } from "@brains/daemon-registry";
import type { PluginInfo } from "./types";
import { PluginStatus, PluginEvent } from "./types";
import { PluginError } from "../errors";

/**
 * Handles plugin lifecycle operations (initialization, enable/disable)
 * Extracted from PluginManager for single responsibility
 */
export class PluginLifecycle {
  private logger: Logger;

  constructor(
    private plugins: Map<string, PluginInfo>,
    private events: EventEmitter,
    private daemonRegistry: DaemonRegistry,
    logger: Logger,
  ) {
    this.logger = logger.child("PluginLifecycle");
  }

  /**
   * Initialize a specific plugin
   */
  public async initializePlugin(
    pluginId: string,
    shell: IShell,
  ): Promise<PluginCapabilities> {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      throw new PluginError(
        pluginId,
        "Registration failed: Plugin is not registered",
      );
    }

    const plugin = pluginInfo.plugin;

    this.logger.debug(`Initializing plugin: ${pluginId}`);

    // Emit before initialize event
    this.events.emit(PluginEvent.BEFORE_INITIALIZE, pluginId, plugin);

    try {
      // Register the plugin and get capabilities
      const capabilities = await plugin.register(shell);

      // Update plugin status
      pluginInfo.status = PluginStatus.INITIALIZED;
      this.logger.info(`Initialized plugin: ${pluginId}`);

      // Start any daemons registered by this plugin
      try {
        await this.daemonRegistry.startPlugin(pluginId);
        this.logger.debug(`Started daemons for plugin: ${pluginId}`);
      } catch (error) {
        this.logger.error(
          `Failed to start daemons for plugin: ${pluginId}`,
          error,
        );
        // Don't fail plugin initialization if daemon startup fails
      }

      // Emit initialized event
      this.events.emit(PluginEvent.INITIALIZED, pluginId, plugin);

      return capabilities;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error initializing plugin ${pluginId}: ${errorMessage}`,
      );

      // Update plugin status
      pluginInfo.status = PluginStatus.ERROR;
      pluginInfo.error =
        error instanceof Error ? error : new Error(String(error));

      // Emit error event
      this.events.emit(PluginEvent.ERROR, pluginId, error);

      // Re-throw for dependency resolution
      throw error;
    }
  }

  /**
   * Disable a plugin
   * This only marks the plugin as disabled but doesn't unregister it
   */
  public async disablePlugin(id: string): Promise<void> {
    const pluginInfo = this.plugins.get(id);
    if (!pluginInfo) {
      this.logger.warn(`Cannot disable plugin ${id}: not registered`);
      return;
    }

    this.logger.debug(`Disabling plugin: ${id}`);

    // Stop any daemons registered by this plugin
    try {
      await this.daemonRegistry.stopPlugin(id);
      this.logger.debug(`Stopped daemons for plugin: ${id}`);
    } catch (error) {
      this.logger.error(`Failed to stop daemons for plugin: ${id}`, error);
      // Continue with plugin disable even if daemon stop fails
    }

    // Update status
    pluginInfo.status = PluginStatus.DISABLED;

    // Emit disabled event
    this.events.emit(PluginEvent.DISABLED, id, pluginInfo.plugin);

    this.logger.info(`Disabled plugin: ${id}`);
  }

  /**
   * Enable a disabled plugin
   */
  public async enablePlugin(id: string): Promise<void> {
    const pluginInfo = this.plugins.get(id);
    if (!pluginInfo) {
      this.logger.warn(`Cannot enable plugin ${id}: not registered`);
      return;
    }

    if (pluginInfo.status !== PluginStatus.DISABLED) {
      this.logger.warn(`Cannot enable plugin ${id}: not disabled`);
      return;
    }

    this.logger.debug(`Enabling plugin: ${id}`);

    // Update status back to initialized
    pluginInfo.status = PluginStatus.INITIALIZED;

    // Start any daemons registered by this plugin
    try {
      await this.daemonRegistry.startPlugin(id);
      this.logger.debug(`Started daemons for plugin: ${id}`);
    } catch (error) {
      this.logger.error(`Failed to start daemons for plugin: ${id}`, error);
      // Continue with plugin enable even if daemon start fails
    }

    // Emit enabled event
    this.events.emit(PluginEvent.ENABLED, id, pluginInfo.plugin);

    this.logger.info(`Enabled plugin: ${id}`);
  }
}