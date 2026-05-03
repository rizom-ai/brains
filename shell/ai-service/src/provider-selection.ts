/**
 * Provider/model selection helpers.
 *
 * Pure functions — no SDK imports, no side effects.
 */
export interface ResolvedModelProvider {
  provider: string;
  modelId: string;
}

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
 * Parse explicit provider prefix from a model string.
 * "openai:gpt-4o-mini" → { provider: "openai", modelId: "gpt-4o-mini" }
 * "gpt-4o-mini" → null (no prefix)
 */
function parseProviderPrefix(model: string): ResolvedModelProvider | null {
  const colonIdx = model.indexOf(":");
  if (colonIdx > 0) {
    return {
      provider: model.slice(0, colonIdx),
      modelId: model.slice(colonIdx + 1),
    };
  }
  return null;
}

/**
 * Resolve both provider and SDK model ID for text generation.
 *
 * Supports:
 * - Auto-detection from model name: "gpt-4o-mini" → { provider: "openai", modelId: "gpt-4o-mini" }
 * - Explicit prefix: "openai:gpt-4o-mini" → { provider: "openai", modelId: "gpt-4o-mini" }
 */
export function resolveTextProvider(model: string): ResolvedModelProvider {
  const explicit = parseProviderPrefix(model);
  if (explicit) return explicit;

  for (const [pattern, provider] of MODEL_PATTERNS) {
    if (pattern.test(model)) return { provider, modelId: model };
  }

  return { provider: "anthropic", modelId: model };
}

/**
 * Select the text generation provider from a model string.
 *
 * Supports:
 * - Auto-detection from model name: "gpt-4o-mini" → "openai"
 * - Explicit prefix: "openai:gpt-4o-mini" → "openai"
 * - No model: defaults to "anthropic"
 */
export function selectTextProvider(model?: string): string {
  if (!model) return "anthropic";
  return resolveTextProvider(model).provider;
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
export function selectImageProvider(model?: string): ResolvedModelProvider {
  if (!model) return { provider: "openai", modelId: DEFAULT_IMAGE_MODEL };

  const explicit = parseProviderPrefix(model);
  if (explicit) return explicit;

  for (const [pattern, provider] of IMAGE_MODEL_PATTERNS) {
    if (pattern.test(model)) return { provider, modelId: model };
  }

  return { provider: "openai", modelId: model };
}

/**
 * Some providers/models reject temperature entirely.
 *
 * OpenAI reasoning models (gpt-5*, o*) currently warn or fail when
 * temperature is passed, so callers should omit it.
 */
export function supportsTemperature(model?: string): boolean {
  if (!model) return true;

  const { provider, modelId } = resolveTextProvider(model);

  if (provider !== "openai") {
    return true;
  }

  return !/^(gpt-5|o[1-9])(?:[.-]|$)/.test(modelId);
}
