/**
 * Multi-model eval support.
 *
 * Parses `models:` from brain.eval.yaml.
 * Resolves provider-specific API keys from env vars.
 */

import { selectTextProvider } from "@brains/ai-service";

/**
 * Extract the judge model from parsed YAML content.
 * Returns undefined if not set.
 */
export function parseJudgeField(
  raw: Record<string, unknown>,
): string | undefined {
  const judge = raw["judge"];
  return typeof judge === "string" ? judge : undefined;
}

/**
 * Extract the models array from parsed YAML content.
 * Returns empty array if no models field or invalid format.
 */
export function parseModelsField(raw: Record<string, unknown>): string[] {
  const models = raw["models"];
  if (!Array.isArray(models)) return [];
  return models.filter((m): m is string => typeof m === "string");
}

/** Provider → env var name */
const PROVIDER_ENV_VARS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

/**
 * Resolve the API key for a model from env vars.
 *
 * Detects provider from model name, returns the matching env var.
 * Falls back to AI_API_KEY. Returns undefined for local providers (ollama).
 */
export function resolveProviderKey(
  model: string,
  env: Record<string, string | undefined>,
): string | undefined {
  const provider = selectTextProvider(model);
  const envVar = PROVIDER_ENV_VARS[provider];

  // Local providers don't need a key
  if (!envVar) return undefined;

  return env[envVar] ?? env["AI_API_KEY"];
}
