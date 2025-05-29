/**
 * AI Resource Adapters - Common Interfaces
 * 
 * This module defines common interfaces for AI resource adapters,
 * establishing a consistent pattern for different AI service implementations.
 */

// AI interfaces for model and embedding adapters

/**
 * Base usage information for AI model calls
 */
export interface ModelUsage {
  /** Number of tokens in the input/prompt */
  inputTokens: number;
  /** Number of tokens in the output/completion */
  outputTokens: number;
}

/**
 * Generic response interface for AI model operations
 */
export interface ModelResponse<T = unknown> {
  /** The structured response object */
  object: T;
  /** Token usage information */
  usage: ModelUsage;
}

/**
 * Base interface for Language Model adapters
 */
export interface LanguageModelAdapter<_ModelOptions = unknown, CompleteOptions = unknown> {
  /**
   * Send a completion request to the language model
   * 
   * @param options Options for the completion request
   * @returns A promise resolving to the model response
   */
  complete<T>(options: CompleteOptions): Promise<ModelResponse<T>>;
}

/**
 * Base interface for Embedding Model adapters
 */
export interface EmbeddingModelAdapter<_ModelOptions = unknown> {
  /**
   * Generate an embedding for a single text
   * 
   * @param text The text to embed
   * @returns A promise resolving to the embedding vector
   */
  getEmbedding(text: string): Promise<number[]>;
  
  /**
   * Generate embeddings for multiple texts
   * 
   * @param texts Array of texts to embed
   * @returns A promise resolving to an array of embedding vectors
   */
  getBatchEmbeddings(texts: string[]): Promise<number[][]>;
  
  /**
   * Calculate similarity between two embedding vectors
   * 
   * @param vec1 First embedding vector
   * @param vec2 Second embedding vector
   * @returns Similarity score (typically -1 to 1)
   */
  calculateSimilarity(vec1: number[], vec2: number[]): number;
}

/**
 * Default response type for language models
 * Used as the default generic parameter for ModelResponse
 */
export interface DefaultResponseType {
  /** The generated text response */
  answer: string;
}

/**
 * Standard options for completion requests
 */
export interface CompleteOptions {
  /** System prompt to set context */
  systemPrompt?: string;
  /** User prompt/query */
  userPrompt: string;
  /** Optional maximum tokens to generate */
  maxTokens?: number;
  /** Optional temperature (0-1) */
  temperature?: number;
}