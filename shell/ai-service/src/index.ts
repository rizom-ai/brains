/**
 * AI Service Package
 *
 * Provides AI text and object generation capabilities using Vercel AI SDK.
 * Extracted from @brains/core for better modularity and reusability.
 */

export { AIService } from "./aiService";

// Re-export from ai SDK for use by agent-service
export { ToolLoopAgent, stepCountIs, dynamicTool } from "ai";
export type { LanguageModel, ToolSet, ModelMessage } from "ai";

// Export types
export type {
  AIModelConfig,
  IAIService,
  ImageProvider,
  AspectRatio,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "./types";
