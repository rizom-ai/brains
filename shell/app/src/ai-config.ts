/**
 * Resolve AI configuration from environment and brain.yaml overrides.
 *
 * Two env vars:
 *   AI_API_KEY   — primary key for text generation (and images if no override)
 *   AI_IMAGE_KEY — optional override for image generation (different provider)
 *
 * The model field determines the text provider.
 */

/** Model name patterns → provider auto-detection */
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

function detectProvider(model: string): { provider: string; modelId: string } {
  const colonIdx = model.indexOf(":");
  if (colonIdx > 0) {
    return {
      provider: model.slice(0, colonIdx),
      modelId: model.slice(colonIdx + 1),
    };
  }

  for (const [pattern, provider] of MODEL_PATTERNS) {
    if (pattern.test(model)) {
      return { provider, modelId: model };
    }
  }

  return { provider: "openai", modelId: model };
}

/** Fields that resolveAIConfig adds to AppConfig */
export interface AIConfigFields {
  aiApiKey?: string;
  aiImageKey?: string;
  aiModel?: string;
  aiProvider?: string;
}

export function resolveAIConfig(
  env: Record<string, string | undefined>,
  overrides?: { model?: string },
): AIConfigFields {
  const apiKey = env["AI_API_KEY"];
  const imageKey = env["AI_IMAGE_KEY"];

  const result: AIConfigFields = {};

  if (apiKey) {
    result.aiApiKey = apiKey;
  }
  if (imageKey) {
    result.aiImageKey = imageKey;
  }

  if (overrides?.model) {
    const { provider, modelId } = detectProvider(overrides.model);
    result.aiModel = modelId;
    result.aiProvider = provider;
  }

  return result;
}
