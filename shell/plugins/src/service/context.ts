import type { CorePluginContext } from "../core/context";
import type { IShell, ContentGenerationConfig } from "../interfaces";
import type {
  IEntityService,
  BaseEntity,
  EntityAdapter,
} from "@brains/entity-service";
import type { JobHandler, BatchOperation } from "@brains/job-queue";
import type { JobOptions } from "@brains/db";
import type { RouteDefinition, ViewTemplate } from "@brains/view-registry";
import type { z } from "zod";
import { createCorePluginContext } from "../core/context";

/**
 * Context interface for service plugins
 * Extends CorePluginContext with entity management, job queuing, and AI generation
 */
export interface ServicePluginContext extends CorePluginContext {
  // Entity service access
  entityService: IEntityService;
  registerEntityType: <T extends BaseEntity>(
    entityType: string,
    schema: z.ZodSchema<T>,
    adapter: EntityAdapter<T>,
  ) => void;

  // AI content generation
  generateContent: <T = unknown>(config: ContentGenerationConfig) => Promise<T>;

  // Job queue functionality (write operations)
  enqueueJob: (
    type: string,
    data: unknown,
    options?: JobOptions,
  ) => Promise<string>;
  enqueueBatch: (
    operations: BatchOperation[],
    options?: JobOptions,
  ) => Promise<string>;
  registerJobHandler: <T = unknown, R = unknown>(
    type: string,
    handler: JobHandler<string, T, R>,
  ) => void;

  // Route registration (web UI)
  registerRoutes: (
    routes: RouteDefinition[],
    options: { environment?: string },
  ) => void;
  listRoutes: () => RouteDefinition[];
  getViewTemplate: (name: string) => ViewTemplate<unknown> | undefined;
  listViewTemplates: () => ViewTemplate<unknown>[];

  // Plugin metadata
  getPluginPackageName: (pluginId: string) => string | undefined;
}

/**
 * Create a ServicePluginContext for a plugin
 */
export function createServicePluginContext(
  shell: IShell,
  pluginId: string,
): ServicePluginContext {
  // Start with core context
  const coreContext = createCorePluginContext(shell, pluginId);

  // Get service-specific components
  const entityService = shell.getEntityService();
  const entityRegistry = shell.getEntityRegistry();
  const jobQueueService = shell.getJobQueueService();
  const viewRegistry = shell.getViewRegistry();

  return {
    ...coreContext,

    // Entity service access
    entityService,
    registerEntityType: (entityType, schema, adapter) => {
      entityRegistry.registerEntityType(entityType, schema, adapter);
    },

    // AI content generation
    generateContent: async (config) => {
      return shell.generateContent(config);
    },

    // Job queue functionality
    enqueueJob: async (type, data, options) => {
      const defaultOptions: JobOptions = {
        source: pluginId,
        metadata: {
          interfaceId: "service",
          userId: "system",
          operationType: "entity_processing" as const,
          pluginId,
        },
        ...options,
      };
      return jobQueueService.enqueue(type, data, defaultOptions, pluginId);
    },
    enqueueBatch: async (operations, options) => {
      const defaultOptions: JobOptions = {
        source: pluginId,
        metadata: {
          interfaceId: "service",
          userId: "system",
          operationType: "batch_processing" as const,
          pluginId,
        },
        ...options,
      };
      return shell.enqueueBatch(operations, defaultOptions, pluginId);
    },
    registerJobHandler: (type, handler) => {
      jobQueueService.registerHandler(type, handler, pluginId);
    },

    // Route registration
    registerRoutes: (routes, options) => {
      shell.registerRoutes(routes, { pluginId, ...options });
    },
    listRoutes: () => {
      return viewRegistry.listRoutes();
    },
    getViewTemplate: (name: string) => {
      return viewRegistry.getViewTemplate(name);
    },
    listViewTemplates: () => {
      return viewRegistry.listViewTemplates();
    },

    // Plugin metadata
    getPluginPackageName: (targetPluginId: string) => {
      return shell.getPluginPackageName(targetPluginId);
    },
  };
}
