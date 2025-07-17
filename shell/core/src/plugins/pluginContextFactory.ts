import type { ServiceRegistry } from "@brains/service-registry";
import type { Logger } from "@brains/utils";
import type { BaseEntity, Template } from "@brains/types";
import type { MessageHandler } from "@brains/messaging-service";
import type {
  PluginContext,
  Daemon,
  ContentGenerationConfig,
} from "@brains/plugin-utils";
import type { Command } from "@brains/message-interface";
import { DaemonRegistry } from "@brains/daemon-registry";
import type { RouteDefinition } from "@brains/view-registry";
import type { EntityAdapter } from "@brains/types";
import type { Shell } from "../shell";
import type { EntityRegistry } from "@brains/entity-service";
import type { JobHandler } from "@brains/job-queue";
import type { JobOptions, JobQueue } from "@brains/db";
import { BatchJobManager } from "@brains/job-queue";
import {
  type BatchJobStatus,
  type BatchOperation,
  type Batch,
} from "@brains/job-queue";
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
   * Create a plugin context for the specified plugin
   */
  public createPluginContext(pluginId: string): PluginContext {
    // Get services from shell - shell should always be available
    const shell = this.serviceRegistry.resolve<Shell>("shell");
    const entityService = shell.getEntityService();
    const contentGenerator = shell.getContentGenerator();
    const viewRegistry = shell.getViewRegistry();
    const messageBus = shell.getMessageBus();
    const jobQueueService = shell.getJobQueueService();

    // Create plugin context
    const context: PluginContext = {
      pluginId,
      logger: this.logger.child(`Plugin:${pluginId}`),
      sendMessage: async <T = unknown, R = unknown>(
        type: string,
        payload: T,
      ) => {
        return messageBus.send<T, R>(type, payload, pluginId);
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
        const entityRegistry =
          this.serviceRegistry.resolve<EntityRegistry>("entityRegistry");
        entityRegistry.registerEntityType(entityType, schema, adapter);
        this.logger.info(`Registered entity type: ${entityType}`);
      },
      generateContent: async <T = unknown>(
        config: ContentGenerationConfig,
      ): Promise<T> => {
        return contentGenerator.generateContent<T>(
          config.templateName,
          config,
          pluginId,
        );
      },
      formatContent: <T = unknown>(
        templateName: string,
        data: T,
        options?: { truncate?: number },
      ): string => {
        return contentGenerator.formatContent<T>(templateName, data, {
          ...options,
          pluginId,
        });
      },
      parseContent: <T = unknown>(templateName: string, content: string): T => {
        return contentGenerator.parseContent<T>(
          templateName,
          content,
          pluginId,
        );
      },
      // Register templates - handles both single and multiple templates
      registerTemplates: (templates: Record<string, Template>): void => {
        shell.registerTemplates(templates, pluginId);
      },
      registerRoutes: (
        routes: RouteDefinition[],
        options?: { environment?: string },
      ): void => {
        shell.registerRoutes(routes, { pluginId, ...options });
      },
      // View template access (replaces direct viewRegistry access)
      getViewTemplate: (name: string) => {
        return viewRegistry.getViewTemplate(name);
      },

      // Route finding abstraction
      getRoute: (path: string) => {
        return viewRegistry.getRoute(path);
      },
      listRoutes: () => {
        return viewRegistry.listRoutes();
      },

      // Template finding abstraction
      listViewTemplates: () => {
        return viewRegistry.listViewTemplates();
      },
      // Plugin metadata access (scoped to current plugin by default)
      getPluginPackageName: (targetPluginId?: string) => {
        const targetId = targetPluginId ?? pluginId;
        const pluginInfo = this.plugins.get(targetId);
        return pluginInfo?.plugin.packageName;
      },
      // Entity service access - clean interface for plugin usage
      entityService,

      // Generic job queue access (required)
      enqueueJob: async (
        type: string,
        data: unknown,
        options: JobOptions,
      ): Promise<string> => {
        return jobQueueService.enqueue(type, data, options, pluginId);
      },

      // Get job status
      getJobStatus: async (jobId: string): Promise<JobQueue | null> => {
        return jobQueueService.getStatus(jobId);
      },

      // Batch operations (required)
      enqueueBatch: async (
        operations: BatchOperation[],
        options: JobOptions,
      ): Promise<string> => {
        const batchJobManager = BatchJobManager.getInstance(
          jobQueueService,
          this.logger,
        );
        return batchJobManager.enqueueBatch(operations, options, pluginId);
      },

      getBatchStatus: async (
        batchId: string,
      ): Promise<BatchJobStatus | null> => {
        const batchJobManager = BatchJobManager.getInstance(
          jobQueueService,
          this.logger,
        );
        return batchJobManager.getBatchStatus(batchId);
      },

      // Get active jobs (for monitoring)
      getActiveJobs: async (types?: string[]): Promise<JobQueue[]> => {
        return jobQueueService.getActiveJobs(types);
      },

      // Get active batches (for monitoring)
      getActiveBatches: async (): Promise<Batch[]> => {
        const batchJobManager = BatchJobManager.getInstance(
          jobQueueService,
          this.logger,
        );
        return batchJobManager.getActiveBatches();
      },

      // Job handler registration (for plugins that process jobs)
      registerJobHandler: (type: string, handler: JobHandler): void => {
        jobQueueService.registerHandler(type, handler, pluginId);
      },

      // Interface plugin capabilities
      registerDaemon: (name: string, daemon: Daemon): void => {
        // Ensure daemon name is unique by prefixing with plugin ID
        const daemonName = `${pluginId}:${name}`;
        this.daemonRegistry.register(daemonName, daemon, pluginId);
        this.logger.debug(
          `Registered daemon: ${daemonName} for plugin: ${pluginId}`,
        );
      },

      // Command discovery - get commands from the central registry
      getAllCommands: async (): Promise<Command[]> => {
        try {
          const commandRegistry = shell.getCommandRegistry();
          const allCommands = commandRegistry.getAllCommands();

          this.logger.debug(
            `Retrieved ${allCommands.length} commands from CommandRegistry`,
          );
          return allCommands;
        } catch (error) {
          this.logger.error("Error retrieving commands from registry", error);
          return [];
        }
      },
    };

    return context;
  }

  /**
   * Clean up handlers when plugin is unloaded
   */
  public cleanupPlugin(pluginId: string): void {
    try {
      const shell = this.serviceRegistry.resolve<Shell>("shell");
      const jobQueueService = shell.getJobQueueService();
      jobQueueService.unregisterPluginHandlers(pluginId);
    } catch (error) {
      this.logger.warn(
        "Could not unregister job handlers during cleanup",
        error,
      );
    }
  }
}
