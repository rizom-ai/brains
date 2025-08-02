import type { ServiceRegistry } from "@brains/service-registry";
import type { Logger } from "@brains/utils";
import type { IShell } from "@brains/plugins";
import { EventEmitter } from "events";
import type { Plugin } from "../interfaces";
import { DaemonRegistry } from "@brains/daemon-registry";
import type {
  PluginManager as IPluginManager,
  PluginInfo,
  PluginManagerEventMap,
} from "./types";
import { PluginStatus, PluginEvent } from "./types";
import { PluginRegistrationHandler } from "./pluginRegistrationHandler";
import { PluginRegistrationError, PluginDependencyError } from "../errors";

// Re-export enums for convenience
export { PluginEvent, PluginStatus } from "./types";

/**
 * Plugin manager that handles plugin registration, initialization, and lifecycle
 * Implements Component Interface Standardization pattern
 */
export class PluginManager implements IPluginManager {
  private static instance: PluginManager | null = null;

  private plugins: Map<string, PluginInfo> = new Map();
  private logger: Logger;
  private events: EventEmitter;
  private registrationHandler: PluginRegistrationHandler;
  private daemonRegistry: DaemonRegistry;
  private serviceRegistry: ServiceRegistry;

  /**
   * Get the singleton instance of PluginManager
   */
  public static getInstance(
    serviceRegistry: ServiceRegistry,
    logger: Logger,
  ): PluginManager {
    PluginManager.instance ??= new PluginManager(serviceRegistry, logger);
    return PluginManager.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    PluginManager.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    serviceRegistry: ServiceRegistry,
    logger: Logger,
  ): PluginManager {
    return new PluginManager(serviceRegistry, logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(serviceRegistry: ServiceRegistry, logger: Logger) {
    this.serviceRegistry = serviceRegistry;
    this.logger = logger.child("PluginManager");
    this.events = new EventEmitter();
    this.registrationHandler = PluginRegistrationHandler.getInstance(
      logger,
      this.events,
      serviceRegistry,
    );
    this.daemonRegistry = DaemonRegistry.getInstance(logger);
  }

  /**
   * Register a plugin with the system
   * This only registers the plugin but doesn't initialize it
   */
  public registerPlugin(plugin: Plugin): void {
    if (!plugin.id) {
      throw new PluginRegistrationError("unknown", "Plugin must have an id", {
        reason: "Missing plugin ID",
      });
    }

    this.logger.debug(`Registering plugin: ${plugin.id} (${plugin.version})`);

    // Check if plugin is already registered
    if (this.plugins.has(plugin.id)) {
      const existingInfo = this.plugins.get(plugin.id);
      const existingVersion = existingInfo?.plugin.version;

      throw new PluginRegistrationError(
        plugin.id,
        `Plugin is already registered with version ${existingVersion}`,
        {
          reason: "Duplicate plugin registration",
          existingVersion,
          newVersion: plugin.version,
        },
      );
    }

    // Get dependencies or use empty array
    const dependencies = plugin.dependencies ?? [];

    // Store plugin info
    const pluginInfo: PluginInfo = {
      plugin,
      status: PluginStatus.REGISTERED,
      dependencies,
    };

    this.plugins.set(plugin.id, pluginInfo);
    this.logger.info(`Registered plugin: ${plugin.id} (${plugin.version})`);

    // Emit registered event
    this.events.emit(PluginEvent.REGISTERED, plugin.id, plugin);
  }

  /**
   * Initialize all registered plugins in dependency order
   * Plugins with no dependencies are initialized first
   */
  public async initializePlugins(): Promise<void> {
    this.logger.info("Initializing plugins...");

    // Get all plugin IDs
    const allPluginIds = Array.from(this.plugins.keys());

    // Track initialized plugins
    const initialized = new Set<string>();

    // Try to initialize all plugins
    let progress = true;

    // Continue until all plugins are initialized or no progress can be made
    while (progress && initialized.size < allPluginIds.length) {
      progress = false;

      // Iterate through all plugins
      for (const pluginId of allPluginIds) {
        // Skip already initialized plugins
        if (initialized.has(pluginId)) {
          continue;
        }

        const pluginInfo = this.plugins.get(pluginId);
        if (!pluginInfo) {
          continue;
        }

        // Check if all dependencies are initialized
        const unmetDependencies = this.getUnmetDependencies(pluginId);

        if (unmetDependencies.length === 0) {
          // All dependencies are satisfied, initialize this plugin
          try {
            await this.initializePlugin(pluginId);
            initialized.add(pluginId);
            progress = true;
          } catch (error) {
            // Mark as error and continue with others
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Failed to initialize plugin ${pluginId}: ${errorMessage}`,
            );

            // Plugin status and error event are already set in initializePlugin
            // Consider this "handled" for dependency resolution
            initialized.add(pluginId);
            progress = true;
          }
        }
      }
    }

    // Check for plugins that couldn't be initialized due to dependency issues
    const uninitializedPlugins = allPluginIds.filter(
      (id) => !initialized.has(id),
    );

    if (uninitializedPlugins.length > 0) {
      const pluginList = uninitializedPlugins.join(", ");
      this.logger.error(
        `Failed to initialize plugins due to dependency issues: ${pluginList}`,
      );

      // Report specific issues for each plugin
      for (const pluginId of uninitializedPlugins) {
        const unmetDependencies = this.getUnmetDependencies(pluginId);
        this.logger.error(
          `Plugin ${pluginId} has unmet dependencies: ${unmetDependencies.join(", ")}`,
        );

        // Update plugin status
        const pluginInfo = this.plugins.get(pluginId);
        if (pluginInfo) {
          pluginInfo.status = PluginStatus.ERROR;
          pluginInfo.error = new PluginDependencyError(
            pluginId,
            `Unmet dependencies: ${unmetDependencies.join(", ")}`,
            { unmetDependencies },
          );
        }

        // Emit error event
        this.events.emit(PluginEvent.ERROR, pluginId, pluginInfo?.error);
      }
    }

    this.logger.info(
      `Initialized ${initialized.size} of ${allPluginIds.length} plugins`,
    );
  }

  /**
   * Initialize a specific plugin
   */
  private async initializePlugin(pluginId: string): Promise<void> {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      throw new PluginRegistrationError(pluginId, "Plugin is not registered", {
        reason: "Plugin not found in registry",
      });
    }

    const plugin = pluginInfo.plugin;

    this.logger.debug(`Initializing plugin: ${pluginId}`);

    // Emit before initialize event
    this.events.emit(PluginEvent.BEFORE_INITIALIZE, pluginId, plugin);

    // Register the plugin using the adapter
    try {
      // Get Shell from ServiceRegistry
      const shell = this.serviceRegistry.resolve<IShell>("shell");

      // Register the plugin directly with the new interface
      const capabilities = await plugin.register(shell);

      // Register capabilities through the handler
      await this.registrationHandler.registerPluginCapabilities(
        pluginId,
        capabilities,
      );

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
   * Check if all dependencies of a plugin are met
   */
  private getUnmetDependencies(pluginId: string): string[] {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      return [];
    }

    const { dependencies } = pluginInfo;
    const unmetDependencies: string[] = [];

    for (const depId of dependencies) {
      // Check if dependency exists
      const dependency = this.plugins.get(depId);

      if (!dependency) {
        unmetDependencies.push(depId);
        continue;
      }

      // Check if dependency is initialized (not just registered)
      if (dependency.status !== PluginStatus.INITIALIZED) {
        unmetDependencies.push(depId);
      }
    }

    return unmetDependencies;
  }

  /**
   * Get a registered plugin by ID
   */
  public getPlugin(id: string): Plugin | undefined {
    const pluginInfo = this.plugins.get(id);
    return pluginInfo?.plugin;
  }

  /**
   * Get plugin status by ID
   */
  public getPluginStatus(id: string): PluginStatus | undefined {
    const pluginInfo = this.plugins.get(id);
    return pluginInfo?.status;
  }

  /**
   * Check if a plugin is registered
   */
  public hasPlugin(id: string): boolean {
    return this.plugins.has(id);
  }

  /**
   * Check if a plugin is initialized
   */
  public isPluginInitialized(id: string): boolean {
    const pluginInfo = this.plugins.get(id);
    return pluginInfo?.status === PluginStatus.INITIALIZED;
  }

  /**
   * Get all registered plugin IDs
   */
  public getAllPluginIds(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get all plugins with their status
   */
  public getAllPlugins(): Map<string, PluginInfo> {
    return new Map(this.plugins);
  }

  /**
   * Get plugins that failed to initialize
   */
  public getFailedPlugins(): Array<{ id: string; error: Error }> {
    const failed: Array<{ id: string; error: Error }> = [];

    for (const [id, info] of this.plugins) {
      if (info.status === PluginStatus.ERROR && info.error) {
        failed.push({ id, error: info.error });
      }
    }

    return failed;
  }

  /**
   * Get plugin package name by ID
   */
  public getPluginPackageName(pluginId: string): string | undefined {
    const pluginInfo = this.plugins.get(pluginId);
    return pluginInfo?.plugin.packageName;
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

  /**
   * Subscribe to plugin events
   */
  public on<E extends PluginEvent>(
    event: E,
    listener: (...args: PluginManagerEventMap[E]) => void,
  ): void {
    this.events.on(event, listener);
  }

  /**
   * Subscribe to plugin events once
   */
  public once<E extends PluginEvent>(
    event: E,
    listener: (...args: PluginManagerEventMap[E]) => void,
  ): void {
    this.events.once(event, listener);
  }

  /**
   * Unsubscribe from plugin events
   */
  public off<E extends PluginEvent>(
    event: E,
    listener: (...args: PluginManagerEventMap[E]) => void,
  ): void {
    this.events.off(event, listener);
  }

  /**
   * Get the event emitter for external subscribers
   */
  public getEventEmitter(): EventEmitter {
    return this.events;
  }
}
