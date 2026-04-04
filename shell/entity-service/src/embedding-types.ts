/**
 * Interface for embedding service
 */
export interface IEmbeddingService {
  /** Vector dimensions produced by this provider */
  readonly dimensions: number;
  generateEmbedding(text: string): Promise<Float32Array>;
  generateEmbeddings(texts: string[]): Promise<Float32Array[]>;
}
