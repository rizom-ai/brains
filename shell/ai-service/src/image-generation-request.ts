import { z } from "@brains/utils/zod";
import type {
  AIModelConfig,
  AspectRatio,
  ImageGenerationOptions,
} from "./types";
import { selectImageProvider, selectTextProvider } from "./provider-selection";

export interface ImageGenerationRequest {
  provider: "openai" | "google";
  model: string;
  apiKey: string;
  prompt: string;
  aspectRatio: AspectRatio;
}
export const imageGenerationRequestSchema: z.ZodType<ImageGenerationRequest> =
  z.strictObject({
    provider: z.enum(["openai", "google"]),
    model: z.string().min(1).max(256),
    apiKey: z
      .string()
      .min(1)
      .max(4096)
      .regex(/^[\x20-\x7e]+$/),
    prompt: z.string().min(1).max(16384),
    aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]),
  });
export function createImageGenerationRequest(
  prompt: string,
  config: AIModelConfig,
  options?: ImageGenerationOptions,
): ImageGenerationRequest {
  const { provider, modelId } = selectImageProvider(config.imageModel);
  // Match the existing provider client key selection, including same-provider text credentials.
  const apiKey =
    selectTextProvider(config.model) === provider && config.apiKey
      ? config.apiKey
      : (config.imageApiKey ?? config.apiKey);
  if (!apiKey)
    throw new Error("Image generation not available: no API key configured");
  return imageGenerationRequestSchema.parse({
    provider,
    model: modelId,
    apiKey,
    prompt,
    aspectRatio: options?.aspectRatio ?? "16:9",
  });
}
