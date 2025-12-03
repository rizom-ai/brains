/**
 * AI Service Package
 *
 * Provides AI text and object generation capabilities using Vercel AI SDK.
 * Extracted from @brains/core for better modularity and reusability.
 */

export { AIService } from "./aiService";

// Export types
export type {
  AIModelConfig,
  AIService as IAIService,
  AITool,
  AIMessage,
  ToolCallResult,
  GenerateWithToolsOptions,
  GenerateWithToolsResult,
} from "./types";
