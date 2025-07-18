import type { EntityService } from "@brains/entity-service";
import type { BaseEntity, EntityAdapter } from "@brains/types";
import type { z } from "zod";
import type { ContentGenerationConfig } from "@brains/plugin-utils";
import type { JobOptions, JobQueue } from "@brains/db";
import type {
  JobHandler,
  BatchOperation,
  BatchJobStatus,
  Batch,
} from "@brains/job-queue";
import type { RouteDefinition, ViewTemplate } from "@brains/view-registry";
import type { ServicePlugin, ServicePluginContext } from "../types";
import {
  createCorePluginContext,
  type CoreServices,
} from "./corePluginContext";

// Extended services for service plugins
export interface ServiceServices extends CoreServices {
  entityService: EntityService;
  entityRegistry: {
    registerEntityType<T extends BaseEntity>(
      entityType: string,
      schema: z.ZodSchema<T>,
      adapter: EntityAdapter<T>,
    ): void;
  };
  // Shell reference for content generation and route registration
  shell: {
    generateContent: <T = unknown>(
      config: ContentGenerationConfig,
    ) => Promise<T>;
    registerRoutes: (
      routes: RouteDefinition[],
      options?: { pluginId?: string; environment?: string },
    ) => void;
  };
  // Job queue service
  jobQueueService: {
    enqueue: (
      type: string,
      data: unknown,
      options: JobOptions,
      pluginId?: string,
    ) => Promise<string>;
    getStatus: (jobId: string) => Promise<JobQueue | null>;
    getActiveJobs: (types?: string[]) => Promise<JobQueue[]>;
    registerHandler: (
      type: string,
      handler: JobHandler,
      pluginId?: string,
    ) => void;
  };
  // Batch job manager
  batchJobManager: {
    enqueueBatch: (
      operations: BatchOperation[],
      options: JobOptions,
      pluginId?: string,
    ) => Promise<string>;
    getBatchStatus: (batchId: string) => Promise<BatchJobStatus | null>;
    getActiveBatches: () => Promise<Batch[]>;
  };
  // View registry
  viewRegistry: {
    getViewTemplate: (name: string) => ViewTemplate | undefined;
    getRoute: (path: string) => RouteDefinition | undefined;
    listRoutes: () => RouteDefinition[];
    listViewTemplates: () => ViewTemplate[];
  };
  // Plugin metadata (for component generation/hydration)
  pluginManager: {
    getPluginPackageName: (pluginId: string) => string | undefined;
  };
}

export function createServicePluginContext(
  plugin: ServicePlugin,
  services: ServiceServices,
): ServicePluginContext {
  // Get the core context
  const coreContext = createCorePluginContext(plugin, services);

  return {
    // Spread all core context properties
    ...coreContext,

    // Add content generation (AI-powered) - delegates to Shell
    generateContent: <T = unknown>(
      config: ContentGenerationConfig,
    ): Promise<T> => {
      return services.shell.generateContent<T>(config);
    },

    // Add entity-specific capabilities
    entityService: services.entityService,

    registerEntityType: <T extends BaseEntity>(
      entityType: string,
      schema: z.ZodSchema<T>,
      adapter: EntityAdapter<T>,
    ): void => {
      services.entityRegistry.registerEntityType(entityType, schema, adapter);
      coreContext.logger.debug(`Registered entity type: ${entityType}`);
    },

    // Job queue operations
    enqueueJob: (
      type: string,
      data: unknown,
      options: JobOptions,
    ): Promise<string> => {
      return services.jobQueueService.enqueue(type, data, options, plugin.id);
    },

    getJobStatus: (jobId: string): Promise<JobQueue | null> => {
      return services.jobQueueService.getStatus(jobId);
    },

    enqueueBatch: (
      operations: BatchOperation[],
      options: JobOptions,
    ): Promise<string> => {
      return services.batchJobManager.enqueueBatch(
        operations,
        options,
        plugin.id,
      );
    },

    getBatchStatus: (batchId: string): Promise<BatchJobStatus | null> => {
      return services.batchJobManager.getBatchStatus(batchId);
    },

    getActiveJobs: (types?: string[]): Promise<JobQueue[]> => {
      return services.jobQueueService.getActiveJobs(types);
    },

    getActiveBatches: (): Promise<Batch[]> => {
      return services.batchJobManager.getActiveBatches();
    },

    registerJobHandler: (type: string, handler: JobHandler): void => {
      services.jobQueueService.registerHandler(type, handler, plugin.id);
      coreContext.logger.debug(`Registered job handler for type: ${type}`);
    },

    // Route and view registration
    registerRoutes: (
      routes: RouteDefinition[],
      options?: { environment?: string },
    ): void => {
      services.shell.registerRoutes(routes, {
        pluginId: plugin.id,
        ...options,
      });
      coreContext.logger.debug(`Registered ${routes.length} routes`);
    },

    getViewTemplate: (name: string): ViewTemplate | undefined => {
      return services.viewRegistry.getViewTemplate(name);
    },

    getRoute: (path: string): RouteDefinition | undefined => {
      return services.viewRegistry.getRoute(path);
    },

    listRoutes: (): RouteDefinition[] => {
      return services.viewRegistry.listRoutes();
    },

    listViewTemplates: (): ViewTemplate[] => {
      return services.viewRegistry.listViewTemplates();
    },

    // Plugin metadata
    getPluginPackageName: (targetPluginId?: string): string | undefined => {
      const targetId = targetPluginId ?? plugin.id;
      return services.pluginManager.getPluginPackageName(targetId);
    },
  };
}
