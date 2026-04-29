import { getErrorMessage, toError } from "@brains/utils";
import type { Logger } from "@brains/utils";
import type { IShell, PluginRegistrationContext } from "../interfaces";
import type { EventEmitter } from "events";
import type { PluginCapabilities } from "../interfaces";
import type { IDaemonRegistry } from "./daemon-types";
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
    private daemonRegistry: IDaemonRegistry,
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
    registrationContext?: PluginRegistrationContext,
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
      const capabilities = await plugin.register(shell, registrationContext);

      // Update plugin status
      pluginInfo.status = PluginStatus.INITIALIZED;
      this.logger.debug(`Initialized plugin: ${pluginId}`);

      // Daemons start in a later shell phase after all plugins have registered
      // and ready hooks have run.

      // Emit initialized event
      this.events.emit(PluginEvent.INITIALIZED, pluginId, plugin);

      return capabilities;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(
        `Error initializing plugin ${pluginId}: ${errorMessage}`,
      );

      // Update plugin status
      pluginInfo.status = PluginStatus.ERROR;
      pluginInfo.error = toError(error);

      // Emit error event
      this.events.emit(PluginEvent.ERROR, pluginId, error);

      // Re-throw for dependency resolution
      throw error;
    }
  }

  /**
   * Dispatch ready hook for a plugin.
   */
  public async readyPlugin(pluginId: string): Promise<void> {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      throw new PluginError(pluginId, "Ready failed: Plugin is not registered");
    }

    if (pluginInfo.status !== PluginStatus.INITIALIZED) {
      this.logger.debug(
        `Skipping ready hook for non-initialized plugin: ${pluginId}`,
      );
      return;
    }

    try {
      await pluginInfo.plugin.ready?.();
      this.logger.debug(`Ready hook completed for plugin: ${pluginId}`);
    } catch (error) {
      const readyError = toError(error);
      pluginInfo.status = PluginStatus.ERROR;
      pluginInfo.error = readyError;
      this.events.emit(PluginEvent.ERROR, pluginId, readyError);
      throw readyError;
    }
  }

  /**
   * Start any daemons registered by a plugin.
   */
  public async startPluginDaemons(pluginId: string): Promise<void> {
    const pluginInfo = this.plugins.get(pluginId);
    if (pluginInfo?.status !== PluginStatus.INITIALIZED) {
      return;
    }

    try {
      await this.daemonRegistry.startPlugin(pluginId);
      this.logger.debug(`Started daemons for plugin: ${pluginId}`);
    } catch (error) {
      if (pluginInfo.plugin.requiresDaemonStartup?.()) {
        throw error;
      }
      this.logger.warn(
        `Daemon ${pluginId} failed to start: ${getErrorMessage(error)}`,
      );
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

    // Call plugin shutdown hook if defined
    if (pluginInfo.plugin.shutdown) {
      try {
        await pluginInfo.plugin.shutdown();
        this.logger.debug(`Shutdown completed for plugin: ${id}`);
      } catch (error) {
        this.logger.error(`Plugin shutdown failed for ${id}:`, error);
        // Continue with disable even if shutdown fails
      }
    }

    // Update status
    pluginInfo.status = PluginStatus.DISABLED;

    // Emit disabled event
    this.events.emit(PluginEvent.DISABLED, id, pluginInfo.plugin);

    this.logger.debug(`Disabled plugin: ${id}`);
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

    this.logger.debug(`Enabled plugin: ${id}`);
  }
}
