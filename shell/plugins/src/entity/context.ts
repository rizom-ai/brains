import type { BasePluginContext, IPermissionsNamespace } from "../base/context";
import { createBasePluginContext } from "../base/context";
import type {
  BasePluginContext as PublicBasePluginContext,
  EntityPluginContext as PublicEntityPluginContext,
} from "../public/types";
import type { IShell, PluginRegistrationContext } from "../interfaces";
import type { ContentGenerationConfig } from "../contracts/generation";
import type {
  AIGenerationSchema,
  IEntityAINamespace,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "./ai-types";
import type {
  IEntityService,
  IEntitiesNamespace,
} from "@brains/entity-service";
import { createEntitiesNamespace, createPromptsNamespace } from "./namespaces";
import type { IPromptsNamespace } from "./namespaces";
export type { IEntitiesNamespace };
export type { IPromptsNamespace };
export type {
  AIGenerationSchema,
  AspectRatio,
  IEntityAINamespace,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "./ai-types";

export interface FrontmatterSchemaParser {
  parse(data: unknown): unknown;
}

export interface EntityPluginEntitiesNamespace extends Omit<
  IEntitiesNamespace,
  "getEffectiveFrontmatterSchema"
> {
  getEffectiveFrontmatterSchema(
    type: string,
  ): FrontmatterSchemaParser | undefined;
}

/**
 * Bind the AI namespace to a shell. Entity and service plugin contexts expose
 * the same surface, so they share this rather than each rebinding it.
 */
export function createAINamespace(shell: IShell): IEntityAINamespace {
  return {
    query: (prompt, context) => shell.query(prompt, context),
    generate: async <T = unknown>(
      config: ContentGenerationConfig,
    ): Promise<T> => {
      return shell.generateContent<T>(config);
    },
    generateObject: async <T>(
      prompt: string,
      schema: AIGenerationSchema<T>,
      signal?: AbortSignal,
    ): Promise<{ object: T }> => {
      return shell.generateObject(prompt, schema, signal);
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
  };
}

/**
 * Context for entity plugins.
 *
 * Includes: entity registration, AI generation, prompt resolution, messaging, jobs.
 * Excludes: templates, views, MCP registration, transport.
 */
export interface EntityPluginContext
  extends
    BasePluginContext,
    Omit<PublicEntityPluginContext, keyof PublicBasePluginContext> {
  readonly entityService: IEntityService;
  readonly entities: EntityPluginEntitiesNamespace;
  readonly ai: IEntityAINamespace;
  readonly prompts: IPromptsNamespace;
  readonly permissions: IPermissionsNamespace;
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

    ai: createAINamespace(shell),

    prompts: createPromptsNamespace(entityService),

    permissions: baseContext.permissions,
  };
}
