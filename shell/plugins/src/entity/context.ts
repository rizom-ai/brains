import type { BasePluginContext } from "../base/context";
import { createBasePluginContext } from "../base/context";
import type {
  IShell,
  ContentGenerationConfig,
  PluginRegistrationContext,
} from "../interfaces";
import type {
  IEntityService,
  IEntitiesNamespace,
} from "@brains/entity-service";
import { createEntitiesNamespace, createPromptsNamespace } from "./namespaces";
import type {
  ImageGenerationOptions,
  ImageGenerationResult,
} from "@brains/ai-service";
import type { DefaultQueryResponse } from "@brains/utils";
import type { z } from "@brains/utils";

export type { IEntitiesNamespace };

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
  registrationContext?: PluginRegistrationContext,
): EntityPluginContext {
  const baseContext = createBasePluginContext(
    shell,
    pluginId,
    registrationContext,
  );
  const entityService = shell.getEntityService();

  return {
    ...baseContext,

    entityService,

    entities: createEntitiesNamespace(shell),

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

    prompts: createPromptsNamespace(entityService),
  };
}
