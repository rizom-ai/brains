import type { z } from "@brains/utils";

/**
 * AI model configuration
 */
export interface AIModelConfig {
  model?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * AI Service interface for generating text and structured objects
 */
export interface AIService {
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
}
