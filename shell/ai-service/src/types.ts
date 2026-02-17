import type { z } from "@brains/utils";
import type { LanguageModel } from "ai";

/**
 * Image provider for generation
 */
export type ImageProvider = "openai" | "google";

/**
 * Google image model for generation
 */
export type GoogleImageModel =
  | "gemini-2.5-flash-image"
  | "gemini-3-pro-image-preview";

/**
 * AI model configuration
 */
export interface AIModelConfig {
  model?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  webSearch?: boolean;
  /** OpenAI API key for image generation */
  openaiApiKey?: string | undefined;
  /** Google Generative AI API key for image generation */
  googleApiKey?: string | undefined;
  /** Default image provider (auto-detected from available keys if not set) */
  defaultImageProvider?: ImageProvider;
  /** Google image model: "gemini-3-pro-image-preview" (default) or "gemini-2.5-flash-image" (free) */
  googleImageModel?: GoogleImageModel;
}

/**
 * AI Service interface for generating text and structured objects
 */
export interface IAIService {
  generateText(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<{
    text: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;

  generateObject<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType<T>,
  ): Promise<{
    object: T;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;

  updateConfig(config: Partial<AIModelConfig>): void;

  getConfig(): AIModelConfig;

  getModel(): LanguageModel;

  /**
   * Generate an image from a text prompt
   */
  generateImage(
    prompt: string,
    options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResult>;

  /**
   * Check if image generation is available (OpenAI or Google API key configured)
   */
  canGenerateImages(): boolean;
}

/**
 * Aspect ratio for image generation
 */
export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

/**
 * Options for image generation
 */
export interface ImageGenerationOptions {
  /** Aspect ratio for the generated image (default: "16:9") */
  aspectRatio?: AspectRatio;
}

/**
 * Result of image generation
 */
export interface ImageGenerationResult {
  /** Raw base64-encoded image data */
  base64: string;
  /** Data URL format: data:image/png;base64,... */
  dataUrl: string;
}
