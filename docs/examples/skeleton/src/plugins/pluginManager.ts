import { z } from "zod";
import { Registry } from "../registry/registry";
import { Logger } from "../utils/logger";
import { EntityRegistry } from "../entity/entityRegistry";
import { MessageBus } from "../messaging/messageBus";
import { ToolRegistry } from "../tools/toolRegistry";
import { ConfigurationManager } from "../config/configurationManager";

/**
 * Plugin schema
 */
export const pluginSchema = z.object({
  id: z.string(),
  version: z.string(),
  dependencies: z.array(z.string()).optional(),
});

export type Plugin = z.infer<typeof pluginSchema> & {
  register: (context: PluginContext) => PluginLifecycle;
};

/**
 * Plugin lifecycle hooks
 */
export interface PluginLifecycle {
  onInitialize?(): Promise<void> | void;
  onShutdown?(): Promise<void> | void;
  onReady?(): Promise<void> | void;
  onDependencyInitialized?(dependencyId: string): Promise<void> | void;
}

/**
 * Context provided to plugins during registration
 */
export interface PluginContext {
  registry: Registry;
  entityRegistry: EntityRegistry;
  messageBus: MessageBus;
  toolRegistry: ToolRegistry;
  logger: Logger;
  config: ConfigurationManager;
}

/**
 * Context plugin schema
 */
export const contextPluginSchema = pluginSchema.extend({
  contextType: z.string(),
  contextConfig: z.record(z.unknown()).optional(),
});

export type ContextPlugin = z.infer<typeof contextPluginSchema> & {
  register: (context: PluginContext) => PluginLifecycle;
};

/**
 * Manager for plugins
 */
