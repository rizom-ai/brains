import type {
  CorePluginContext,
  ITemplatesNamespace,
  IAINamespace,
  IJobsWriteNamespace,
} from "../core/context";
import type {
  IShell,
  ContentGenerationConfig,
  EvalHandler,
} from "../interfaces";
import type {
  ImageGenerationOptions,
  ImageGenerationResult,
} from "@brains/ai-service";
import { createEnqueueJobFn } from "../shared/job-helpers";
import type {
  IEntityService,
  BaseEntity,
  EntityAdapter,
  EntityTypeConfig,
} from "@brains/entity-service";
import type { ResolutionOptions } from "@brains/content-service";
import { TemplateCapabilities } from "@brains/templates";
import type { JobHandler, BatchOperation, JobOptions } from "@brains/job-queue";
import { createId } from "@brains/utils";
import type { ViewTemplate, WebRenderer } from "@brains/render-service";
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

  /** Extend an adapter's frontmatterSchema with additional fields */
  extendFrontmatterSchema: (
    type: string,
    extension: z.ZodObject<z.ZodRawShape>,
  ) => void;

  /** Get effective frontmatter schema (base + extensions) for an entity type */
  getEffectiveFrontmatterSchema: (
    type: string,
  ) => z.ZodObject<z.ZodRawShape> | undefined;

  /** Update an existing entity */
  update: <T extends BaseEntity>(
    entity: T,
  ) => Promise<{ entityId: string; jobId: string }>;

  /** Register a data source for dynamic content */
  registerDataSource: (dataSource: DataSource) => void;
}

/**
 * Extended template operations namespace for ServicePluginContext
 * Includes all base template operations plus resolution and capability checking
 */
export interface IServiceTemplatesNamespace extends ITemplatesNamespace {
  /** Resolve content from a template (may fetch or generate) */
  resolve: <T = unknown>(
    templateName: string,
    options?: ResolutionOptions,
  ) => Promise<T | null>;

  /** Get capabilities of a template */
  getCapabilities: (templateName: string) => {
    canGenerate: boolean;
    canFetch: boolean;
    canRender: boolean;
    isStaticOnly: boolean;
  } | null;
}

/**
 * Views namespace for ServicePluginContext
 * Provides access to view templates and rendering utilities
 */
export interface IViewsNamespace {
  /** Get a view template by name */
  get: (name: string) => ViewTemplate<unknown> | undefined;

  /** List all registered view templates */
  list: () => ViewTemplate<unknown>[];

  /** Check if a template has a web renderer */
  hasRenderer: (templateName: string) => boolean;

  /** Get the web renderer for a template */
  getRenderer: (templateName: string) => WebRenderer | undefined;

  /** Validate content against a template's schema */
  validate: (templateName: string, content: unknown) => boolean;
}

/**
 * Extended AI namespace for ServicePluginContext
 * Includes base AI operations plus content and image generation
 */
export interface IServiceAINamespace extends IAINamespace {
  /** Generate content using AI with template */
  generate: <T = unknown>(config: ContentGenerationConfig) => Promise<T>;

  /** Generate a structured object using AI with a Zod schema */
  generateObject: <T>(
    prompt: string,
    schema: z.ZodType<T>,
  ) => Promise<{ object: T }>;

  /** Generate an image using AI (requires OPENAI_API_KEY) */
  generateImage: (
    prompt: string,
    options?: ImageGenerationOptions,
  ) => Promise<ImageGenerationResult>;

  /** Check if image generation is available */
  canGenerateImages: () => boolean;
}

/**
 * Eval namespace for ServicePluginContext
 * Provides methods for registering evaluation handlers for plugin testing
 */
export interface IEvalNamespace {
  /** Register an eval handler for plugin testing */
  registerHandler: (handlerId: string, handler: EvalHandler) => void;
}

/**
 * Plugins namespace for ServicePluginContext
 * Provides plugin metadata access
 */
export interface IPluginsNamespace {
  /** Get package name for a plugin */
  getPackageName: (pluginId: string) => string | undefined;
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
  // AI Operations (extends CorePluginContext.ai)
  // ============================================================================

  /**
   * Extended AI operations namespace
   * Includes base operations plus:
   * - `ai.generate()` - Generate content using AI with template
   * - `ai.generateImage()` - Generate an image using AI
   * - `ai.canGenerateImages()` - Check if image generation is available
   */
  readonly ai: IServiceAINamespace;

