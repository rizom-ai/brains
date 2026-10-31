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
  [/^llama/, "local"],
  [/^mistral/, "local"],
  [/^phi-/, "local"],
  [/^qwen/, "local"],
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

/** Text providers the brain has a client for. */
const TEXT_PROVIDERS: ReadonlySet<string> = new Set([
  "anthropic",
  "openai",
  "google",
]);

/**
 * Whether a text model resolves to a provider the brain can call. An unknown
 * provider is a config error, never a silent fallback to Anthropic.
 */
export function isSupportedTextModel(model: string): boolean {
  return TEXT_PROVIDERS.has(resolveTextProvider(model).provider);
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
 * Embedding model patterns → provider auto-detection.
 */
const EMBEDDING_MODEL_PATTERNS: Array<[RegExp, string]> = [
  [/^text-embedding-/, "openai"],
  [/^embeddinggemma/, "local"],
];

/**
 * Resolve the provider and SDK model ID of an embedding model; null when a
 * bare name matches no known provider. Known names match first: a runtime's
 * model tags carry colons ("embeddinggemma-2:270m") that are not prefixes.
 */
export function resolveEmbeddingProvider(
  model: string,
): ResolvedModelProvider | null {
  for (const [pattern, provider] of EMBEDDING_MODEL_PATTERNS) {
    if (pattern.test(model)) return { provider, modelId: model };
  }

  return parseProviderPrefix(model);
}

const NO_TEMPERATURE_PATTERN = /^(gpt-(?:5|6)|o[1-9])(?:[.-]|$)/;

function resolvedSupportsTemperature(resolved: ResolvedModelProvider): boolean {
  if (resolved.provider !== "openai") return true;
  return !NO_TEMPERATURE_PATTERN.test(resolved.modelId);
}

/**
 * Some providers/models reject temperature entirely.
 *
 * OpenAI reasoning models (gpt-5*, gpt-6*, o*) currently warn or fail when
 * temperature is passed, so callers should omit it.
 */
export function supportsTemperature(model?: string): boolean {
  if (!model) return true;
  return resolvedSupportsTemperature(resolveTextProvider(model));
}

export interface TextModelCapabilities {
  provider: string;
  supportsTemperature: boolean;
}

/**
 * Avoids running the model-pattern regex twice when both fields are needed.
 */
export function resolveTextModelCapabilities(
  model?: string,
): TextModelCapabilities {
  if (!model) {
    return { provider: "anthropic", supportsTemperature: true };
  }
  const resolved = resolveTextProvider(model);
  return {
    provider: resolved.provider,
    supportsTemperature: resolvedSupportsTemperature(resolved),
  };
}
