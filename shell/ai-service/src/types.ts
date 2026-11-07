import type { LanguageModel } from "ai";
import type { ZodType } from "@brains/utils/zod";

export type ReasoningEffort =
  "none" | "low" | "medium" | "high" | "xhigh" | "max";

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
  /** OpenAI reasoning effort. Ignored by providers that do not support it. */
  reasoningEffort?: ReasoningEffort;
  /** The model runtime serving `local:` models. */
  modelRuntimeUrl?: string;
  /** A `local:` model that answers tool results in place of `model`. */
  answerModel?: string;
  /** A `local:` model that describes images for a model that reads only text. */
  visionModel?: string;
}

export type AIModelConfigUpdate = Partial<AIModelConfig>;

export type AIGenerationSchema<T> = ZodType<T>;

/**
 * AI Service interface for generating text and structured objects
 */
export interface JudgeInput<T> {
  instruction: string;
  material: string;
  schema: AIGenerationSchema<T>;
  /** Cancel the underlying provider request. */
  signal?: AbortSignal;
}

export interface IAIService {
  generateText(
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal,
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
    schema: AIGenerationSchema<T>,
    signal?: AbortSignal,
  ): Promise<{
    object: T;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;

  judge<T>(input: JudgeInput<T>): Promise<{
    verdict: T;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;

  updateConfig(config: AIModelConfigUpdate): void;

  getConfig(): AIModelConfig;

  getModel(): LanguageModel;

  /** The model that answers tool results, when one is configured. */
  getAnswerModel?(): LanguageModel | undefined;
  /** The model that describes images for a model reading only text. */
  getVisionModel?(): LanguageModel | undefined;

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
  /** Cancel the underlying provider request. */
  signal?: AbortSignal;
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
