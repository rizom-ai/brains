import { generateText, generateObject } from "ai";
import type { LanguageModel } from "ai";
import type { Logger } from "@brains/utils";
import type { z } from "@brains/utils";
import type {
  AIModelConfig,
  IAIService,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "./types";
import { selectTextProvider } from "./provider-selection";
import {
  canGenerateImages,
  createProviderClients,
  getLanguageModel,
  type ProviderClients,
} from "./provider-clients";
import { generateImageResult } from "./image-generation";
import {
  getTextGenerationOptions,
  toTokenUsage,
  withAIModelDefaults,
  type TokenUsage,
} from "./generation-options";

/**
 * AI Service for generating responses using Vercel AI SDK
 */
export class AIService implements IAIService {
  private static instance: AIService | null = null;
  private config: AIModelConfig;
  private logger: Logger;
  private providers: ProviderClients;

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
    this.config = withAIModelDefaults(config);
    this.logger = logger.child("AIService");
    this.providers = createProviderClients(this.config);
  }

  /**
   * Get the language model instance for the configured provider.
   */
  public getModel(): LanguageModel {
    return getLanguageModel(this.providers, this.requireTextModel());
  }

  /**
   * Generate text response
   */
  public async generateText(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<{
    text: string;
    usage: TokenUsage;
  }> {
    this.logger.debug("Generating text response", {
      model: this.config.model,
    });

    try {
      const result = await generateText({
        model: this.getModel(),
        system: systemPrompt,
        prompt: userPrompt,
        ...getTextGenerationOptions(this.config),
      });

      const usage = toTokenUsage(result.usage);

      this.logUsage("text_generation", usage);

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
    usage: TokenUsage;
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
        ...getTextGenerationOptions(this.config),
        providerOptions: {
          anthropic: { structuredOutputMode: "jsonTool" },
        },
      });

      const usage = toTokenUsage(result.usage);

      this.logUsage("object_generation", usage);

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
    this.config = withAIModelDefaults({ ...this.config, ...config });
    this.providers = createProviderClients(this.config);
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
    return canGenerateImages(this.providers);
  }

  /**
   * Generate an image from a text prompt
   */
  public async generateImage(
    prompt: string,
    options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResult> {
    return generateImageResult(
      prompt,
      this.config.imageModel,
      options,
      this.providers,
      this.logger,
    );
  }

  private logUsage(operation: string, usage: TokenUsage): void {
    this.logger.info("ai:usage", {
      operation,
      provider: selectTextProvider(this.config.model),
      model: this.config.model,
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
    });
  }

  private requireTextModel(): string {
    if (!this.config.model) {
      throw new Error(
        "AI text model is not configured. Set a model in the brain definition or brain.yaml.",
      );
    }

    return this.config.model;
  }
}
