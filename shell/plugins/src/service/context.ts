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
  JobOptions,
  IJobsNamespace,
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
 * Entity management namespace for ServicePluginContext
 * Provides methods for registering entity types, accessing adapters, and managing data sources
 */
export interface IEntitiesNamespace {
  /** Register a new entity type with schema and adapter */
  register: <T extends BaseEntity>(
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
  update: <T extends BaseEntity>(
    entity: T,
  ) => Promise<{ entityId: string; jobId: string }>;

  /** Register a data source for dynamic content */
  registerDataSource: (dataSource: DataSource) => void;
}

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

  /**
   * Entity management namespace
   * - `entities.register()` - Register a new entity type with schema and adapter
   * - `entities.getAdapter()` - Get the adapter for an entity type
   * - `entities.update()` - Update an existing entity
   * - `entities.registerDataSource()` - Register a data source for dynamic content
   */
  readonly entities: IEntitiesNamespace;

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
  // Job Queue (extends base IJobsNamespace with plugin-scoped operations)
  // ============================================================================

  /** Extended jobs namespace with plugin-scoped write operations */
  readonly jobs: Omit<IJobsNamespace, "enqueueBatch"> & {
    /**
     * Enqueue a job for background processing
     * @param type - Job type (will be auto-scoped with plugin ID)
     * @param data - Job payload
     * @param toolContext - Pass ToolContext from tool handler, or null for background jobs
     * @param options - Optional job options
     */
    enqueue: EnqueueJobFn;

    /** Enqueue multiple operations as a batch (simplified - batchId generated internally) */
    enqueueBatch: (
      operations: BatchOperation[],
      options?: JobOptions,
    ) => Promise<string>;

    /** Register a handler for a job type (auto-scoped with plugin ID) */
    registerHandler: <T = unknown, R = unknown>(
      type: string,
      handler: JobHandler<string, T, R>,
    ) => void;
  };

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

    // Entity management namespace
    entities: {
      register: (entityType, schema, adapter, config): void => {
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
      update: async <T extends BaseEntity>(
        entity: T,
      ): Promise<{ entityId: string; jobId: string }> => {
        return entityService.updateEntity(entity);
      },
      registerDataSource: (dataSource: DataSource): void => {
        // Just register the DataSource directly - the register method handles prefixing
        dataSourceRegistry.register(dataSource);
      },
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

    // Job operations namespace - extends shell.jobs with plugin-scoped operations
    jobs: {
      // Pass through base operations from shell
      ...shell.jobs,

      // Plugin-scoped enqueue with auto-scoping enabled
      enqueue: createEnqueueJobFn(jobQueueService, pluginId, true),

      // Plugin-scoped batch enqueue (generates batchId internally)
      enqueueBatch: async (
        operations: BatchOperation[],
        options?: JobOptions,
      ): Promise<string> => {
        const batchId = createId();
        // Add plugin scope to operation types unless already scoped
        const scopedOperations = operations.map((op) => ({
          ...op,
          type: op.type.includes(":") ? op.type : `${pluginId}:${op.type}`,
        }));
        const jobOptions: JobOptions = {
          ...options,
          source: pluginId,
          rootJobId: batchId,
          metadata: {
            ...options?.metadata,
            operationType: "batch_processing" as const,
            pluginId,
          },
        };
        await shell.jobs.enqueueBatch(
          scopedOperations,
          jobOptions,
          batchId,
          pluginId,
        );
        return batchId;
      },

      // Plugin-scoped handler registration
      registerHandler: <T = unknown, R = unknown>(
        type: string,
        handler: JobHandler<string, T, R>,
      ): void => {
        const scopedType = `${pluginId}:${type}`;
        jobQueueService.registerHandler(scopedType, handler, pluginId);
      },
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
