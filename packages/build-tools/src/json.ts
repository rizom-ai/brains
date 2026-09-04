/**
 * JSON object helpers.
 *
 * build-tools has no dependencies on purpose, so these are local rather than
 * reusing @brains/utils. The point is the same: `JSON.parse` returns `any`, and
 * a manifest read off disk should be checked before its fields are trusted.
 */

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse `text` and require it to be a JSON object, naming `label` on failure. */
export function parseJsonObject(
  text: string,
  label: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
  if (!isJsonObject(parsed)) {
    throw new Error(`${label} is not a JSON object`);
  }
  return parsed;
}
