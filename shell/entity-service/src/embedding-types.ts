/**
 * Token usage from an embedding API call
 */
export interface EmbeddingUsage {
  tokens: number;
}

/**
 * Result of a single embedding call
 */
export interface EmbeddingResult {
  embedding: Float32Array;
  usage: EmbeddingUsage;
}

/**
 * Result of a batch embedding call
 */
export interface BatchEmbeddingResult {
  embeddings: Float32Array[];
  usage: EmbeddingUsage;
}

/**
 * Interface for embedding service
 */
export interface IEmbeddingService {
  /** Vector dimensions produced by this provider */
  readonly dimensions: number;
  generateEmbedding(text: string): Promise<EmbeddingResult>;
  generateEmbeddings(texts: string[]): Promise<BatchEmbeddingResult>;
}
