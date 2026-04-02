/**
 * Multi-model eval support.
 *
 * Parses `models:` and `keys:` fields from brain.eval.yaml.
 * Provides utilities for running the eval suite against multiple models
 * with per-provider API key resolution.
 */

import { selectTextProvider } from "@brains/ai-service";

/**
 * Extract the models array from parsed YAML content.
 * Returns empty array if no models field or invalid format.
 */
export function parseModelsField(raw: Record<string, unknown>): string[] {
  const models = raw["models"];
  if (!Array.isArray(models)) return [];
  return models.filter((m): m is string => typeof m === "string");
}

/**
 * Extract the keys map from parsed YAML content.
 * Maps provider name → API key string.
 * Returns empty object if no keys field or invalid format.
 */
export function parseKeysField(
  raw: Record<string, unknown>,
): Record<string, string> {
  const keys = raw["keys"];
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) return {};

  const result: Record<string, string> = {};
  for (const [provider, value] of Object.entries(
    keys as Record<string, unknown>,
  )) {
    if (typeof value === "string") {
      result[provider] = value;
    }
  }
  return result;
}

/**
 * Resolve the API key for a model.
 *
 * Detects the provider from the model string, looks it up in the keys map,
 * and falls back to the default key (AI_API_KEY from env) if not found.
 */
export function resolveApiKey(
  model: string,
  keys: Record<string, string>,
  defaultKey: string | undefined,
): string | undefined {
  const provider = selectTextProvider(model);
  return keys[provider] ?? defaultKey;
}