export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private initializedPlugins: Set<string> = new Set();
  private pluginLifecycles: Map<string, PluginLifecycle> = new Map();
  private logger: Logger;
  private pluginContext: PluginContext;

  /**
   * Create a new plugin manager
   */
  constructor(context: PluginContext) {
    this.pluginContext = context;
    this.logger = context.logger;
  }

  /**
   * Register a plugin
   */
  public registerPlugin(plugin: Plugin): void {
    // Validate plugin
    const validatedPlugin = {
      ...pluginSchema.parse(plugin),
      register: plugin.register,
    };

    // Check if plugin already registered
    if (this.plugins.has(validatedPlugin.id)) {
      this.logger.warn(`Plugin already registered: ${validatedPlugin.id}`);
      return;
    }

    // Register plugin
    this.plugins.set(validatedPlugin.id, validatedPlugin);
    this.logger.info(
      `Registered plugin: ${validatedPlugin.id} v${validatedPlugin.version}`,
    );
  }

  /**
   * Initialize all registered plugins in dependency order
   */
  public async initializePlugins(): Promise<void> {
    // Get all plugins
    const allPlugins = Array.from(this.plugins.values());

    // Sort plugins by dependencies
    const sortedPlugins = this.sortPluginsByDependencies(allPlugins);

    // Initialize plugins in order
    for (const plugin of sortedPlugins) {
      await this.initializePlugin(plugin);
    }

    // Call onReady for all initialized plugins
    for (const plugin of sortedPlugins) {
      const lifecycle = this.pluginLifecycles.get(plugin.id);
      if (lifecycle?.onReady) {
        await lifecycle.onReady();
      }
    }
  }

  /**
   * Initialize a plugin
   */
  private async initializePlugin(plugin: Plugin): Promise<void> {
    // Skip if already initialized
    if (this.isPluginInitialized(plugin.id)) {
      return;
    }

    // Check dependencies
    if (plugin.dependencies && plugin.dependencies.length > 0) {
      for (const dependencyId of plugin.dependencies) {
        // Check if dependency exists
        if (!this.hasPlugin(dependencyId)) {
          throw new Error(
            `Missing dependency for plugin ${plugin.id}: ${dependencyId}`,
          );
        }

        // Initialize dependency
        const dependency = this.getPlugin(dependencyId)!;
        await this.initializePlugin(dependency);

        // Notify plugin of dependency initialization
        const lifecycle = this.pluginLifecycles.get(plugin.id);
        if (lifecycle?.onDependencyInitialized) {
          await lifecycle.onDependencyInitialized(dependencyId);
        }
      }
    }

    // Register plugin components
    try {
      this.logger.info(`Initializing plugin: ${plugin.id}`);

      // Call register function
      const lifecycle = plugin.register(this.pluginContext);
      this.pluginLifecycles.set(plugin.id, lifecycle);

      // Call onInitialize hook
      if (lifecycle.onInitialize) {
        await lifecycle.onInitialize();
      }

      // Mark as initialized
      this.initializedPlugins.add(plugin.id);
      this.logger.info(`Initialized plugin: ${plugin.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to initialize plugin ${plugin.id}: ${error.message}`,
        {
          error,
          plugin,
        },
      );
      throw error;
    }
  }

  /**
   * Sort plugins by dependencies
   */
  private sortPluginsByDependencies(plugins: Plugin[]): Plugin[] {
    // Create a map of plugin IDs to plugins
    const pluginMap = new Map<string, Plugin>();
    for (const plugin of plugins) {
      pluginMap.set(plugin.id, plugin);
    }

    // Create a dependency graph
    const graph = new Map<string, Set<string>>();
    for (const plugin of plugins) {
      graph.set(plugin.id, new Set<string>());
      if (plugin.dependencies) {
        for (const dependencyId of plugin.dependencies) {
          if (!pluginMap.has(dependencyId)) {
            throw new Error(
              `Missing dependency for plugin ${plugin.id}: ${dependencyId}`,
            );
          }

          // Add edge from dependency to plugin
          if (!graph.has(dependencyId)) {
            graph.set(dependencyId, new Set<string>());
          }
          graph.get(dependencyId)!.add(plugin.id);
        }
      }
    }

    // Topological sort
    const visited = new Set<string>();
    const temp = new Set<string>();
    const order: string[] = [];

    // Visit function for DFS
    const visit = (id: string) => {
      // Check for cycle
      if (temp.has(id)) {
        throw new Error(`Dependency cycle detected: ${id}`);
      }

      // Skip if already visited
      if (visited.has(id)) {
        return;
      }

      // Mark as temporary visited
      temp.add(id);

      // Visit dependencies
      const dependencies = Array.from(graph.get(id) || []);
      for (const dependencyId of dependencies) {
        visit(dependencyId);
      }

      // Mark as visited
      temp.delete(id);
      visited.add(id);

      // Add to order
      order.push(id);
    };

    // Visit all plugins
    for (const plugin of plugins) {
      if (!visited.has(plugin.id)) {
        visit(plugin.id);
      }
    }

    // Reverse order to get dependencies first
    order.reverse();

    // Map order back to plugins
    return order.map((id) => pluginMap.get(id)!);
  }

  /**
   * Shut down all plugins in reverse dependency order
   */
  public async shutdownPlugins(): Promise<void> {
    // Get all initialized plugins
    const initializedPluginIds = Array.from(this.initializedPlugins);

    // Get plugin objects
    const plugins = initializedPluginIds.map((id) => this.getPlugin(id)!);

    // Sort plugins by dependencies
    const sortedPlugins = this.sortPluginsByDependencies(plugins);

    // Reverse to get dependent plugins first
    sortedPlugins.reverse();

    // Shut down plugins in order
    for (const plugin of sortedPlugins) {
      await this.shutdownPlugin(plugin.id);
    }
  }

  /**
   * Shut down a plugin
   */
  private async shutdownPlugin(id: string): Promise<void> {
    // Skip if not initialized
    if (!this.isPluginInitialized(id)) {
      return;
    }

    // Get lifecycle
    const lifecycle = this.pluginLifecycles.get(id);
    if (!lifecycle) {
      return;
    }

    // Call onShutdown hook
    try {
      this.logger.info(`Shutting down plugin: ${id}`);

      if (lifecycle.onShutdown) {
        await lifecycle.onShutdown();
      }

      // Mark as not initialized
      this.initializedPlugins.delete(id);
      this.logger.info(`Shut down plugin: ${id}`);
    } catch (error) {
      this.logger.error(`Failed to shut down plugin ${id}: ${error.message}`, {
        error,
        plugin: id,
      });
    }
  }

  /**
   * Get a registered plugin by ID
   */
  public getPlugin(id: string): Plugin | undefined {
    return this.plugins.get(id);
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
    return this.initializedPlugins.has(id);
  }

  /**
   * Get all registered plugins
   */
  public getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all initialized plugins
   */
  public getAllInitializedPlugins(): Plugin[] {
    return Array.from(this.initializedPlugins)
      .map((id) => this.getPlugin(id)!)
      .filter(Boolean);
  }
}
