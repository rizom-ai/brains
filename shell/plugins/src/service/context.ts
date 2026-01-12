import type { CorePluginContext } from "../core/context";
import type {
  IShell,
  ContentGenerationConfig,
  EvalHandler,
} from "../interfaces";
import type {
  ImageGenerationOptions,
  ImageGenerationResult,
} from "@brains/ai-service";
import { createEnqueueJobFn, type EnqueueJobFn } from "../shared/job-helpers";
import type {
  IEntityService,
  BaseEntity,
  EntityAdapter,
  EntityTypeConfig,
} from "@brains/entity-service";
import type { ResolutionOptions } from "@brains/content-service";
import { TemplateCapabilities } from "@brains/templates";
import type {
  JobHandler,
  BatchOperation,
  JobInfo,
  JobOptions,
} from "@brains/job-queue";
import { createId } from "@brains/utils";
import type { ViewTemplate, RenderService } from "@brains/render-service";
import type {
  Conversation,
  Message,
  GetMessagesOptions,
} from "@brains/conversation-service";
import type { DataSource } from "@brains/datasource";
import type { z } from "@brains/utils";
import { createCorePluginContext } from "../core/context";

/**
 * Context interface for service plugins
 * Extends CorePluginContext with entity management, job queuing, and AI generation
 *
 * ## Method Naming Conventions
 * - Properties: Direct access to services/values (e.g., `entityService`, `dataDir`)
 * - `get*`: Retrieve existing data (e.g., `getAdapter`, `getJobStatus`)
 * - `list*`: Retrieve collections (e.g., `listViewTemplates`)
 * - `register*`: Register handlers/types (e.g., `registerEntityType`, `registerJobHandler`)
 * - Action verbs: Mutations and operations (e.g., `enqueueJob`, `generateContent`)
 */
export interface ServicePluginContext extends CorePluginContext {
  // ============================================================================
  // Entity Management
  // ============================================================================

  /** Full entity service with write operations */
  readonly entityService: IEntityService;

  /** Register a new entity type with schema and adapter */
  registerEntityType: <T extends BaseEntity>(
    entityType: string,
    schema: z.ZodSchema<T>,
    adapter: EntityAdapter<T>,
    config?: EntityTypeConfig,
  ) => void;

  /** Get the adapter for an entity type */
  getAdapter: <T extends BaseEntity>(
    entityType: string,
  ) => EntityAdapter<T> | undefined;

  /** Update an existing entity */
  updateEntity: <T extends BaseEntity>(
    entity: T,
  ) => Promise<{ entityId: string; jobId: string }>;

  // ============================================================================
  // Data Sources
  // ============================================================================

  /** Register a data source for dynamic content */
  registerDataSource: (dataSource: DataSource) => void;

  // ============================================================================
  // AI Generation
  // ============================================================================

  /** Generate content using AI with template */
  generateContent: <T = unknown>(config: ContentGenerationConfig) => Promise<T>;

  /** Generate an image using AI (requires OPENAI_API_KEY) */
  generateImage: (
    prompt: string,
    options?: ImageGenerationOptions,
  ) => Promise<ImageGenerationResult>;

  /** Check if image generation is available */
  canGenerateImages: () => boolean;

  // ============================================================================
  // Content Formatting
  // ============================================================================

  /** Format data using a template formatter */
  formatContent: <T = unknown>(templateName: string, data: T) => string;

  /** Parse content using a template parser */
  parseContent: <T = unknown>(templateName: string, content: string) => T;

  /** Resolve content from a template (may fetch or generate) */
  resolveContent: <T = unknown>(
    templateName: string,
    options?: ResolutionOptions,
  ) => Promise<T | null>;

  /** Get capabilities of a template */
  getTemplateCapabilities: (templateName: string) => {
    canGenerate: boolean;
    canFetch: boolean;
    canRender: boolean;
    isStaticOnly: boolean;
  } | null;

  // ============================================================================
  // Conversations (Read-Only)
  // ============================================================================

  /** Search conversations by query */
  searchConversations: (query: string) => Promise<Conversation[]>;

  /** Get messages from a conversation */
  getMessages: (
    conversationId: string,
    options?: GetMessagesOptions,
  ) => Promise<Message[]>;

  // ============================================================================
  // Job Queue
  // ============================================================================

  /**
   * Enqueue a job for background processing
   * @param toolContext - Pass ToolContext from tool handler, or null for background jobs
   */
  enqueueJob: EnqueueJobFn;

  /** Enqueue multiple operations as a batch */
  enqueueBatch: (
    operations: BatchOperation[],
    options?: JobOptions,
  ) => Promise<string>;

  /** Register a handler for a job type */
  registerJobHandler: <T = unknown, R = unknown>(
    type: string,
    handler: JobHandler<string, T, R>,
  ) => void;

  /** Get status of a specific job */
  getJobStatus: (jobId: string) => Promise<JobInfo | null>;

  // ============================================================================
  // View Templates
  // ============================================================================

  /** Get a view template by name */
  getViewTemplate: (name: string) => ViewTemplate<unknown> | undefined;

  /** List all registered view templates */
  listViewTemplates: () => ViewTemplate<unknown>[];

  /** Get the render service for advanced rendering */
  getRenderService: () => RenderService;

