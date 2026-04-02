/**
 * Multi-model eval support.
 *
 * Parses the `models:` field from brain.eval.yaml and provides
 * utilities for running the eval suite against multiple models.
 */

/**
 * Extract the models array from parsed YAML content.
 * Returns empty array if no models field or invalid format.
 */
export function parseModelsField(raw: Record<string, unknown>): string[] {
  const models = raw["models"];
  if (!Array.isArray(models)) return [];
  return models.filter((m): m is string => typeof m === "string");
}
