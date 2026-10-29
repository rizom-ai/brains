import {
  EMBEDDING_PROVIDER,
  KEY_PROVIDERS,
  LEGACY_API_KEY_ENV_VAR,
  providerKeyError,
  resolveCapabilityKeys,
  type AIModelSelection,
} from "@brains/ai-service/provider-keys";

interface PreflightResult {
  ok: boolean;
  message?: string;
}

const MIN_BUN_VERSION = "1.3.3";

/**
 * Check that the providers behind the chat and embedding models have keys.
 * Image generation is optional, so a missing image key does not block boot.
 */
export function checkApiKey(
  env: Record<string, string | undefined>,
  selection: AIModelSelection & { embeddingsEnabled?: boolean } = {},
): PreflightResult {
  const keys = resolveCapabilityKeys(env, selection);
  const embeddings = selection.embeddingsEnabled !== false;
  const { value: embeddingKey, source } = keys.embeddings;
  const keyError =
    embeddings && embeddingKey
      ? providerKeyError(EMBEDDING_PROVIDER, embeddingKey)
      : undefined;
  if (keyError) {
    const { envVar } = KEY_PROVIDERS[EMBEDDING_PROVIDER];
    return {
      ok: false,
      message: `Embeddings: ${keyError} (from ${source}) Add to your .env file:\n\n  ${envVar}=your-api-key-here\n`,
    };
  }
  const required = [keys.chat, ...(embeddings ? [keys.embeddings] : [])];
  const missing = [
    ...new Set(
      required
        .filter((key) => !key.value)
        .map((key) => key.envVar ?? LEGACY_API_KEY_ENV_VAR),
    ),
  ];
  if (missing.length > 0) {
    const lines = missing.map((name) => `  ${name}=your-api-key-here`);
    return {
      ok: false,
      message: `${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} not set. Add to your .env file:\n\n${lines.join("\n")}\n`,
    };
  }
  return { ok: true };
}

/**
 * Check that Bun version meets minimum requirement.
 */
export function checkBunVersion(version: string): PreflightResult {
  const [major, minor, patch] = version.split(".").map(Number);
  const [minMajor, minMinor, minPatch] = MIN_BUN_VERSION.split(".").map(Number);

  const current = (major ?? 0) * 10000 + (minor ?? 0) * 100 + (patch ?? 0);
  const minimum =
    (minMajor ?? 0) * 10000 + (minMinor ?? 0) * 100 + (minPatch ?? 0);

  if (current < minimum) {
    return {
      ok: false,
      message: `Bun ${MIN_BUN_VERSION} or later is required (found ${version}). Update: curl -fsSL https://bun.sh/install | bash`,
    };
  }
  return { ok: true };
}
