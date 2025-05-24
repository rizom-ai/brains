import { cosineSimilarity } from "ai";

/**
 * Calculate cosine similarity between two embeddings
 * @param a First embedding
 * @param b Second embedding
 * @returns Similarity score between -1 and 1
 */
export function calculateCosineSimilarity(
  a: Float32Array,
  b: Float32Array,
): number {
  // Convert Float32Array to number array for the AI SDK
  return cosineSimilarity(Array.from(a), Array.from(b));
}
