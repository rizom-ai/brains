import type { Logger } from "@brains/utils";
import type { IShell } from "../interfaces";
import { EventEmitter } from "events";
import type { Plugin } from "../interfaces";
import { DaemonRegistry } from "@brains/daemon-registry";
import type {
  PluginManager as IPluginManager,
  PluginInfo,
  PluginManagerEventMap,
} from "./types";
import { PluginStatus, PluginEvent } from "./types";
import { PluginError } from "../errors";
import { PluginLifecycle } from "./plugin-lifecycle";
import { DependencyResolver } from "./dependency-resolver";
import { CapabilityRegistrar } from "./capability-registrar";

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
  private events = new EventEmitter();
  private daemonRegistry: DaemonRegistry;
  private shell: IShell | null = null;
  private pluginLifecycle: PluginLifecycle;
  private dependencyResolver: DependencyResolver;
  private capabilityRegistrar: CapabilityRegistrar;

  /**
   * Get the singleton instance of PluginManager
   */
  public static getInstance(logger: Logger): PluginManager {
    PluginManager.instance ??= new PluginManager(logger);
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
  public static createFresh(logger: Logger): PluginManager {
    return new PluginManager(logger);
  }

  /**
   * Set the shell instance after it's created
   */
  public setShell(shell: IShell): void {
    this.shell = shell;
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(logger: Logger) {
    this.logger = logger.child("PluginManager");
    this.events = new EventEmitter();
    this.daemonRegistry = DaemonRegistry.getInstance(logger);

    // Initialize helper classes
    this.pluginLifecycle = new PluginLifecycle(
      this.plugins,
      this.events,
      this.daemonRegistry,
      logger,
    );
    this.dependencyResolver = new DependencyResolver(
      this.plugins,
      this.events,
      logger,
    );
    this.capabilityRegistrar = new CapabilityRegistrar(logger);
  }

  /**
   * Register a plugin with the system
   * This only registers the plugin but doesn't initialize it
   */
  public registerPlugin(plugin: Plugin): void {
    if (!plugin.id) {
      throw new PluginError(
        "unknown",
        "Registration failed: Plugin must have an id",
      );
    }

    this.logger.debug(`Registering plugin: ${plugin.id} (${plugin.version})`);

    // Check if plugin is already registered
    if (this.plugins.has(plugin.id)) {
      const existingInfo = this.plugins.get(plugin.id);
      const existingVersion = existingInfo?.plugin.version;

      throw new PluginError(
        plugin.id,
        `Registration failed: Plugin is already registered with version ${existingVersion}`,
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
    this.logger.debug(`Registered plugin: ${plugin.id} (${plugin.version})`);

    // Emit registered event
    this.events.emit(PluginEvent.REGISTERED, plugin.id, plugin);
  }

  /**
   * Initialize all registered plugins in dependency order
   * Plugins with no dependencies are initialized first
   */
  public async initializePlugins(): Promise<void> {
    this.logger.debug("Initializing plugins...");

    // Use dependency resolver to handle initialization order
    const result = await this.dependencyResolver.resolveInitializationOrder(
      async (pluginId) => {
        await this.initializePlugin(pluginId);
      },
    );

    this.logger.debug(
      `Initialized ${result.initialized.size} of ${this.plugins.size} plugins`,
    );
  }

  /**
   * Initialize a specific plugin
   */
  private async initializePlugin(pluginId: string): Promise<void> {
    if (!this.shell) {
      throw new PluginError(
        pluginId,
        "Cannot initialize plugin: Shell not set. Call setShell() first.",
      );
    }
    const shell = this.shell;

    // Use plugin lifecycle to initialize
    const capabilities = await this.pluginLifecycle.initializePlugin(
      pluginId,
      shell,
    );

    // Register capabilities
    await this.capabilityRegistrar.registerCapabilities(
      shell,
      pluginId,
      capabilities,
    );
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
    return Array.from(this.plugins.entries())
      .filter(
        (entry): entry is [string, PluginInfo & { error: Error }] =>
          entry[1].status === PluginStatus.ERROR &&
          entry[1].error !== undefined,
      )
      .map(([id, info]) => ({ id, error: info.error }));
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
    await this.pluginLifecycle.disablePlugin(id);
  }

  /**
   * Enable a disabled plugin
   */
  public async enablePlugin(id: string): Promise<void> {
    await this.pluginLifecycle.enablePlugin(id);
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
