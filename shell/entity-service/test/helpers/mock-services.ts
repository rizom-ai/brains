import type { IEmbeddingService } from "../../src/embedding-types";

export const MOCK_DIMENSIONS = 1536;

/**
 * Mock embedding service that returns fixed-dimension float arrays.
 * Matches OpenAI text-embedding-3-small dimensions.
 */
export const mockEmbeddingService: IEmbeddingService = {
  dimensions: MOCK_DIMENSIONS,
  generateEmbedding: async () => ({
    embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
    usage: { tokens: 10 },
  }),
  generateEmbeddings: async (texts: string[]) => ({
    embeddings: texts.map(() => new Float32Array(MOCK_DIMENSIONS).fill(0.1)),
    usage: { tokens: texts.length * 10 },
  }),
};
