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
 * What makes vectors comparable: the model, its output size and the text it
 * was given. The index stores it; vectors of another identity are dropped.
 */
export interface EmbeddingIdentity {
  /** Canonical `provider:model` */
  model: string;
  dimensions: number;
  promptRevision: number;
}

/** A document to index: its content and, when it has one, its title. */
export interface EmbeddingDocument {
  title?: string | undefined;
  content: string;
}

/**
 * Interface for embedding service. Queries and documents are embedded apart,
 * since a model may frame each differently.
 */
export interface IEmbeddingService {
  readonly identity: EmbeddingIdentity;
  embedQuery(text: string, signal?: AbortSignal): Promise<EmbeddingResult>;
  embedDocuments(
    documents: EmbeddingDocument[],
    signal?: AbortSignal,
  ): Promise<BatchEmbeddingResult>;
}
