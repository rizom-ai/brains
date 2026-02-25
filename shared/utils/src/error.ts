/**
 * Extract a human-readable error message from an unknown error value.
 * Handles Error objects, strings, and other types.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
