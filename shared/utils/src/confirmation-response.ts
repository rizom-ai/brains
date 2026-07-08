/**
 * Shared yes/no parser for confirmation flows.
 *
 * Keep this intentionally strict: it only classifies short, explicit
 * confirmation responses and leaves broader message interpretation to callers.
 */

/**
 * Positive confirmation responses (case-insensitive).
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
 * Negative confirmation responses (case-insensitive).
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
 * Parse a user's response to a confirmation prompt.
 *
 * @returns `{ confirmed: true }` for positive responses,
 *          `{ confirmed: false }` for negative responses,
 *          or `undefined` if the response is not recognized.
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
