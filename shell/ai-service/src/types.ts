import type { z } from "@brains/utils";
import type { LanguageModel } from "ai";

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
   * Generate an image from a text prompt using DALL-E 3
   */
  generateImage(
    prompt: string,
    options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResult>;

  /**
   * Check if image generation is available (OpenAI API key configured)
   */
  canGenerateImages(): boolean;
}

/**
 * Options for image generation
 */
export interface ImageGenerationOptions {
  /** Image size - DALL-E 3 only supports these three sizes (default: landscape 1792x1024) */
  size?: "1024x1024" | "1792x1024" | "1024x1792";
  /** Style: vivid (hyper-real, dramatic) or natural (less hyper-real) */
  style?: "vivid" | "natural";
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
