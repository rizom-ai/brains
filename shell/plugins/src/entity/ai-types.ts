import type { DefaultQueryResponse } from "@brains/contracts";
import type { ZodType } from "@brains/utils/zod";
import type { ContentGenerationConfig } from "../contracts/generation";

export type AIGenerationSchema<T> = ZodType<T>;

export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export interface ImageGenerationOptions {
  aspectRatio?: AspectRatio;
  signal?: AbortSignal;
}

export interface ImageGenerationResult {
  base64: string;
  dataUrl: string;
}

export interface IEntityAINamespace {
  query: (
    prompt: string,
    context?: Record<string, unknown>,
  ) => Promise<DefaultQueryResponse>;
  generate: <T = unknown>(config: ContentGenerationConfig) => Promise<T>;
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
