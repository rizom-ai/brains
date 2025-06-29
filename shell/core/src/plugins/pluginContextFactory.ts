import type { ServiceRegistry } from "@brains/service-registry";
import type { Logger } from "@brains/utils";
import type {
  PluginContext,
  BaseEntity,
  GenerationContext,
  Template,
  MessageHandler,
  Daemon,
} from "@brains/types";
import { DaemonRegistry } from "@brains/daemon-registry";
import type { RouteDefinition, SectionDefinition } from "@brains/view-registry";
import type { EntityAdapter } from "@brains/base-entity";
import type { Shell } from "../shell";
import type { EntityRegistry } from "@brains/entity-service";
import {
  EntityRegistrationError,
  ContentGenerationError,
  TemplateRegistrationError,
  RouteRegistrationError,
} from "@brains/utils";
import type { z } from "zod";

/**
 * Factory for creating PluginContext instances
 * Extracted from PluginManager to improve maintainability
 */
export class PluginContextFactory {
  private static instance: PluginContextFactory | null = null;

  private serviceRegistry: ServiceRegistry;
  private logger: Logger;
  private plugins: Map<string, { plugin: { packageName?: string } }>;
  private daemonRegistry: DaemonRegistry;

  /**
   * Get the singleton instance of PluginContextFactory
   */
  public static getInstance(
    serviceRegistry: ServiceRegistry,
    logger: Logger,
    plugins: Map<string, { plugin: { packageName?: string } }>,
  ): PluginContextFactory {
    PluginContextFactory.instance ??= new PluginContextFactory(
      serviceRegistry,
      logger,
      plugins,
    );
    return PluginContextFactory.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    PluginContextFactory.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    serviceRegistry: ServiceRegistry,
    logger: Logger,
    plugins: Map<string, { plugin: { packageName?: string } }>,
  ): PluginContextFactory {
    return new PluginContextFactory(serviceRegistry, logger, plugins);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    serviceRegistry: ServiceRegistry,
    logger: Logger,
    plugins: Map<string, { plugin: { packageName?: string } }>,
  ) {
    this.serviceRegistry = serviceRegistry;
    this.logger = logger.child("PluginContextFactory");
    this.plugins = plugins;
    this.daemonRegistry = DaemonRegistry.getInstance(logger);
  }

  /**
   * Ensure template name is properly namespaced with plugin ID
   */
  private ensureNamespaced(templateName: string, pluginId: string): string {
    const parts = templateName.split(":");
    // If already namespaced (has a prefix), use as-is
    const isAlreadyNamespaced = parts.length >= 2;
    
    return isAlreadyNamespaced ? templateName : `${pluginId}:${templateName}`;
  }

