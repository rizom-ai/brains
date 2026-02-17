import { generateText, generateObject, generateImage } from "ai";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import type { Logger } from "@brains/utils";
import type { z } from "@brains/utils";
import type {
  AIModelConfig,
  IAIService,
  ImageProvider,
  AspectRatio,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "./types";

/**
 * Default model configuration
 */
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/**
 * AI Service for generating responses using Vercel AI SDK
 */
export class AIService implements IAIService {
  private static instance: AIService | null = null;
  private config: AIModelConfig;
  private logger: Logger;
  private anthropicProvider;
  private openaiProvider: ReturnType<typeof createOpenAI> | null = null;
  private googleProvider: ReturnType<typeof createGoogleGenerativeAI> | null =
    null;

  /**
   * Get the singleton instance
   */
  public static getInstance(config: AIModelConfig, logger: Logger): AIService {
    AIService.instance ??= new AIService(config, logger);
    return AIService.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    AIService.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(config: AIModelConfig, logger: Logger): AIService {
    return new AIService(config, logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(config: AIModelConfig, logger: Logger) {
    this.config = {
      ...config,
      model: config.model ?? DEFAULT_MODEL,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 1000,
      webSearch: config.webSearch ?? true, // Default to true
    };
    this.logger = logger.child("AIService");

    // Create provider with API key if provided
    this.anthropicProvider = config.apiKey
      ? createAnthropic({ apiKey: config.apiKey })
      : anthropic;

    // Create OpenAI provider for image generation if key provided
    if (config.openaiApiKey) {
      this.openaiProvider = createOpenAI({ apiKey: config.openaiApiKey });
    }

    // Create Google provider for image generation if key provided
    if (config.googleApiKey) {
      this.googleProvider = createGoogleGenerativeAI({
        apiKey: config.googleApiKey,
      });
    }
  }

  /**
   * Get the Anthropic model instance
   */
  public getModel(): LanguageModel {
    const { model } = this.config;
    return this.anthropicProvider(model ?? DEFAULT_MODEL);
  }

  /**
   * Generate text response
   */
  public async generateText(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<{
    text: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }> {
    this.logger.debug("Generating text response", {
      model: this.config.model,
    });

    try {
      const result = await generateText({
        model: this.getModel(),
        system: systemPrompt,
        prompt: userPrompt,
        ...(this.config.temperature !== undefined && {
          temperature: this.config.temperature,
        }),
        ...(this.config.maxTokens !== undefined && {
          maxTokens: this.config.maxTokens,
        }),
        ...(this.config.webSearch && {
          webSearch: true,
        }),
      });

      return {
        text: result.text,
        usage: {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
        },
      };
    } catch (error) {
      this.logger.error("Failed to generate text", error);
      throw new Error("AI text generation failed");
    }
  }

  /**
   * Generate structured object response
   */
  public async generateObject<T>(
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
  }> {
    this.logger.debug("Generating structured response", {
      model: this.config.model,
    });

    try {
      // @ts-ignore - Type instantiation issue with Zod v3 and AI SDK
      const result = await generateObject({
        model: this.getModel(),
        system: systemPrompt,
        prompt: userPrompt,
        schema,
        ...(this.config.temperature !== undefined && {
          temperature: this.config.temperature,
        }),
        ...(this.config.maxTokens !== undefined && {
          maxTokens: this.config.maxTokens,
        }),
        ...(this.config.webSearch && {
          webSearch: true,
        }),
        providerOptions: {
          anthropic: { structuredOutputMode: "jsonTool" },
        },
      });

      return {
        object: result.object as T,
        usage: {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
        },
      };
    } catch (error) {
      this.logger.error("Failed to generate object", error);
      throw new Error("AI object generation failed");
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<AIModelConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info("AI configuration updated", {
      model: this.config.model,
    });
  }

  /**
   * Get current configuration
   */
  public getConfig(): AIModelConfig {
    return { ...this.config };
  }

  /**
   * Check if image generation is available
   */
  public canGenerateImages(): boolean {
    return this.openaiProvider !== null || this.googleProvider !== null;
  }

  /**
   * Get the active image provider based on config or auto-detection.
   * Prefers Google when both providers are available (better text rendering).
   */
  private get imageProvider(): ImageProvider | null {
    if (this.config.defaultImageProvider) {
      const preferred = this.config.defaultImageProvider;
      if (preferred === "google" && this.googleProvider) return "google";
      if (preferred === "openai" && this.openaiProvider) return "openai";
    }
    // Auto-detect: prefer OpenAI until Google provider issues are resolved
    if (this.openaiProvider) return "openai";
    if (this.googleProvider) return "google";
    return null;
  }

  /**
   * Generate an image from a text prompt
   */
  public async generateImage(
    prompt: string,
    options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResult> {
    const provider = this.imageProvider;
    if (!provider) {
      throw new Error("Image generation not available: no API key configured");
    }

    this.logger.debug("Generating image", {
      prompt: prompt.slice(0, 100),
      provider,
    });

    try {
      const aspectRatio: AspectRatio = options?.aspectRatio ?? "16:9";
      const result =
        provider === "google"
          ? await this.generateImageWithGoogle(prompt, aspectRatio)
          : await this.generateImageWithOpenAI(prompt, aspectRatio);

      const base64 = result.image.base64;
      const dataUrl = `data:image/png;base64,${base64}`;

      this.logger.debug("Image generated successfully", { provider });

      return { base64, dataUrl };
    } catch (error) {
      this.logger.error("Failed to generate image", error);
      throw new Error("Image generation failed");
    }
  }

  private async generateImageWithOpenAI(
    prompt: string,
    aspectRatio: AspectRatio,
  ): Promise<{ image: { base64: string } }> {
    if (!this.openaiProvider) {
      throw new Error("OpenAI provider not configured");
    }
    return generateImage({
      model: this.openaiProvider.image("dall-e-3"),
      prompt,
      size: ASPECT_RATIO_TO_DALLE_SIZE[aspectRatio],
      providerOptions: {
        openai: { style: "vivid" },
      },
    });
  }

  private async generateImageWithGoogle(
    prompt: string,
    aspectRatio: AspectRatio,
  ): Promise<{ image: { base64: string } }> {
    if (!this.googleProvider) {
      throw new Error("Google provider not configured");
    }
    return generateImage({
      model: this.googleProvider.image(
        this.config.googleImageModel ?? "gemini-3-pro-image-preview",
      ),
      prompt,
      aspectRatio,
    });
  }
}

/**
 * Mapping from aspect ratio to DALL-E 3 pixel sizes
 */
const ASPECT_RATIO_TO_DALLE_SIZE: Record<
  AspectRatio,
  "1024x1024" | "1792x1024" | "1024x1792"
> = {
  "1:1": "1024x1024",
  "16:9": "1792x1024",
  "9:16": "1024x1792",
  "4:3": "1792x1024",
  "3:4": "1024x1792",
};
