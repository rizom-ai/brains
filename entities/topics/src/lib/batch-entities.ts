import type { BaseEntity } from "@brains/plugins";

/**
 * Token budget for batch extraction.
 * Based on 128K context window (smallest common local model):
 *   128K - 20K (prompt + response headroom) = 108K available for content.
 */
export const DEFAULT_TOKEN_BUDGET = 108_000;

/**
 * Estimate token count from text.
 * Uses chars/4 approximation — good enough for batch sizing.
 * We're preventing overflow, not optimizing for the last token.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split entities into batches that fit within a token budget.
 *
 * Greedy packing: adds entities to the current batch until the next
 * one would exceed the budget, then starts a new batch.
 * Oversized entities (exceeding budget alone) get their own batch.
 * Preserves input order.
 */
export function batchEntities(
  entities: BaseEntity[],
  tokenBudget: number = DEFAULT_TOKEN_BUDGET,
): BaseEntity[][] {
  if (entities.length === 0) return [];

  const batches: BaseEntity[][] = [];
  let currentBatch: BaseEntity[] = [];
  let currentTokens = 0;

  for (const entity of entities) {
    const entityTokens = estimateTokens(entity.content);

    // Oversized entity: flush current batch, put entity in its own batch
    if (entityTokens > tokenBudget) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentTokens = 0;
      }
      batches.push([entity]);
      continue;
    }

    // Would exceed budget: flush and start new batch
    if (currentTokens + entityTokens > tokenBudget) {
      batches.push(currentBatch);
      currentBatch = [entity];
      currentTokens = entityTokens;
      continue;
    }

    // Fits: add to current batch
    currentBatch.push(entity);
    currentTokens += entityTokens;
  }

  // Flush remaining
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}