  /**
   * Create a plugin context for the specified plugin
   */
  public createPluginContext(pluginId: string): PluginContext {
    // Get services from shell - shell should always be available
    const shell = this.serviceRegistry.resolve<Shell>("shell");
    const entityService = shell.getEntityService();
    const contentGenerator = shell.getContentGenerator();
    const viewRegistry = shell.getViewRegistry();
    const messageBus = shell.getMessageBus();

    // Create plugin context
    const context: PluginContext = {
      pluginId,
      logger: this.logger.child(`Plugin:${pluginId}`),
      sendMessage: async <T = unknown, R = unknown>(
        type: string,
        payload: T,
      ): Promise<{ success: boolean; data?: R; error?: string }> => {
        const result = await messageBus.send<T, R>(type, payload, pluginId);
        const response: { success: boolean; data?: R; error?: string } = {
          success: result.success,
        };
        if (result.data !== undefined) {
          response.data = result.data;
        }
        if (result.error !== undefined) {
          response.error = result.error;
        }
        return response;
      },
      subscribe: <T = unknown, R = unknown>(
        type: string,
        handler: MessageHandler<T, R>,
      ): (() => void) => {
        return messageBus.subscribe(type, handler);
      },
      registerEntityType: <T extends BaseEntity>(
        entityType: string,
        schema: z.ZodType<T>,
        adapter: EntityAdapter<T>,
      ): void => {
        try {
          const entityRegistry =
            this.serviceRegistry.resolve<EntityRegistry>("entityRegistry");
          entityRegistry.registerEntityType(entityType, schema, adapter);
          this.logger.info(`Registered entity type: ${entityType}`);
        } catch (error) {
          this.logger.error(
            `Failed to register entity type ${entityType}`,
            error,
          );
          throw new EntityRegistrationError(entityType, error);
        }
      },
      generateContent: async <T = unknown>(
        templateName: string,
        context?: GenerationContext,
      ): Promise<T> => {
        try {
          const namespacedTemplateName = this.ensureNamespaced(templateName, pluginId);
          
          return await contentGenerator.generateContent<T>(
            namespacedTemplateName,
            context,
          );
        } catch (error) {
          this.logger.error("Failed to generate content", error);
          throw new ContentGenerationError(templateName, "generation", error);
        }
      },
      parseContent: <T = unknown>(templateName: string, content: string): T => {
        try {
          const namespacedTemplateName = this.ensureNamespaced(templateName, pluginId);
          
          return contentGenerator.parseContent<T>(
            namespacedTemplateName,
            content,
          );
        } catch (error) {
          this.logger.error("Failed to parse content", error);
          throw new ContentGenerationError(templateName, "parsing", error);
        }
      },
      formatContent: <T = unknown>(templateName: string, data: T): string => {
        try {
          const namespacedTemplateName = this.ensureNamespaced(templateName, pluginId);
          
          return contentGenerator.formatContent<T>(
            namespacedTemplateName,
            data,
          );
        } catch (error) {
          this.logger.error("Failed to format content", error);
          throw new ContentGenerationError(templateName, "formatting", error);
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
          throw new ContentGenerationError(route.id, "generation", error, {
            routeId: route.id,
            sectionId: section.id,
          });
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
          throw new TemplateRegistrationError(name, pluginId, error);
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
          throw new TemplateRegistrationError("batch", pluginId, error);
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
          throw new RouteRegistrationError("batch", error, pluginId);
        }
      },
      // View template access (replaces direct viewRegistry access)
      getViewTemplate: (name: string) => {
        return viewRegistry.getViewTemplate(name);
      },

      // Route finding abstraction
      getRoute: (path: string) => {
        return viewRegistry.getRoute(path);
      },
      findRoute: (filter: {
        id?: string;
        pluginId?: string;
        pathPattern?: string;
      }) => {
        return viewRegistry.findRoute(filter);
      },
      listRoutes: () => {
        return viewRegistry.listRoutes();
      },
      validateRoute: (route: RouteDefinition) => {
        return viewRegistry.validateRoute(route);
      },

      // Template finding abstraction
      findViewTemplate: (filter: {
        name?: string;
        pluginId?: string;
        namePattern?: string;
      }) => {
        return viewRegistry.findViewTemplate(filter);
      },
      listViewTemplates: () => {
        return viewRegistry.listViewTemplates();
      },
      validateTemplate: (templateName: string, content: unknown) => {
        return viewRegistry.validateViewTemplate(templateName, content);
      },
      // Plugin metadata access (scoped to current plugin by default)
      getPluginPackageName: (targetPluginId?: string) => {
        const targetId = targetPluginId ?? pluginId;
        const pluginInfo = this.plugins.get(targetId);
        return pluginInfo?.plugin.packageName;
      },
      // Entity service access - clean interface for plugin usage
      entityService,

      // Interface plugin capabilities
      registerDaemon: (name: string, daemon: Daemon): void => {
        try {
          // Ensure daemon name is unique by prefixing with plugin ID
          const daemonName = `${pluginId}:${name}`;
          this.daemonRegistry.register(daemonName, daemon, pluginId);
          this.logger.debug(
            `Registered daemon: ${daemonName} for plugin: ${pluginId}`,
          );
        } catch (error) {
          this.logger.error(`Failed to register daemon: ${name}`, error);
          throw error;
        }
      },
    };

    return context;
  }
}
