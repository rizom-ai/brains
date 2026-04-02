import type { z } from "@brains/utils";
import type { LanguageModel } from "ai";

/**
 * AI model configuration
 */
export interface AIModelConfig {
  /** Text model — determines provider automatically. e.g. "gpt-4o-mini", "claude-haiku-4-5", "openai:gpt-4o" */
  model?: string;
  /** Image model — determines provider automatically. e.g. "gpt-image-1.5", "gemini-3-pro-image-preview" */
  imageModel?: string;
  /** Single API key — used for whichever provider is configured */
  apiKey?: string;
  /** Optional separate key for image generation (defaults to apiKey) */
  imageApiKey?: string;
  temperature?: number;
  maxTokens?: number;
  webSearch?: boolean;
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
