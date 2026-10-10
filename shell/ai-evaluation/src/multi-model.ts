/**
 * Multi-model eval support.
 *
 * Parses `models:` from brain.eval.yaml.
 * Resolves provider-specific API keys from env vars.
 */

import { selectTextProvider } from "@brains/ai-service";
import { z } from "@brains/utils/zod";

/** Independent runs per model; each sample boots its own environment. */
export const sampleCountSchema: z.ZodNumber = z.number().int().min(1);

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

/**
 * Extract the sample count from parsed YAML content.
 * Returns undefined if not set; throws on an invalid count.
 */
export function parseSamplesField(
  raw: Record<string, unknown>,
): number | undefined {
  const samples = raw["samples"];
  return samples === undefined ? undefined : sampleCountSchema.parse(samples);
}

/**
 * How many independent runs each model gets, and the share of a test's runs
 * that must pass. The CLI overrides brain.eval.yaml. Sampling needs the
 * `models:` path, which boots a fresh environment per run.
 */
export function resolveSampling(input: {
  multiModel: boolean;
  cliSamples?: number | undefined;
  yamlSamples?: number | undefined;
  minPassRate?: number | undefined;
}): { samples: number; minPassRate: number } {
  const samples = input.cliSamples ?? input.yamlSamples ?? 1;
  const minPassRate = input.minPassRate ?? 1;
  if (!input.multiModel && (samples > 1 || minPassRate < 1))
    throw new Error(
      "Repeated sampling requires a models: list in brain.eval.yaml",
    );
  return { samples, minPassRate };
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
