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
import type { JobOptions, JobContext, JobQueue } from "@brains/db";
import { BatchJobManager } from "@brains/job-queue";
import {
  type BatchJobStatus,
  type JobStatusType,
  type BatchOperation,
} from "@brains/job-queue";
import {
  ContentGenerationError,
  JobOperationError,
  createBatchId,
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
  private pluginHandlers = new Map<string, Map<string, JobHandler>>();

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
    const jobQueueService = shell.getJobQueueService();

    // Create plugin context
    const context: PluginContext = {
      pluginId,
      logger: this.logger.child(`Plugin:${pluginId}`),
      sendMessage: async <T = unknown, R = unknown>(
        type: string,
        payload: T,
      ): Promise<{ success: boolean; data?: R; error?: string }> => {
        const result = await messageBus.send<T, R>(type, payload, pluginId);

        // Handle noop case
        if ("noop" in result) {
          return { success: true };
        }

        // Handle normal response
        const response: { success: boolean; data?: R; error?: string } = {
          success: "success" in result ? result.success : true,
        };
        if ("data" in result && result.data !== undefined) {
          response.data = result.data;
        }
        if ("error" in result && result.error !== undefined) {
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
        const entityRegistry =
          this.serviceRegistry.resolve<EntityRegistry>("entityRegistry");
        entityRegistry.registerEntityType(entityType, schema, adapter);
        this.logger.info(`Registered entity type: ${entityType}`);
      },
      generateContent: async <T = unknown>(
        config: ContentGenerationConfig,
      ): Promise<T> => {
        try {
          const namespacedTemplateName = this.ensureNamespaced(
            config.templateName,
            pluginId,
          );

          // Always route through Shell.generateContent() for consistent permission checking
          return await shell.generateContent<T>({
            ...config,
            templateName: namespacedTemplateName,
          });
        } catch (error) {
          this.logger.error("Failed to generate content", error);
          throw new ContentGenerationError(
            config.templateName,
            "generation",
            error,
          );
        }
      },
      formatContent: <T = unknown>(
        templateName: string,
        data: T,
        options?: { truncate?: number },
      ): string => {
        const namespacedTemplateName = this.ensureNamespaced(
          templateName,
          pluginId,
        );

        return contentGenerator.formatContent<T>(
          namespacedTemplateName,
          data,
          options,
        );
      },
      parseContent: <T = unknown>(templateName: string, content: string): T => {
        const namespacedTemplateName = this.ensureNamespaced(
          templateName,
          pluginId,
        );
        return contentGenerator.parseContent<T>(namespacedTemplateName, content);
      },
      // Unified template registration - registers template for both content generation and view rendering
      registerTemplate: <T>(name: string, template: Template<T>): void => {
        // Always prefix with plugin ID to ensure proper namespacing
        const namespacedName = `${pluginId}:${name}`;

        // Delegate to shell which handles both content and view registration
        shell.registerTemplate(namespacedName, template);

        this.logger.debug(`Registered unified template: ${namespacedName}`);
      },
      // Convenience method for registering multiple templates at once
      registerTemplates: (templates: Record<string, Template>): void => {
        Object.entries(templates).forEach(([name, template]) => {
          const namespacedName = `${pluginId}:${name}`;
          shell.registerTemplate(namespacedName, template);
          this.logger.debug(`Registered unified template: ${namespacedName}`);
        });
      },
      registerRoutes: (
        routes: RouteDefinition[],
        options?: { environment?: string },
      ): void => {
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
      getJobStatus: async (
        jobId: string,
      ): Promise<{
        status: JobStatusType;
        result?: unknown;
        error?: string;
      } | null> => {
        const job = await jobQueueService.getStatus(jobId);
        if (!job) {
          return null;
        }

        // Transform to plugin context format
        const result: {
          status: JobStatusType;
          result?: unknown;
          error?: string;
        } = {
          status: job.status,
        };

        if (job.result !== undefined && job.result !== null) {
          result.result = job.result;
        }

        if (job.lastError) {
          result.error = job.lastError;
        }

        return result;
      },

      // Batch operations (required)
      enqueueBatch: async (
        operations: BatchOperation[],
        options: JobOptions,
      ): Promise<string> => {
        try {
          if (operations.length === 0) {
            throw new Error("Cannot enqueue empty batch");
          }

          const batchId = createBatchId();
          const jobIds: string[] = [];

          // Enqueue each operation using existing enqueueJob method (which handles scoping)
          for (const operation of operations) {
            const jobOptions: JobOptions = {
              ...options,
              metadata: {
                ...options.metadata,
                operationTarget: operation.entityId ?? operation.type,
              },
            };

            const jobId = await context.enqueueJob(
              operation.type,
              operation.options ?? {},
              jobOptions,
            );
            jobIds.push(jobId);
          }

          // Register the batch with BatchJobManager for status tracking
          const batchJobManager = BatchJobManager.getInstance(
            jobQueueService,
            this.logger,
          );

          batchJobManager.registerBatch(
            batchId,
            jobIds,
            operations,
            options.source,
            options.metadata,
          );

          this.logger.debug("Enqueued batch operation", {
            batchId,
            operationCount: operations.length,
            jobIds,
            pluginId,
          });

          return batchId;
        } catch (error) {
          this.logger.error("Failed to enqueue batch operation", error);
          throw new JobOperationError("enqueueBatch", error, {
            operationCount: operations.length,
            pluginId,
          });
        }
      },

      getBatchStatus: async (
        batchId: string,
      ): Promise<BatchJobStatus | null> => {
        try {
          // Use BatchJobManager to get batch status
          const batchJobManager = BatchJobManager.getInstance(
            jobQueueService,
            this.logger,
          );

          return await batchJobManager.getBatchStatus(batchId);
        } catch (error) {
          this.logger.error("Failed to get batch status", error);
          throw new JobOperationError("getBatchStatus", error, { batchId });
        }
      },

      // Get active jobs (for monitoring)
      getActiveJobs: async (types?: string[]): Promise<JobQueue[]> => {
        return jobQueueService.getActiveJobs(types);
      },

      // Get active batches (for monitoring)
      getActiveBatches: async (): Promise<
        Array<{
          batchId: string;
          status: BatchJobStatus;
          metadata: JobContext;
        }>
      > => {
        const batchJobManager = BatchJobManager.getInstance(
          jobQueueService,
          this.logger,
        );
        const batches = await batchJobManager.getActiveBatches();

        // Transform the nested metadata structure to match the expected interface
        return batches.map((batch) => ({
          batchId: batch.batchId,
          status: batch.status,
          metadata: batch.metadata.metadata, // Extract the nested JobContext
        }));
      },

      // Job handler registration (for plugins that process jobs)
      registerJobHandler: (type: string, handler: JobHandler): void => {
        // Register with job queue - let the service handle scoping
        jobQueueService.registerHandler(type, handler, pluginId);

        // Track for cleanup using the same scoping logic as the service
        const scopedType = `${pluginId}:${type}`;
        if (!this.pluginHandlers.has(pluginId)) {
          this.pluginHandlers.set(pluginId, new Map());
        }
        const handlers = this.pluginHandlers.get(pluginId);
        if (handlers) {
          handlers.set(scopedType, handler);
        }

        this.logger.debug(`Registered job handler ${scopedType}`);
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
    const handlers = this.pluginHandlers.get(pluginId);
    if (handlers) {
      try {
        const shell = this.serviceRegistry.resolve<Shell>("shell");
        const jobQueueService = shell.getJobQueueService();

        for (const [type, _handler] of handlers) {
          jobQueueService.unregisterHandler(type);
          this.logger.debug(`Unregistered handler for job type: ${type}`);
        }
      } catch (error) {
        this.logger.warn(
          "Could not unregister job handlers during cleanup",
          error,
        );
      }
      this.pluginHandlers.delete(pluginId);
    }
  }
}
