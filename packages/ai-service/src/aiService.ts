import { generateText, generateObject } from "ai";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV1 } from "@ai-sdk/provider";
import type { Logger } from "@brains/utils";
import type { AIService as IAIService, AIModelConfig } from "@brains/types";
import type { z } from "zod";

/**
 * Default model configuration
 */
const DEFAULT_MODEL = "claude-4-sonnet-20250514";

/**
 * AI Service for generating responses using Vercel AI SDK
 */
export class AIService implements IAIService {
  private static instance: AIService | null = null;
  private config: AIModelConfig;
  private logger: Logger;
  private anthropicProvider;

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
    };
    this.logger = logger.child("AIService");

    // Create provider with API key if provided
    this.anthropicProvider = config.apiKey
      ? createAnthropic({ apiKey: config.apiKey })
      : anthropic;
  }

  /**
   * Get the Anthropic model instance
   */
  private getModel(): LanguageModelV1 {
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
      });

      return {
        text: result.text,
        usage: {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
        },
      };
    } catch (error) {
      this.logger.error("Failed to generate text", error);
      throw new Error(`AI generation failed: ${error}`);
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
      });

      return {
        object: result.object,
        usage: {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
        },
      };
    } catch (error) {
      this.logger.error("Failed to generate object", error);
      throw new Error(`AI object generation failed: ${error}`);
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
}