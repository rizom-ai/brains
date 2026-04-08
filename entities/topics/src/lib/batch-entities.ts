import type { BaseEntity } from "@brains/plugins";

/**
 * Token budget for batch extraction.
 * TODO: Replace this with model-dependent sizing instead of a fixed global budget.
 */
export const DEFAULT_TOKEN_BUDGET = 108_000;
export const PROMPT_OVERHEAD_RESERVE = 0;

/**
 * Estimate token count from text.
 * Uses chars/4 approximation — good enough for batch sizing.
 * We're preventing overflow, not optimizing for the last token.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateEntityBatchTokens(entity: BaseEntity, index: number): number {
  const metaTitle = entity.metadata["title"];
  const title = typeof metaTitle === "string" ? metaTitle : entity.id;
  const type =
    entity.entityType.charAt(0).toUpperCase() + entity.entityType.slice(1);
  const header = `---\n[${index}] ${type}: ${title}\n\n`;

  return estimateTokens(header) + estimateTokens(entity.content) + 1;
}

export function estimateBatchPromptTokens(entities: BaseEntity[]): number {
  return entities.reduce(
    (sum, entity, index) => sum + estimateEntityBatchTokens(entity, index + 1),
    0,
  );
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

  const contentBudget = Math.max(1, tokenBudget - PROMPT_OVERHEAD_RESERVE);
  const batches: BaseEntity[][] = [];
  let currentBatch: BaseEntity[] = [];
  let currentTokens = 0;

  for (const entity of entities) {
    const entityTokens = estimateEntityBatchTokens(
      entity,
      currentBatch.length + 1,
    );

    // Oversized entity: flush current batch, put entity in its own batch
    if (entityTokens > contentBudget) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentTokens = 0;
      }
      batches.push([entity]);
      continue;
    }

    // Would exceed budget: flush and start new batch
    if (currentTokens + entityTokens > contentBudget) {
      batches.push(currentBatch);
      currentBatch = [entity];
      currentTokens = estimateEntityBatchTokens(entity, 1);
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