  // ============================================================================
  // Plugin Metadata
  // ============================================================================

  /** Get package name for a plugin */
  getPluginPackageName: (pluginId: string) => string | undefined;

  /** Data directory for storing entity files */
  readonly dataDir: string;

  // ============================================================================
  // Evaluation
  // ============================================================================

  /** Register an eval handler for plugin testing */
  registerEvalHandler: (handlerId: string, handler: EvalHandler) => void;
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
  const dataSourceRegistry = shell.getDataSourceRegistry();

  return {
    ...coreContext,

    // Entity service access
    entityService,
    registerEntityType: (entityType, schema, adapter, config): void => {
      entityRegistry.registerEntityType(entityType, schema, adapter, config);
    },
    getAdapter: <T extends BaseEntity>(
      entityType: string,
    ): EntityAdapter<T> | undefined => {
      try {
        return entityRegistry.getAdapter<T>(entityType);
      } catch {
        return undefined;
      }
    },
    updateEntity: async <T extends BaseEntity>(
      entity: T,
    ): Promise<{ entityId: string; jobId: string }> => {
      return entityService.updateEntity(entity);
    },

    // DataSource registration
    registerDataSource: (dataSource: DataSource): void => {
      // Just register the DataSource directly - the register method handles prefixing
      dataSourceRegistry.register(dataSource);
    },

    // AI content generation
    generateContent: async <T = unknown>(
      config: ContentGenerationConfig,
    ): Promise<T> => {
      return shell.generateContent(config);
    },

    // AI image generation
    generateImage: async (
      prompt: string,
      options?: ImageGenerationOptions,
    ): Promise<ImageGenerationResult> => {
      return shell.generateImage(prompt, options);
    },
    canGenerateImages: (): boolean => {
      return shell.canGenerateImages();
    },

    // Content formatting and parsing using template formatter
    formatContent: (templateName, data): string => {
      const contentService = shell.getContentService();
      return contentService.formatContent(templateName, data, { pluginId });
    },
    parseContent: <T = unknown>(templateName: string, content: string): T => {
      const contentService = shell.getContentService();
      return contentService.parseContent(templateName, content, pluginId);
    },

    // Conversation service helpers
    searchConversations: async (query: string): Promise<Conversation[]> => {
      const conversationService = shell.getConversationService();
      return conversationService.searchConversations(query);
    },
    getMessages: async (
      conversationId: string,
      options?: GetMessagesOptions,
    ): Promise<Message[]> => {
      const conversationService = shell.getConversationService();
      return conversationService.getMessages(conversationId, options);
    },

    // Job queue functionality - use shared helper with auto-scoping enabled
    enqueueJob: createEnqueueJobFn(jobQueueService, pluginId, true),
    enqueueBatch: async (operations, options): Promise<string> => {
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
          rootJobId: batchId, // Use generated batch ID as rootJobId
          metadata: {
            operationType: "batch_processing" as const,
            pluginId,
            ...options?.metadata,
          },
          ...options,
        },
        batchId,
        pluginId,
      );

      return batchId;
    },
    registerJobHandler: (type, handler): void => {
      // Add plugin scope to the type for explicit registration
      const scopedType = `${pluginId}:${type}`;
      jobQueueService.registerHandler(scopedType, handler, pluginId);
    },
    getJobStatus: async (jobId: string): Promise<JobInfo | null> => {
      return jobQueueService.getStatus(jobId);
    },

    // View template access
    getViewTemplate: (name: string): ViewTemplate<unknown> | undefined => {
      return renderService.get(name) ?? undefined;
    },
    listViewTemplates: (): ViewTemplate[] => {
      return renderService.list();
    },
    getRenderService: (): RenderService => {
      return renderService;
    },

    // Content resolution helper
    resolveContent: async <T = unknown>(
      templateName: string,
      options?: ResolutionOptions,
    ): Promise<T | null> => {
      const contentService = shell.getContentService();
      const result = await contentService.resolveContent(
        templateName,
        options,
        pluginId,
      );
      return result as T;
    },

    // Template capability checking
    getTemplateCapabilities: (
      templateName: string,
    ): {
      canGenerate: boolean;
      canFetch: boolean;
      canRender: boolean;
      isStaticOnly: boolean;
    } | null => {
      // Apply plugin scoping if not already scoped
      const scopedTemplateName = templateName.includes(":")
        ? templateName
        : `${pluginId}:${templateName}`;

      // Use the getTemplate method from shell which already handles registry access
      const template = shell.getTemplate(scopedTemplateName);
      if (!template) {
        return null;
      }

      const capabilities = TemplateCapabilities.getCapabilities(template);
      return {
        canGenerate: capabilities.canGenerate,
        canFetch: capabilities.canFetch,
        canRender: capabilities.canRender,
        isStaticOnly: capabilities.isStaticOnly,
      };
    },

    // Plugin metadata
    getPluginPackageName: (targetPluginId: string): string | undefined => {
      return shell.getPluginPackageName(targetPluginId);
    },

    // Data directory
    dataDir: shell.getDataDir(),

    // Eval handler registration - automatically scopes to this plugin
    registerEvalHandler: (handlerId: string, handler: EvalHandler): void => {
      shell.registerEvalHandler(pluginId, handlerId, handler);
    },
  };
}
