/**
 * Resolve AI configuration from environment and brain.yaml overrides.
 *
 * Env vars:
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY — each
 *     provider's own key; a model runs only on a provider with one
 *   MODEL_RUNTIME_URL — the model runtime a deploy runs beside the brain
 *
 * The model fields determine the provider (resolved by AI service at runtime).
 */

import { readProviderKeys } from "@brains/core";
import { definedFields } from "@brains/utils/strip-undefined";
import { appAIConfigSchema, type AppAIConfig } from "./types";

/**
 * The app's AI settings: each provider's key from the environment, and the
 * models brain.yaml names. A setting that is absent or empty is left out.
 */
export function resolveAIConfig(
  env: Record<string, string | undefined>,
  overrides: Omit<AppAIConfig, "providerKeys"> = {},
): AppAIConfig {
  const providerKeys = readProviderKeys(env);
  // brain.yaml names the model runtime, or the deploy that runs one beside
  // the brain does.
  const modelRuntimeUrl = overrides.modelRuntimeUrl ?? env["MODEL_RUNTIME_URL"];
  // Models keep an explicit provider prefix ("openai:gpt-4o-mini"); the AI
  // service resolves the provider from it, or from the bare model name.
  return appAIConfigSchema.parse(
    definedFields({
      ...overrides,
      ...(Object.keys(providerKeys).length > 0 && { providerKeys }),
      ...(modelRuntimeUrl && { modelRuntimeUrl }),
    }),
  );
}
