/**
 * Extract a human-readable error message from an unknown error value.
 * Handles Error objects, strings, and other types.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Coerce an unknown thrown value to an Error instance, preserving the
 * original when it's already an Error so stack traces and subclasses
 * survive rethrow.
 */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
