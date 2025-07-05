import type { AIService as IAIService } from "@brains/types";

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
 * Extends the public interface (currently identical)
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AIService extends IAIService {
  // Currently identical to public interface - no additional methods needed
}
