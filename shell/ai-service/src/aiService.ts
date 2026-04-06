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
  AspectRatio,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "./types";
import { selectTextProvider, selectImageProvider } from "./provider-selection";

/**
 * Default model configuration
 */
const DEFAULT_MODEL = "gpt-4.1";

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

    const provider = selectTextProvider(this.config.model);
    const imageKey = config.imageApiKey ?? config.apiKey;

    this.anthropicProvider = config.apiKey
      ? createAnthropic({ apiKey: config.apiKey })
      : anthropic;

    if (provider === "openai" && config.apiKey) {
      this.openaiProvider = createOpenAI({ apiKey: config.apiKey });
    } else if (imageKey) {
      this.openaiProvider = createOpenAI({ apiKey: imageKey });
    }

    if (provider === "google" && config.apiKey) {
      this.googleProvider = createGoogleGenerativeAI({
        apiKey: config.apiKey,
      });
    } else if (imageKey) {
      this.googleProvider = createGoogleGenerativeAI({
        apiKey: imageKey,
      });
    }
  }

  /**
   * Get the language model instance for the configured provider.
   */
  public getModel(): LanguageModel {
    const { model } = this.config;
    const modelId = model ?? DEFAULT_MODEL;
    const provider = selectTextProvider(modelId);

    if (provider === "openai" && this.openaiProvider) {
      return this.openaiProvider(modelId) as LanguageModel;
    }

    if (provider === "google" && this.googleProvider) {
      return this.googleProvider(modelId) as LanguageModel;
    }

    // Default: anthropic
    return this.anthropicProvider(modelId);
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

      const usage = {
        promptTokens: result.usage.inputTokens ?? 0,
        completionTokens: result.usage.outputTokens ?? 0,
        totalTokens: result.usage.totalTokens ?? 0,
      };

      this.logger.info("ai:usage", {
        operation: "text_generation",
        provider: selectTextProvider(this.config.model),
        model: this.config.model,
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
      });

      return { text: result.text, usage };
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

      const usage = {
        promptTokens: result.usage.inputTokens ?? 0,
        completionTokens: result.usage.outputTokens ?? 0,
        totalTokens: result.usage.totalTokens ?? 0,
      };

      this.logger.info("ai:usage", {
        operation: "object_generation",
        provider: selectTextProvider(this.config.model),
        model: this.config.model,
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
      });

      return { object: result.object as T, usage };
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
   * Generate an image from a text prompt
   */
  public async generateImage(
    prompt: string,
    options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResult> {
    const { provider, modelId } = selectImageProvider(this.config.imageModel);

    if (provider === "openai" && !this.openaiProvider) {
      throw new Error(
        "Image generation not available: no OpenAI API key configured",
      );
    }
    if (provider === "google" && !this.googleProvider) {
      throw new Error(
        "Image generation not available: no Google API key configured",
      );
    }

    this.logger.debug("Generating image", {
      prompt: prompt.slice(0, 100),
      provider,
      model: modelId,
    });

    try {
      const aspectRatio: AspectRatio = options?.aspectRatio ?? "16:9";
      const result =
        provider === "google"
          ? await this.generateImageWithGoogle(prompt, aspectRatio, modelId)
          : await this.generateImageWithOpenAI(prompt, aspectRatio, modelId);

      const base64 = result.image.base64;
      const dataUrl = `data:image/png;base64,${base64}`;

      this.logger.debug("Image generated successfully", {
        provider,
        model: modelId,
      });

      return { base64, dataUrl };
    } catch (error) {
      this.logger.error("Failed to generate image", error);
      throw new Error("Image generation failed");
    }
  }

  private async generateImageWithOpenAI(
    prompt: string,
    aspectRatio: AspectRatio,
    modelId: string,
  ): Promise<{ image: { base64: string } }> {
    if (!this.openaiProvider) {
      throw new Error("OpenAI provider not configured");
    }
    return generateImage({
      model: this.openaiProvider.image(modelId),
      prompt,
      size: ASPECT_RATIO_TO_OPENAI_SIZE[aspectRatio],
      providerOptions: {
        openai: { quality: "medium" },
      },
    });
  }

  private async generateImageWithGoogle(
    prompt: string,
    aspectRatio: AspectRatio,
    modelId: string,
  ): Promise<{ image: { base64: string } }> {
    if (!this.googleProvider) {
      throw new Error("Google provider not configured");
    }
    return generateImage({
      model: this.googleProvider.image(modelId),
      prompt,
      aspectRatio,
    });
  }
}

/**
 * Mapping from aspect ratio to OpenAI GPT Image pixel sizes
 */
const ASPECT_RATIO_TO_OPENAI_SIZE: Record<
  AspectRatio,
  "1024x1024" | "1536x1024" | "1024x1536"
> = {
  "1:1": "1024x1024",
  "16:9": "1536x1024",
  "9:16": "1024x1536",
  "4:3": "1536x1024",
  "3:4": "1024x1536",
};
