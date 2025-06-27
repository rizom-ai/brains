import type { Registry } from "../registry/registry";
import type { Logger } from "@brains/utils";
import { EventEmitter } from "events";
import type {
  Plugin,
  PluginContext,
  BaseEntity,
  GenerationContext,
  Template,
  PluginManager as IPluginManager,
  PluginInfo,
  PluginManagerEventMap,
  PluginToolRegisterEvent,
  PluginResourceRegisterEvent,
  RouteDefinition,
  SectionDefinition,
} from "@brains/types";
import { PluginStatus, PluginEvent } from "@brains/types";
import type { EntityAdapter } from "@brains/base-entity";
import type { Shell } from "../shell";
import type { EntityRegistry } from "../entity/entityRegistry";
import type { z } from "zod";

// Re-export enums for convenience
export { PluginEvent, PluginStatus } from "@brains/types";

/**
 * Plugin manager that handles plugin registration, initialization, and lifecycle
 * Implements Component Interface Standardization pattern
 */
export class PluginManager implements IPluginManager {
  private static instance: PluginManager | null = null;

  private plugins: Map<string, PluginInfo> = new Map();
  private registry: Registry;
  private logger: Logger;
  private events: EventEmitter;

  /**
   * Get the singleton instance of PluginManager
   */
  public static getInstance(registry: Registry, logger: Logger): PluginManager {
    PluginManager.instance ??= new PluginManager(registry, logger);
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
  public static createFresh(registry: Registry, logger: Logger): PluginManager {
    return new PluginManager(registry, logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(registry: Registry, logger: Logger) {
    this.registry = registry;
    this.logger = logger.child("PluginManager");
    this.events = new EventEmitter();
  }

  /**
   * Register a plugin with the system
   * This only registers the plugin but doesn't initialize it
   */
  public registerPlugin(plugin: Plugin): void {
    if (!plugin.id) {
      throw new Error("Plugin must have an id");
    }

    this.logger.debug(`Registering plugin: ${plugin.id} (${plugin.version})`);

    // Check if plugin is already registered
    if (this.plugins.has(plugin.id)) {
      const existingInfo = this.plugins.get(plugin.id);
      const existingVersion = existingInfo?.plugin.version;

      throw new Error(
        `Plugin ${plugin.id} is already registered with version ${existingVersion}`,
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
          pluginInfo.error = new Error(
            `Unmet dependencies: ${unmetDependencies.join(", ")}`,
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
      throw new Error(`Plugin ${pluginId} is not registered`);
    }

    const plugin = pluginInfo.plugin;

    this.logger.debug(`Initializing plugin: ${pluginId}`);

    // Emit before initialize event
    this.events.emit(PluginEvent.BEFORE_INITIALIZE, pluginId, plugin);

    // Get services from shell - shell should always be available
    const shell = this.registry.resolve<Shell>("shell");
    const entityService = shell.getEntityService();
    const contentGenerator = shell.getContentGenerator();
    const viewRegistry = shell.getViewRegistry();

    // Create plugin context
    const context: PluginContext = {
      pluginId,
      logger: this.logger.child(`Plugin:${pluginId}`),
      events: this.events,
      registerEntityType: <T extends BaseEntity>(
        entityType: string,
        schema: z.ZodType<T>,
        adapter: EntityAdapter<T>,
      ): void => {
        try {
          const entityRegistry =
            this.registry.resolve<EntityRegistry>("entityRegistry");
          entityRegistry.registerEntityType(entityType, schema, adapter);
          this.logger.info(`Registered entity type: ${entityType}`);
        } catch (error) {
          this.logger.error(
            `Failed to register entity type ${entityType}`,
            error,
          );
          throw new Error(
            `Entity type registration failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
      generateContent: async <T = unknown>(
        templateName: string,
        context?: GenerationContext,
      ): Promise<T> => {
        try {
          // Always namespace the template name with the plugin ID if not already namespaced
          const parts = templateName.split(":");
          const isProperlyNamespaced =
            parts.length >= 2 && parts[0] === pluginId;

          const namespacedTemplateName = isProperlyNamespaced
            ? templateName
            : `${pluginId}:${templateName}`;

          return await contentGenerator.generateContent<T>(
            namespacedTemplateName,
            context,
          );
        } catch (error) {
          this.logger.error("Failed to generate content", error);
          throw new Error(
            `Content generation failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
      parseContent: <T = unknown>(templateName: string, content: string): T => {
        try {
          // Always namespace the template name with the plugin ID if not already namespaced
          const parts = templateName.split(":");
          const isProperlyNamespaced =
            parts.length >= 2 && parts[0] === pluginId;

          const namespacedTemplateName = isProperlyNamespaced
            ? templateName
            : `${pluginId}:${templateName}`;

          return contentGenerator.parseContent<T>(
            namespacedTemplateName,
            content,
          );
        } catch (error) {
          this.logger.error("Failed to parse content", error);
          throw new Error(
            `Content parsing failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
      generateWithRoute: async (
        route: RouteDefinition,
        section: SectionDefinition,
        progressInfo: { current: number; total: number; message: string },
        additionalContext?: Record<string, unknown>,
      ): Promise<string> => {
        try {
          return await contentGenerator.generateWithRoute(
            route,
            section,
            progressInfo,
            additionalContext,
          );
        } catch (error) {
          this.logger.error("Failed to generate content with route", error);
          throw new Error(
            `Route content generation failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
      // Unified template registration - registers template for both content generation and view rendering
      registerTemplate: <T>(name: string, template: Template<T>): void => {
        try {
          // Always prefix with plugin ID to ensure proper namespacing
          const namespacedName = `${pluginId}:${name}`;

          // Delegate to shell which handles both content and view registration
          shell.registerTemplate(namespacedName, template);

          this.logger.debug(`Registered unified template: ${namespacedName}`);
        } catch (error) {
          this.logger.error("Failed to register template", error);
          throw new Error(
            `Template registration failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
      // Convenience method for registering multiple templates at once
      registerTemplates: (templates: Record<string, Template>): void => {
        try {
          Object.entries(templates).forEach(([name, template]) => {
            const namespacedName = `${pluginId}:${name}`;
            shell.registerTemplate(namespacedName, template);
            this.logger.debug(`Registered unified template: ${namespacedName}`);
          });
        } catch (error) {
          this.logger.error("Failed to register templates", error);
          throw new Error(
            `Template registration failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
      registerRoutes: (
        routes: RouteDefinition[],
        options?: { environment?: string },
      ): void => {
        try {
          // Add plugin prefix to template references in routes
          const processedRoutes = routes.map((route) => ({
            ...route,
            sections: route.sections.map((section) => ({
              ...section,
              // Add plugin prefix to template name
              template: section.template
                ? `${pluginId}:${section.template}`
                : section.template,
            })),
          }));

          const routeOptions: { pluginId?: string; environment?: string } = {
            pluginId,
          };
          if (options?.environment !== undefined) {
            routeOptions.environment = options.environment;
          }
          shell.registerRoutes(processedRoutes, routeOptions);
          this.logger.debug(
            `Registered ${routes.length} routes for plugin ${pluginId}`,
          );
        } catch (error) {
          this.logger.error("Failed to register routes", error);
          throw new Error(
            `Route registration failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
      // View template access (replaces direct viewRegistry access)
      getViewTemplate: (name: string) => {
        return viewRegistry.getViewTemplate(name);
      },
      listRoutes: () => {
        return viewRegistry.listRoutes();
      },
      listViewTemplates: () => {
        return viewRegistry.listViewTemplates();
      },
      // Plugin metadata access (scoped to current plugin by default)
      getPluginPackageName: (targetPluginId?: string) => {
        const targetId = targetPluginId || pluginId;
        const pluginInfo = this.plugins.get(targetId);
        return pluginInfo?.plugin.packageName;
      },
      // Entity service access - direct access to well-designed service interface
      entityService,
    };

    // Register the plugin
    try {
      // Call plugin's register method and get capabilities
      const capabilities = await plugin.register(context);

      // Register plugin tools with MCP server
      for (const tool of capabilities.tools) {
        this.logger.debug(`Registering MCP tool: ${tool.name}`);
        // Emit event for Shell to handle
        const toolEvent: PluginToolRegisterEvent = { pluginId, tool };
        this.events.emit(PluginEvent.TOOL_REGISTER, toolEvent);
      }

      // Register plugin resources with MCP server
      for (const resource of capabilities.resources) {
        this.logger.debug(`Registering MCP resource: ${resource.uri}`);
        // Emit event for Shell to handle
        const resourceEvent: PluginResourceRegisterEvent = {
          pluginId,
          resource,
        };
        this.events.emit(PluginEvent.RESOURCE_REGISTER, resourceEvent);
      }

      // Update plugin status
      pluginInfo.status = PluginStatus.INITIALIZED;
      this.logger.info(`Initialized plugin: ${pluginId}`);

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
   * Disable a plugin
   * This only marks the plugin as disabled but doesn't unregister it
   */
  public disablePlugin(id: string): void {
    const pluginInfo = this.plugins.get(id);
    if (!pluginInfo) {
      this.logger.warn(`Cannot disable plugin ${id}: not registered`);
      return;
    }

    this.logger.debug(`Disabling plugin: ${id}`);

    // Update status
    pluginInfo.status = PluginStatus.DISABLED;

    // Emit disabled event
    this.events.emit(PluginEvent.DISABLED, id, pluginInfo.plugin);

    this.logger.info(`Disabled plugin: ${id}`);
  }

  /**
   * Enable a disabled plugin
   */
  public enablePlugin(id: string): void {
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
}
