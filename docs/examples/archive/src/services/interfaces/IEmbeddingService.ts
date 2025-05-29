/**
 * Interface for embedding services
 * Provides methods for generating and working with embeddings
 */

/**
 * Base embedding service interface
 */
export interface IEmbeddingService {
  /**
   * Generate embedding for text
   * @param text Text to generate embedding for
   */
  generateEmbedding(text: string): Promise<number[]>;
  
  /**
   * Calculate similarity between two embeddings
   * @param embedding1 First embedding
   * @param embedding2 Second embedding
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number;
}