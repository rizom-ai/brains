import type { CorePluginContext } from "../core/context";
import { createCorePluginContext } from "../core/context";
import type {
  IEntitiesNamespace,
  IServiceAINamespace,
  IServiceTemplatesNamespace,
} from "../service/context";
import type { IShell, ContentGenerationConfig } from "../interfaces";
import type {
  IEntityService,
  BaseEntity,
  EntityAdapter,
  EntityTypeConfig,
} from "@brains/entity-service";
import type { DataSource } from "@brains/entity-service";
import { resolvePrompt } from "./prompt-resolver";
import type { ResolutionOptions } from "@brains/content-service";
import type {
  ImageGenerationOptions,
  ImageGenerationResult,
} from "@brains/ai-service";
import { TemplateCapabilities } from "@brains/templates";
import type { z } from "@brains/utils";
import {
  createEnqueueJobFn,
  createEnqueueBatchFn,
  createRegisterHandlerFn,
  type JobsNamespace,
} from "@brains/job-queue";

/**
 * Context for entity plugins — scoped subset of ServicePluginContext.
 *
 * Includes everything needed for entity management:
 * entity registration, job handlers, AI generation, templates, messaging.
 *
 * Excludes: views, plugins namespace, MCP tool/resource/prompt registration.
 */
/**
 * Prompts namespace for EntityPluginContext
 * Resolves AI prompts from prompt entities, falling back to hardcoded defaults
 */
export interface IPromptsNamespace {
  /** Resolve a prompt by target name. Returns entity content if found, fallback otherwise. */
  resolve: (target: string, fallback: string) => Promise<string>;
}

export interface EntityPluginContext extends CorePluginContext {
  readonly entityService: IEntityService;
  readonly entities: IEntitiesNamespace;
  readonly ai: IServiceAINamespace;
  readonly templates: IServiceTemplatesNamespace;
  readonly jobs: JobsNamespace;
  readonly prompts: IPromptsNamespace;
  readonly dataDir: string;
}

/**
 * Create an EntityPluginContext — only the namespaces entity plugins need.
 */
export function createEntityPluginContext(
  shell: IShell,
  pluginId: string,
): EntityPluginContext {
  const coreContext = createCorePluginContext(shell, pluginId);
  const entityService = shell.getEntityService();
  const entityRegistry = shell.getEntityRegistry();
  const jobQueueService = shell.getJobQueueService();
  const dataSourceRegistry = shell.getDataSourceRegistry();
  const contentService = shell.getContentService();

  return {
    ...coreContext,

    entityService,

    entities: {
      register: <T extends BaseEntity>(
        entityType: string,
        schema: z.ZodSchema<T>,
        adapter: EntityAdapter<T>,
        config?: EntityTypeConfig,
      ): void => {
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
        dataSourceRegistry.register(dataSource);
      },
    },

    ai: {
      query: coreContext.ai.query,
      generate: async <T = unknown>(
        config: ContentGenerationConfig,
      ): Promise<T> => {
        return shell.generateContent<T>(config);
      },
      generateObject: async <T>(
        prompt: string,
        schema: z.ZodType<T>,
      ): Promise<{ object: T }> => {
        return shell.generateObject(prompt, schema);
      },
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

    templates: {
      register: coreContext.templates.register,
      format: <T = unknown>(templateName: string, data: T): string => {
        return contentService.formatContent(templateName, data, { pluginId });
      },
      parse: <T = unknown>(templateName: string, content: string): T => {
        return contentService.parseContent(templateName, content, pluginId);
      },
      resolve: async <T = unknown>(
        templateName: string,
        options?: ResolutionOptions,
      ): Promise<T | null> => {
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
        const scopedName = templateName.includes(":")
          ? templateName
          : `${pluginId}:${templateName}`;
        const template = shell.getTemplate(scopedName);
        if (!template) return null;
        const caps = TemplateCapabilities.getCapabilities(template);
        return {
          canGenerate: caps.canGenerate,
          canFetch: caps.canFetch,
          canRender: caps.canRender,
          isStaticOnly: caps.isStaticOnly,
        };
      },
    },

    jobs: {
      ...shell.jobs,
      enqueue: createEnqueueJobFn(jobQueueService, pluginId, true),
      enqueueBatch: createEnqueueBatchFn(shell.jobs, pluginId),
      registerHandler: createRegisterHandlerFn(jobQueueService, pluginId),
    },

    prompts: {
      resolve: (target: string, fallback: string): Promise<string> => {
        return resolvePrompt(entityService, target, fallback);
      },
    },

    dataDir: shell.getDataDir(),
  };
}
