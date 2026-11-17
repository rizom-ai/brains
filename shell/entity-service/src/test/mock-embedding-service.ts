import type { IEmbeddingService } from "../embedding-types";

export const MOCK_EMBEDDING_DIMENSIONS = 1536;

const identity: IEmbeddingService["identity"] = {
  model: "test:mock",
  dimensions: MOCK_EMBEDDING_DIMENSIONS,
  promptRevision: 0,
};

const fixedVector = (): Float32Array =>
  new Float32Array(MOCK_EMBEDDING_DIMENSIONS).fill(0.1);

/**
 * An embedding service that reaches no provider: every text gets the same
 * vector, at the dimensions of the default embedding model.
 */
export function createMockEmbeddingService(): IEmbeddingService {
  return {
    identity,
    embedQuery: async () => ({
      embedding: fixedVector(),
      usage: { tokens: 10 },
    }),
    embedDocuments: async (texts) => ({
      embeddings: texts.map(fixedVector),
      usage: { tokens: texts.length * 10 },
    }),
  };
}

/**
 * An embedding service for a test that must embed nothing: any call to it
 * is the failure.
 */
export function createRefusingEmbeddingService(): IEmbeddingService {
  const refuse = async (): Promise<never> => {
    throw new Error("Unexpected embedding");
  };
  return { identity, embedQuery: refuse, embedDocuments: refuse };
}
