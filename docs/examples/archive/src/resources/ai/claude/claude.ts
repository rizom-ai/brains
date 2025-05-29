/**
 * Claude Language Model Adapter
 * 
 * This module provides an adapter for the Claude language model using the Vercel AI SDK.
 * It follows the Component Interface Standardization pattern and implements the LanguageModelAdapter interface.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject, type LanguageModelUsage } from 'ai';
import { z } from 'zod';

import { aiConfig } from '@/config';
import type { ModelResponse, ModelUsage } from '@/resources/ai/interfaces';
import logger from '@/utils/logger';

// Define the default schema for text responses
export const textSchema = z.object({
  answer: z.string(),
});

// Type alias for the default response type inferred from the schema
export type DefaultResponseType = z.infer<typeof textSchema>;

/**
 * Configuration options for ClaudeModel
 */
export interface ClaudeModelOptions {
  /** Model to use (e.g., "claude-3-7-sonnet-20250219") */
  model: string;
  /** API key for Anthropic */
  apiKey: string;
  /** Default max tokens for responses */
  defaultMaxTokens: number;
  /** Default temperature for sampling (0-1, lower = more deterministic) */
  defaultTemperature: number;
}

/**
 * Options for completion requests
 * Generic T represents the type that will be returned by the schema
 */
export interface CompleteOptions<T = DefaultResponseType> {
  /** Schema defining the expected return structure (defaults to textSchema) */
  schema?: z.ZodType<T>;
  /** System prompt to set context */
  systemPrompt: string;
  /** User prompt/question */
  userPrompt: string;
  /** Maximum tokens in the response (defaults to aiConfig.anthropic.defaultMaxTokens) */
  maxTokens?: number;
  /** Temperature for sampling (0-1, lower = more deterministic) */
  temperature?: number;
}

/**
 * Claude Language Model client wrapper
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

export class ClaudeModel {
  /**
   * Singleton instance of ClaudeModel
   * This property should be accessed only by getInstance(), resetInstance(), and createFresh()
   */
  private static instance: ClaudeModel | null = null;
  
  private readonly model: string;
  private readonly apiKey: string;
  private readonly defaultMaxTokens: number;
  private readonly defaultTemperature: number;

  /**
   * Get the singleton instance of ClaudeModel
   * 
   * Part of the Component Interface Standardization pattern.
   * 
   * @returns The singleton instance
   */
  public static getInstance(): ClaudeModel {
    if (!ClaudeModel.instance) {
      // Get configuration from imported config
      const options: ClaudeModelOptions = {
        model: aiConfig.anthropic.defaultModel,
        apiKey: aiConfig.anthropic.apiKey,
        defaultMaxTokens: aiConfig.anthropic.defaultMaxTokens,
        defaultTemperature: aiConfig.anthropic.temperature,
      };
      
      ClaudeModel.instance = new ClaudeModel(options);
      logger.debug('ClaudeModel singleton instance created');
    }
    
    return ClaudeModel.instance;
  }

  /**
   * Reset the singleton instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Primarily used for testing to ensure a clean state.
   */
  public static resetInstance(): void {
    ClaudeModel.instance = null;
    logger.debug('ClaudeModel singleton instance reset');
  }
  
  /**
   * Create a fresh instance without affecting the singleton
   * 
   * Part of the Component Interface Standardization pattern.
   * Primarily used for testing to create isolated instances.
   * 
   * @param options Optional configuration options (overrides defaults)
   * @returns A new ClaudeModel instance
   */
  public static createFresh(options?: Partial<ClaudeModelOptions>): ClaudeModel {
    logger.debug('Creating fresh ClaudeModel instance');
    
    // Get default configuration from config
    const defaultOptions: ClaudeModelOptions = {
      model: aiConfig.anthropic.defaultModel,
      apiKey: aiConfig.anthropic.apiKey,
      defaultMaxTokens: aiConfig.anthropic.defaultMaxTokens,
      defaultTemperature: aiConfig.anthropic.temperature,
    };
    
    // Merge with provided options
    const mergedOptions: ClaudeModelOptions = {
      ...defaultOptions,
      ...options,
    };
    
    return new ClaudeModel(mergedOptions);
  }

  /**
   * Private constructor to enforce factory method usage
   * 
   * Part of the Component Interface Standardization pattern.
   * Users should call getInstance() or createFresh() instead.
   * 
   * @param options Configuration options
   */
  private constructor(options: ClaudeModelOptions) {
    // Initialize parameters from required options
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.defaultMaxTokens = options.defaultMaxTokens;
    this.defaultTemperature = options.defaultTemperature;
    
    logger.debug(`Claude model initialized with model: ${this.model}`);
  }

  /**
   * Send a completion request to Claude and return a structured response
   * 
   * All responses use a schema for consistency. If no schema is provided,
   * the default schema for { answer: string } is used.
   * 
   * @param options Completion options including optional schema
   * @returns Model response with structured object and token usage
   */
  async complete<T = DefaultResponseType>(
    options: CompleteOptions<T>,
  ): Promise<ModelResponse<T>> {
    try {
      // Use the provided schema or default to textSchema
      const schema = options.schema || (textSchema as unknown as z.ZodType<T>);
      
      // Generate structured object using the Vercel AI SDK
      const anthropicProvider = createAnthropic({
        apiKey: this.apiKey,
      });
      
      const response = await generateObject({
        model: anthropicProvider(this.model),
        system: options.systemPrompt,
        prompt: options.userPrompt,
        schema,
        temperature: options.temperature ?? this.defaultTemperature,
        maxTokens: options.maxTokens ?? this.defaultMaxTokens,
      });
      
      // Map usage from the AI SDK to our internal format
      const mappedUsage = this.mapUsage(response.usage);
      
      return {
        object: response.object as T,
        usage: mappedUsage,
      };
    } catch (error) {
      logger.error(`Error calling Claude API: ${error}`);
      throw error;
    }
  }
  
  /**
   * Map SDK usage object to our internal format
   * @param usage The AI SDK usage object
   * @returns Our internal usage format
   */
  private mapUsage(usage?: LanguageModelUsage): ModelUsage {
    if (!usage) {
      return { inputTokens: 0, outputTokens: 0 };
    }
    
    // The AI SDK usage object structure is different, so we need to map it
    // The 'prompt' tokens are the input, and the 'completion' tokens are the output
    return {
      inputTokens: usage.promptTokens ?? 0,
      outputTokens: usage.completionTokens ?? 0,
    };
  }
}