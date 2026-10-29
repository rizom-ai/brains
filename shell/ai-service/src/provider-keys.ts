/**
 * Provider API key resolution.
 *
 * Each capability (chat, embeddings, images) names a model; the model picks
 * the provider, and the provider picks its key env var. Brains that use one
 * provider for everything therefore need a single key.
 *
 * Pure functions — no SDK imports, no side effects.
 */
import { selectImageProvider, selectTextProvider } from "./provider-selection";

/** Providers that take an API key. */
export type KeyProviderId = "openai" | "anthropic" | "google";

export interface KeyProvider {
  label: string;
  /** Env var holding the provider's API key. */
  envVar: string;
  /**
   * Key formats the provider issues. Recognition is an allowlist: a key is
   * the provider's only when it matches one of these.
   */
  keyFormats: readonly RegExp[];
}

/** Adding a provider is one id above and one entry here. */
export const KEY_PROVIDERS: Readonly<Record<KeyProviderId, KeyProvider>> = {
  openai: {
    label: "OpenAI",
    envVar: "OPENAI_API_KEY",
    keyFormats: [
      /^sk-(?:proj|svcacct|admin)-[\w-]+$/,
      // Legacy user keys: "sk-" and 48 alphanumerics.
      /^sk-[A-Za-z0-9]{48}$/,
    ],
  },
  anthropic: {
    label: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    keyFormats: [/^sk-ant-[\w-]+$/],
  },
  google: {
    label: "Google",
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    keyFormats: [/^AIza[\w-]{35}$/],
  },
};

export function isKeyProvider(provider: string): provider is KeyProviderId {
  return Object.hasOwn(KEY_PROVIDERS, provider);
}

export const KEY_PROVIDER_IDS: readonly KeyProviderId[] =
  Object.keys(KEY_PROVIDERS).filter(isKeyProvider);

/** Embeddings call this provider's API, with its key. */
export const EMBEDDING_PROVIDER: KeyProviderId = "openai";

/**
 * The only embedding model supported today. The index stores 1536-dimension
 * vectors without recording which model built them, so switching models
 * would silently mix vector spaces.
 */
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

/** Legacy single key, used for any provider whose own key is unset. */
export const LEGACY_API_KEY_ENV_VAR = "AI_API_KEY";
/** Legacy image key, used when the image provider's own key is unset. */
const LEGACY_IMAGE_KEY_ENV_VAR = "AI_IMAGE_KEY";

/**
 * Why a key cannot be the provider's, or undefined when it can. Names the
 * provider the key belongs to when its format gives it away.
 */
export function providerKeyError(
  provider: KeyProviderId,
  key: string,
): string | undefined {
  const matches = (candidate: KeyProvider): boolean =>
    candidate.keyFormats.some((format) => format.test(key));
  const expected = KEY_PROVIDERS[provider];
  if (matches(expected)) return undefined;
  const owner = Object.values(KEY_PROVIDERS).find(matches);
  return owner
    ? `Expected an API key for ${expected.label}, but this one is for ${owner.label}.`
    : `Expected an API key for ${expected.label}, but this is not one.`;
}

/**
 * Validate and normalize the embedding model. Accepts an optional provider
 * prefix; anything but the default model is a config error.
 */
export function resolveEmbeddingModel(model?: string): string {
  if (model === undefined) return DEFAULT_EMBEDDING_MODEL;
  const prefix = `${EMBEDDING_PROVIDER}:`;
  const modelId = model.startsWith(prefix) ? model.slice(prefix.length) : model;
  if (modelId !== DEFAULT_EMBEDDING_MODEL) {
    throw new Error(
      `Unsupported embeddingModel "${model}": only "${DEFAULT_EMBEDDING_MODEL}" (${KEY_PROVIDERS[EMBEDDING_PROVIDER].label}) is supported`,
    );
  }
  return modelId;
}

export interface AIModelSelection {
  /** Chat model, e.g. "gpt-6-luna", "claude-sonnet-5-5" */
  model?: string | undefined;
  /** Image model, e.g. "gpt-image-1.5", "gemini-3-pro-image-preview" */
  imageModel?: string | undefined;
}

export interface CapabilityKey {
  provider: string;
  /** The provider's own key env var; undefined for providers without one. */
  envVar: string | undefined;
  /** Resolved value, falling back to the legacy env vars. */
  value: string | undefined;
  /** Env var the value came from. */
  source: string | undefined;
}

type Env = Record<string, string | undefined>;

/** Resolve the provider and key for each AI capability. */
export function resolveCapabilityKeys(
  env: Env,
  selection: AIModelSelection,
): Record<"chat" | "embeddings" | "images", CapabilityKey> {
  /** An env var's trimmed value; undefined when unset or blank. */
  const read = (name: string | undefined): string | undefined => {
    const value = name === undefined ? undefined : env[name]?.trim();
    return value === "" ? undefined : value;
  };
  const keyFor = (
    provider: string,
    fallbacks: string[] = [LEGACY_API_KEY_ENV_VAR],
  ): CapabilityKey => {
    const envVar = isKeyProvider(provider)
      ? KEY_PROVIDERS[provider].envVar
      : undefined;
    const source = [envVar, ...fallbacks].find(read);
    return { provider, envVar, value: read(source), source };
  };

  return {
    chat: keyFor(selectTextProvider(selection.model)),
    embeddings: keyFor(EMBEDDING_PROVIDER),
    images: keyFor(selectImageProvider(selection.imageModel).provider, [
      LEGACY_IMAGE_KEY_ENV_VAR,
      LEGACY_API_KEY_ENV_VAR,
    ]),
  };
}
