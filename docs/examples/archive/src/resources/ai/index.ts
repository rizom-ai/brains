/**
 * AI Resources Layer
 * 
 * This module exports AI-related resource adapters and interfaces,
 * providing a clean abstraction for the various AI services used in the application.
 * 
 * PUBLIC API: These exports are intended for use by upstream consumers
 */

// Export Claude language model adapter
export { ClaudeModel } from './claude';

// Export embedding service
export { EmbeddingService } from './embedding';

// Export interfaces
export type { 
  LanguageModelAdapter,
  EmbeddingModelAdapter,
  ModelResponse,
  ModelUsage,
  CompleteOptions,
  DefaultResponseType,
} from './interfaces';