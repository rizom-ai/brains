/**
 * Resolve AI provider and model ID from a model string.
 *
 * Supports:
 * - Auto-detection: "gpt-4o-mini" → openai, "claude-haiku" → anthropic
 * - Explicit prefix: "openai:gpt-4o-mini", "ollama:llama3.2", "groq:llama-3.1-70b"
 * - Any provider works with explicit prefix — no hardcoded list
 * - Unknown model names without prefix default to openai
 */

export interface ResolvedProvider {
  provider: string;
  modelId: string;
}

/** Known model name prefixes → provider auto-detection */
const MODEL_PATTERNS: Array<[RegExp, string]> = [
  [/^claude/, "anthropic"],
  [/^gpt-/, "openai"],
  [/^o[13]-/, "openai"],
  [/^gemini/, "google"],
  [/^llama/, "ollama"],
  [/^mistral/, "ollama"],
  [/^phi-/, "ollama"],
  [/^qwen/, "ollama"],
];

/** Known provider → required env var */
const PROVIDER_ENV_VARS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

export function resolveProvider(model: string): ResolvedProvider {
  // Explicit prefix: "provider:modelId"
  const colonIdx = model.indexOf(":");
  if (colonIdx > 0) {
    return {
      provider: model.slice(0, colonIdx),
      modelId: model.slice(colonIdx + 1),
    };
  }

  // Auto-detect from model name
  for (const [pattern, provider] of MODEL_PATTERNS) {
    if (pattern.test(model)) {
      return { provider, modelId: model };
    }
  }

  // Default to openai
  return { provider: "openai", modelId: model };
}

/**
 * Get the required env var name for a provider.
 * Returns undefined for providers that don't need an API key (ollama, local).
 */
export function getRequiredEnvVar(provider: string): string | undefined {
  return PROVIDER_ENV_VARS[provider];
}
