export { EmbeddingService } from "./embeddingService";
export type { IEmbeddingService } from "./types";

// Export error classes
export {
  EmbeddingGenerationError,
  EmbeddingServiceUnavailableError,
  EmbeddingCacheError,
  InvalidEmbeddingDimensionsError,
  EmbeddingModelConfigError,
  EmbeddingRateLimitError,
} from "./errors";
