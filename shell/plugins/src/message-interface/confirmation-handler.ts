/**
 * Confirmation Handler - Shared utility for parsing confirmation responses
 *
 * Provides consistent confirmation parsing across all message-based interfaces
 * (CLI, Matrix, etc.) with support for various affirmative and negative responses.
 */

/**
 * Positive confirmation responses (case-insensitive)
 */
const POSITIVE_RESPONSES = new Set([
  "yes",
  "y",
  "ok",
  "sure",
  "proceed",
  "confirm",
  "go",
]);

/**
 * Negative confirmation responses (case-insensitive)
 */
const NEGATIVE_RESPONSES = new Set([
  "no",
  "n",
  "cancel",
  "abort",
  "stop",
  "nope",
]);

/**
 * Parse a user's response to a confirmation prompt
 *
 * @param input - The user's input string
 * @returns `{ confirmed: true }` for positive responses,
 *          `{ confirmed: false }` for negative responses,
 *          or `undefined` if the response is not recognized
 */
export function parseConfirmationResponse(
  input: string,
): { confirmed: boolean } | undefined {
  const normalized = input.toLowerCase().trim();

  if (normalized === "") {
    return undefined;
  }

  if (POSITIVE_RESPONSES.has(normalized)) {
    return { confirmed: true };
  }

  if (NEGATIVE_RESPONSES.has(normalized)) {
    return { confirmed: false };
  }

  return undefined;
}
