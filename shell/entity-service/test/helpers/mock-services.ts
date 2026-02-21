import type { IEmbeddingService } from "@brains/embedding-service";

/**
 * Mock embedding service that returns fixed 384-dim float arrays.
 * Shared across all entity-service tests that need an IEmbeddingService.
 */
export const mockEmbeddingService: IEmbeddingService = {
  generateEmbedding: async () => new Float32Array(384).fill(0.1),
  generateEmbeddings: async (texts: string[]) =>
    texts.map(() => new Float32Array(384).fill(0.1)),
};
