import type { DefaultQueryResponse } from "@brains/contracts";
import type { ZodType } from "@brains/utils/zod";
import type {
  ImageGenerationOptions,
  ImageGenerationResult,
} from "@brains/ai-service";
import type { ContentGenerationConfig } from "../contracts/generation";

export type AIGenerationSchema<T> = ZodType<T>;

export interface IEntityAINamespace {
  query: (
    prompt: string,
    context?: Record<string, unknown>,
  ) => Promise<DefaultQueryResponse>;
  /**
   * Generate content from a template and parse the model output through
   * `schema`. The schema is required for the same reason generateObject takes
   * one: the model's output is untrusted, and a bare type parameter was a
   * claim nothing checked.
   */
  generate: <T>(
    config: ContentGenerationConfig,
    schema: AIGenerationSchema<T>,
  ) => Promise<T>;
  generateObject: <T>(
    prompt: string,
    schema: AIGenerationSchema<T>,
    signal?: AbortSignal,
  ) => Promise<{ object: T }>;
  generateImage: (
    prompt: string,
    options?: ImageGenerationOptions,
  ) => Promise<ImageGenerationResult>;
  canGenerateImages: () => boolean;
}
