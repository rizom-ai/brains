import {
  Logger,
  PluginRegistrationError,
  PluginDependencyError,
  PluginInitializationError,
} from "@brains/utils";
import type { Plugin } from "@brains/plugin-base";
import type { IShell } from "@brains/types";

/**
 * Information about a registered plugin
 */
export interface PluginInfo {
  plugin: Plugin;
  status: "registered" | "initializing" | "initialized" | "error";
  dependencies: string[];
  error?: Error;
  initializedAt?: Date;
}

/**
 * Plugin registry for managing plugins
 * Implements Component Interface Standardization pattern
 */
export class PluginRegistry {
  private static instance: PluginRegistry | null = null;

  private plugins: Map<string, PluginInfo> = new Map();
  private logger: Logger;

  /**
   * Get the singleton instance of PluginRegistry
   */
  public static getInstance(
    logger: Logger = Logger.getInstance(),
  ): PluginRegistry {
    PluginRegistry.instance ??= new PluginRegistry(logger);
    return PluginRegistry.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    PluginRegistry.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(logger: Logger): PluginRegistry {
    return new PluginRegistry(logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(logger: Logger) {
    this.logger = logger.child("PluginRegistry");
  }

  /**
   * Register a plugin
   */
  public register(plugin: Plugin): void {
    if (!plugin.id) {
      throw new PluginRegistrationError(
        "unknown",
        "Plugin must have an id",
        "Missing plugin ID",
      );
    }

    this.logger.debug(`Registering plugin: ${plugin.id} (${plugin.version})`);

    if (this.plugins.has(plugin.id)) {
      const existingInfo = this.plugins.get(plugin.id);
      const existingVersion = existingInfo?.plugin.version;

      throw new PluginRegistrationError(
        plugin.id,
        `Plugin is already registered with version ${existingVersion}`,
        "Duplicate plugin registration",
        { existingVersion, newVersion: plugin.version },
      );
    }

    const pluginInfo: PluginInfo = {
      plugin,
      status: "registered",
      dependencies: plugin.dependencies ?? [],
    };

    this.plugins.set(plugin.id, pluginInfo);
    this.logger.info(`Registered plugin: ${plugin.id} (${plugin.version})`);
  }

  /**
   * Initialize all registered plugins
   */
  public async initializeAll(shell: IShell): Promise<void> {
    this.logger.info("Initializing plugins...");

    const allPluginIds = Array.from(this.plugins.keys());
    const initialized = new Set<string>();

    // Simple dependency resolution - keep trying until all are initialized
    let progress = true;
    while (progress && initialized.size < allPluginIds.length) {
      progress = false;

      for (const pluginId of allPluginIds) {
        if (initialized.has(pluginId)) continue;

        const pluginInfo = this.plugins.get(pluginId);
        if (!pluginInfo) continue;

        // Check if dependencies are met
        const unmetDeps = pluginInfo.dependencies.filter(
          (dep) => !initialized.has(dep),
        );

        if (unmetDeps.length === 0) {
          try {
            await this.initializePlugin(pluginId, shell);
            initialized.add(pluginId);
            progress = true;
          } catch (error) {
            this.logger.error(
              `Failed to initialize plugin ${pluginId}:`,
              error,
            );
            pluginInfo.status = "error";
            pluginInfo.error =
              error instanceof Error ? error : new Error(String(error));
            initialized.add(pluginId); // Don't block others
            progress = true;
          }
        }
      }
    }

    // Check for dependency issues
    const uninitialized = allPluginIds.filter((id) => !initialized.has(id));
    if (uninitialized.length > 0) {
      for (const pluginId of uninitialized) {
        const pluginInfo = this.plugins.get(pluginId);
        if (pluginInfo) {
          const unmetDeps = pluginInfo.dependencies.filter(
            (dep) => !initialized.has(dep),
          );
          pluginInfo.status = "error";
          pluginInfo.error = new PluginDependencyError(
            pluginId,
            unmetDeps,
            "Unmet dependencies",
          );
        }
      }

      throw new PluginDependencyError(
        "multiple",
        uninitialized,
        "Multiple plugins failed to initialize due to dependency issues",
      );
    }

    this.logger.info(`Successfully initialized ${initialized.size} plugins`);
  }

  /**
   * Initialize a specific plugin
   */
  private async initializePlugin(
    pluginId: string,
    shell: IShell,
  ): Promise<void> {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      throw new PluginInitializationError(
        pluginId,
        new Error("Plugin is not registered"),
        { operation: "initialize" },
      );
    }

    this.logger.debug(`Initializing plugin: ${pluginId}`);
    pluginInfo.status = "initializing";

    try {
      await pluginInfo.plugin.register(shell);
      pluginInfo.status = "initialized";
      pluginInfo.initializedAt = new Date();
      this.logger.info(`Initialized plugin: ${pluginId}`);
    } catch (error) {
      pluginInfo.status = "error";
      pluginInfo.error =
        error instanceof Error ? error : new Error(String(error));

      throw new PluginInitializationError(
        pluginId,
        error instanceof Error ? error : new Error(String(error)),
        { operation: "register" },
      );
    }
  }

  /**
   * Get plugin info
   */
  public get(pluginId: string): PluginInfo | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Check if plugin is registered
   */
  public has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Get all plugin info
   */
  public getAll(): PluginInfo[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin package name by ID
   */
  public getPackageName(pluginId: string): string | undefined {
    const pluginInfo = this.plugins.get(pluginId);
    return pluginInfo?.plugin.packageName;
  }
}
