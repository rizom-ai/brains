import { nanoid } from "nanoid";

/**
 * Create a unique ID for a database record
 */
export function createId(): string {
  return nanoid(12); // ~17 years to have 1% collision probability at 1K IDs/hour
}