  // ============================================================================
  // Template Operations (extends CorePluginContext.templates)
  // ============================================================================

  /**
   * Extended template operations namespace
   * Includes all base operations plus:
   * - `templates.resolve()` - Resolve content from a template (may fetch or generate)
   * - `templates.getCapabilities()` - Get capabilities of a template
   */
  readonly templates: IServiceTemplatesNamespace;

  // ============================================================================
  // Job Queue (extends base IJobsNamespace with plugin-scoped operations)
  // ============================================================================

  /** Extended jobs namespace with plugin-scoped write operations */
  readonly jobs: IJobsWriteNamespace;

  // ============================================================================
  // View Templates
  // ============================================================================

  /**
   * Views namespace for view template access and rendering utilities
   * - `views.get()` - Get a view template by name
   * - `views.list()` - List all registered view templates
   * - `views.hasRenderer()` - Check if a template has a web renderer
   * - `views.getRenderer()` - Get the web renderer for a template
   * - `views.validate()` - Validate content against a template's schema
   */
  readonly views: IViewsNamespace;

  // ============================================================================
  // Plugin Metadata
  // ============================================================================

  /**
   * Plugins namespace for plugin metadata access
   * - `plugins.getPackageName()` - Get package name for a plugin
   */
  readonly plugins: IPluginsNamespace;

  /** Data directory for storing entity files */
  readonly dataDir: string;

  // ============================================================================
  // Evaluation
  // ============================================================================

  /**
   * Eval namespace for plugin testing
   * - `eval.registerHandler()` - Register an eval handler for plugin testing
   */
  readonly eval: IEvalNamespace;
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
      extendFrontmatterSchema: (
        type: string,
        extension: z.ZodObject<z.ZodRawShape>,
      ): void => {
        entityRegistry.extendFrontmatterSchema(type, extension);
      },
      getEffectiveFrontmatterSchema: (
        type: string,
      ): z.ZodObject<z.ZodRawShape> | undefined => {
        return entityRegistry.getEffectiveFrontmatterSchema(type);
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

    // AI operations namespace - extends coreContext.ai with generation capabilities
    ai: {
      // Base AI operation from core context
      query: coreContext.ai.query,

      // Content generation
      generate: async <T = unknown>(
        config: ContentGenerationConfig,
      ): Promise<T> => {
        return shell.generateContent(config);
      },

      // Structured object generation
      generateObject: async <T>(
        prompt: string,
        schema: z.ZodType<T>,
      ): Promise<{ object: T }> => {
        return shell.generateObject(prompt, schema);
      },

      // Image generation
      generateImage: async (
        prompt: string,
        options?: ImageGenerationOptions,
      ): Promise<ImageGenerationResult> => {
        return shell.generateImage(prompt, options);
      },
      canGenerateImages: (): boolean => {
        return shell.canGenerateImages();
      },
    },

    // Template operations namespace - extends coreContext.templates with resolve and getCapabilities
    templates: {
      // Base template operations (override from core context)
      register: coreContext.templates.register,
      format: <T = unknown>(templateName: string, data: T): string => {
        const contentService = shell.getContentService();
        return contentService.formatContent(templateName, data, { pluginId });
      },
      parse: <T = unknown>(templateName: string, content: string): T => {
        const contentService = shell.getContentService();
        return contentService.parseContent(templateName, content, pluginId);
      },

      // Extended operations for service plugins
      resolve: async <T = unknown>(
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

      getCapabilities: (
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

    // Views namespace
    views: {
      get: (name: string): ViewTemplate<unknown> | undefined => {
        return renderService.get(name) ?? undefined;
      },
      list: (): ViewTemplate<unknown>[] => {
        return renderService.list();
      },
      hasRenderer: (templateName: string): boolean => {
        return renderService.hasRenderer(templateName, "web");
      },
      getRenderer: (templateName: string): WebRenderer | undefined => {
        return renderService.getRenderer(templateName, "web");
      },
      validate: (templateName: string, content: unknown): boolean => {
        return renderService.validate(templateName, content);
      },
    },

    // Plugins namespace
    plugins: {
      getPackageName: (targetPluginId: string): string | undefined => {
        return shell.getPluginPackageName(targetPluginId);
      },
    },

    // Data directory
    dataDir: shell.getDataDir(),

    // Eval namespace - automatically scopes to this plugin
    eval: {
      registerHandler: (handlerId: string, handler: EvalHandler): void => {
        shell.registerEvalHandler(pluginId, handlerId, handler);
      },
    },
  };
}
