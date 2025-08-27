import type { CorePluginContext } from "../core/context";
import type { IShell, ContentGenerationConfig } from "../interfaces";
import type {
  IEntityService,
  BaseEntity,
  EntityAdapter,
} from "@brains/entity-service";
import type { ResolutionOptions } from "@brains/content-service";
import { TemplateCapabilities } from "@brains/templates";
import type { JobHandler, BatchOperation } from "@brains/job-queue";
import type { JobOptions } from "@brains/job-queue";
import { createId } from "@brains/utils";
import type {
  RouteDefinition,
  ViewTemplate,
  RenderService,
} from "@brains/render-service";
import type {
  Conversation,
  Message,
  GetMessagesOptions,
} from "@brains/conversation-service";
import type { DataSource } from "@brains/datasource";
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

  // DataSource registration
  registerDataSource: (dataSource: DataSource) => void;

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
  getRenderService: () => RenderService;

  // Content resolution helper
  resolveContent: <T = unknown>(
    templateName: string,
    options?: ResolutionOptions,
  ) => Promise<T | null>;

  // Template capability checking
  getTemplateCapabilities: (templateName: string) => {
    canGenerate: boolean;
    canFetch: boolean;
    canRender: boolean;
    isStaticOnly: boolean;
  } | null;

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
  const renderService = shell.getRenderService();
  const routeRegistry = shell.getRouteRegistry();
  const dataSourceRegistry = shell.getDataSourceRegistry();

  return {
    ...coreContext,

    // Entity service access
    entityService,
    registerEntityType: (entityType, schema, adapter) => {
      entityRegistry.registerEntityType(entityType, schema, adapter);
    },

    // DataSource registration
    registerDataSource: (dataSource: DataSource) => {
      // Just register the DataSource directly - the register method handles prefixing
      dataSourceRegistry.register(dataSource);
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
      return routeRegistry.list();
    },
    getViewTemplate: (name: string) => {
      return renderService.get(name);
    },
    listViewTemplates: () => {
      return renderService.list();
    },
    getRenderService: () => {
      return renderService;
    },

    // Content resolution helper
    resolveContent: async (templateName, options) => {
      const contentService = shell.getContentService();
      return contentService.resolveContent(templateName, options, pluginId);
    },

    // Template capability checking
    getTemplateCapabilities: (templateName) => {
      // Apply plugin scoping if not already scoped
      const scopedTemplateName = templateName.includes(":")
        ? templateName
        : `${pluginId}:${templateName}`;

      // Use the getTemplate method from shell which already handles registry access
      const template = shell.getTemplate(scopedTemplateName);
      if (!template) {
        return null;
      }

      return TemplateCapabilities.getCapabilities(template);
    },

    // Plugin metadata
    getPluginPackageName: (targetPluginId: string) => {
      return shell.getPluginPackageName(targetPluginId);
    },
  };
}
