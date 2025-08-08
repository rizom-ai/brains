import { nanoid } from "nanoid";

/**
 * Create a unique ID for general use
 * Uses nanoid with configurable size (default 12 characters)
 * Default size gives ~17 years to have 1% collision probability at 1K IDs/hour
 * This wrapper allows for easy mocking in tests
 */
export function createId(size = 12): string {
  return nanoid(size);
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
