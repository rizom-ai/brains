import { nanoid } from "nanoid";

/**
 * Create a unique ID for general use
 * Uses nanoid with 12 characters for a good balance of uniqueness and length
 * ~17 years to have 1% collision probability at 1K IDs/hour
 */
export function createId(): string {
  return nanoid(12);
}

/**
 * Create a prefixed unique ID
 * Useful for identifying different types of entities
 */
export function createPrefixedId(prefix: string): string {
  return `${prefix}_${nanoid(12)}`;
}

/**
 * Create a batch ID with timestamp for easier debugging and sorting
 */
export function createBatchId(): string {
  return `batch_${Date.now()}_${nanoid(8)}`;
}
