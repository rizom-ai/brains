/**
 * AI Service Package
 *
 * Provides AI text and object generation capabilities using Vercel AI SDK.
 * Extracted from @brains/shell for better modularity and reusability.
 */

export { AIService } from "./aiService";

// Export types
export type { AIService as IAIService, AIModelConfig } from "./types";

// Export error classes
export {
  ModelNotAvailableError,
  GenerationTimeoutError,
  TokenLimitError,
  ModelConfigError,
  GenerationFailureError,
  RateLimitError,
  AuthenticationError,
} from "./errors";
