import {
  generateText,
  generateObject,
  experimental_generateImage as generateImage,
} from "ai";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { Logger } from "@brains/utils";
import type { z } from "@brains/utils";
import type {
  AIModelConfig,
  IAIService,
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
    return this.openaiProvider !== null;
  }

  /**
   * Describe an image using vision model (Claude)
   */
  public async describeImage(
    imageDataUrl: string,
    prompt?: string,
  ): Promise<{
    description: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }> {
    const descriptionPrompt =
      prompt ??
      "Describe this image concisely for use as alt text. Focus on the main subject, key visual elements, and context. Keep it under 150 characters if possible.";

    this.logger.debug("Describing image with vision model");

    try {
      const result = await generateText({
        model: this.getModel(),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                image: imageDataUrl,
              },
              {
                type: "text",
                text: descriptionPrompt,
              },
            ],
          },
        ],
      });

      return {
        description: result.text.trim(),
        usage: {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
        },
      };
    } catch (error) {
      this.logger.error("Failed to describe image", error);
      throw new Error("Image description failed");
    }
  }

  /**
   * Generate an image from a text prompt using DALL-E 3
   */
  public async generateImage(
    prompt: string,
    options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResult> {
    if (!this.openaiProvider) {
      throw new Error(
        "Image generation not available: OPENAI_API_KEY not configured",
      );
    }

    this.logger.debug("Generating image", { prompt: prompt.slice(0, 100) });

    try {
      const result = await generateImage({
        model: this.openaiProvider.image("dall-e-3"),
        prompt,
        size: options?.size ?? "1792x1024", // Landscape default for cover images
        providerOptions: {
          openai: {
            style: options?.style ?? "vivid",
          },
        },
      });

      const base64 = result.image.base64;
      const dataUrl = `data:image/png;base64,${base64}`;

      this.logger.debug("Image generated successfully");

      return { base64, dataUrl };
    } catch (error) {
      this.logger.error("Failed to generate image", error);
      throw new Error("Image generation failed");
    }
  }
}
