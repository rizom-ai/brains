/**
 * Interface for embedding service
 */
export interface IEmbeddingService {
  generateEmbedding(text: string): Promise<Float32Array>;
  generateEmbeddings(texts: string[]): Promise<Float32Array[]>;
}
