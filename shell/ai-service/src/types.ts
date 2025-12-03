import type { z } from "@brains/utils";

/**
 * AI model configuration
 */
export interface AIModelConfig {
  model?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  webSearch?: boolean;
}

/**
 * Tool definition for AI tool calling (matches Vercel AI SDK tool structure)
 */
export interface AITool {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  execute: (args: unknown) => Promise<unknown>;
}

/**
 * Message format for multi-turn conversations
 */
export interface AIMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
}

/**
 * Tool call result
 */
export interface ToolCallResult {
  name: string;
  args: unknown;
  result: unknown;
}

/**
 * Options for generateWithTools
 */
export interface GenerateWithToolsOptions {
  system: string;
  messages: AIMessage[];
  tools: AITool[];
  maxSteps?: number;
}

/**
 * Result from generateWithTools
 */
export interface GenerateWithToolsResult {
  text: string;
  toolCalls: ToolCallResult[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
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

  generateWithTools(
    options: GenerateWithToolsOptions,
  ): Promise<GenerateWithToolsResult>;

  updateConfig(config: Partial<AIModelConfig>): void;

  getConfig(): AIModelConfig;
}
