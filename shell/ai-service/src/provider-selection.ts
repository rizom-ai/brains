/**
 * Model name patterns → provider auto-detection.
 */
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

/**
 * Select the text generation provider from a model string.
 *
 * Supports:
 * - Auto-detection from model name: "gpt-4o-mini" → "openai"
 * - Explicit prefix: "openai:gpt-4o-mini" → "openai"
 * - No model: defaults to "anthropic"
 *
 * Pure function — no SDK imports, no side effects.
 */
/**
 * Parse explicit provider prefix from a model string.
 * "openai:gpt-4o-mini" → { provider: "openai", modelId: "gpt-4o-mini" }
 * "gpt-4o-mini" → null (no prefix)
 */
function parseProviderPrefix(
  model: string,
): { provider: string; modelId: string } | null {
  const colonIdx = model.indexOf(":");
  if (colonIdx > 0) {
    return {
      provider: model.slice(0, colonIdx),
      modelId: model.slice(colonIdx + 1),
    };
  }
  return null;
}

export function selectTextProvider(model?: string): string {
  if (!model) return "anthropic";

  const explicit = parseProviderPrefix(model);
  if (explicit) return explicit.provider;

  for (const [pattern, provider] of MODEL_PATTERNS) {
    if (pattern.test(model)) return provider;
  }

  return "anthropic";
}

/**
 * Image model patterns → provider auto-detection.
 */
const IMAGE_MODEL_PATTERNS: Array<[RegExp, string]> = [
  [/^gpt-image/, "openai"],
  [/^dall-e/, "openai"],
  [/^gemini/, "google"],
];

const DEFAULT_IMAGE_MODEL = "gpt-image-1.5";

/**
 * Select the image generation provider from a model string.
 *
 * Returns both the provider and the resolved model ID.
 * Falls back to OpenAI with gpt-image-1.5 if no model specified.
 */
export function selectImageProvider(model?: string): {
  provider: string;
  modelId: string;
} {
  if (!model) return { provider: "openai", modelId: DEFAULT_IMAGE_MODEL };

  const explicit = parseProviderPrefix(model);
  if (explicit) return explicit;

  for (const [pattern, provider] of IMAGE_MODEL_PATTERNS) {
    if (pattern.test(model)) return { provider, modelId: model };
  }

  return { provider: "openai", modelId: model };
}
