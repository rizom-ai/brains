import type { BasePluginContext } from "../base/context";
import { createBasePluginContext } from "../base/context";
import type { IShell, ContentGenerationConfig } from "../interfaces";
import type {
  IEntityService,
  BaseEntity,
  EntityAdapter,
  EntityTypeConfig,
} from "@brains/entity-service";
import type { DataSource } from "@brains/entity-service";
import { resolvePrompt } from "./prompt-resolver";
import type {
  ImageGenerationOptions,
  ImageGenerationResult,
} from "@brains/ai-service";
import type { DefaultQueryResponse } from "@brains/utils";
import type { z } from "@brains/utils";

/**
 * Entities namespace — entity type registration and management
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
 * AI namespace for entity plugins — includes generation capabilities
 */
export interface IEntityAINamespace {
  /** Query the AI with optional context */
  query: (
    prompt: string,
    context?: Record<string, unknown>,
  ) => Promise<DefaultQueryResponse>;

  /** Generate content using AI with template */
  generate: <T = unknown>(config: ContentGenerationConfig) => Promise<T>;

  /** Generate a structured object using AI with a Zod schema */
  generateObject: <T>(
    prompt: string,
    schema: z.ZodType<T>,
  ) => Promise<{ object: T }>;

  /** Generate an image using AI (requires AI_API_KEY) */
  generateImage: (
    prompt: string,
    options?: ImageGenerationOptions,
  ) => Promise<ImageGenerationResult>;

  /** Check if image generation is available */
  canGenerateImages: () => boolean;
}

/**
 * Prompts namespace — resolves AI prompts from prompt entities
 */
export interface IPromptsNamespace {
  /** Resolve a prompt by target name. Returns entity content if found, fallback otherwise. */
  resolve: (target: string, fallback: string) => Promise<string>;
}

/**
 * Context for entity plugins.
 *
 * Includes: entity registration, AI generation, prompt resolution, messaging, jobs.
 * Excludes: templates, views, MCP registration, transport.
 */
export interface EntityPluginContext extends BasePluginContext {
  readonly entityService: IEntityService;
  readonly entities: IEntitiesNamespace;
  readonly ai: IEntityAINamespace;
  readonly prompts: IPromptsNamespace;
}

/**
 * Create an EntityPluginContext from the shell.
 */
export function createEntityPluginContext(
  shell: IShell,
  pluginId: string,
): EntityPluginContext {
  const baseContext = createBasePluginContext(shell, pluginId);
  const entityService = shell.getEntityService();
  const entityRegistry = shell.getEntityRegistry();
  const dataSourceRegistry = shell.getDataSourceRegistry();

  return {
    ...baseContext,

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
      query: (prompt, context) => shell.query(prompt, context),
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

    prompts: {
      resolve: (target: string, fallback: string): Promise<string> => {
        return resolvePrompt(entityService, target, fallback);
      },
    },
  };
}
