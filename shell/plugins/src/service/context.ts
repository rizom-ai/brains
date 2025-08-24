import type { CorePluginContext } from "../core/context";
import type { IShell, ContentGenerationConfig } from "../interfaces";
import type {
  IEntityService,
  BaseEntity,
  EntityAdapter,
} from "@brains/entity-service";
import type { JobHandler, BatchOperation } from "@brains/job-queue";
import type { JobOptions } from "@brains/job-queue";
import { createId } from "@brains/utils";
import type { RouteDefinition, ViewTemplate } from "@brains/view-registry";
import type {
  Conversation,
  Message,
  GetMessagesOptions,
} from "@brains/conversation-service";
import type { IContentProvider } from "@brains/content-service";
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

  // Content provider registration
  registerContentProvider: (provider: IContentProvider) => void;

  // AI content generation
  generateContent: <T = unknown>(config: ContentGenerationConfig) => Promise<T>;

  // Content formatting and parsing using template formatter
  formatContent: <T = unknown>(templateName: string, data: T) => string;
  parseContent: <T = unknown>(templateName: string, content: string) => T;

  // Conversation service helpers
  searchConversations: (query: string) => Promise<Conversation[]>;
  getMessages: (
    conversationId: string,
    options?: GetMessagesOptions,
  ) => Promise<Message[]>;

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

    // Content provider registration
    registerContentProvider: (provider) => {
      const contentService = shell.getContentService();
      contentService.registerProvider(provider);
    },

    // AI content generation
    generateContent: async (config) => {
      return shell.generateContent(config);
    },

    // Content formatting and parsing using template formatter
    formatContent: (templateName, data) => {
      const contentService = shell.getContentService();
      return contentService.formatContent(templateName, data, { pluginId });
    },
    parseContent: (templateName, content) => {
      const contentService = shell.getContentService();
      return contentService.parseContent(templateName, content, pluginId);
    },

    // Conversation service helpers
    searchConversations: async (query: string) => {
      const conversationService = shell.getConversationService();
      return conversationService.searchConversations(query);
    },
    getMessages: async (
      conversationId: string,
      options?: GetMessagesOptions,
    ) => {
      const conversationService = shell.getConversationService();
      return conversationService.getMessages(conversationId, options);
    },

    // Job queue functionality
    enqueueJob: async (type, data, options) => {
      const rootJobId = options?.metadata?.rootJobId || createId();
      const defaultOptions: JobOptions = {
        source: pluginId,
        metadata: {
          rootJobId,
          operationType: "data_processing" as const,
          pluginId,
          ...options?.metadata,
        },
        ...options,
      };
      // Add plugin scope unless already scoped (contains ':')
      const scopedType = type.includes(":") ? type : `${pluginId}:${type}`;
      return jobQueueService.enqueue(scopedType, data, defaultOptions);
    },
    enqueueBatch: async (operations, options) => {
      // Generate batch ID first to use as rootJobId for consistent tracking
      const batchId = createId();
      // Add plugin scope to operation types unless already scoped
      const scopedOperations = operations.map((op) => ({
        ...op,
        type: op.type.includes(":") ? op.type : `${pluginId}:${op.type}`,
      }));
      await shell.enqueueBatch(
        scopedOperations,
        {
          source: pluginId,
          metadata: {
            operationType: "batch_processing" as const,
            pluginId,
            rootJobId: batchId, // Use generated batch ID as rootJobId
            ...options?.metadata,
          },
          ...options,
        },
        batchId,
        pluginId,
      );

      return batchId;
    },
    registerJobHandler: (type, handler) => {
      // Add plugin scope to the type for explicit registration
      const scopedType = `${pluginId}:${type}`;
      jobQueueService.registerHandler(scopedType, handler, pluginId);
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
